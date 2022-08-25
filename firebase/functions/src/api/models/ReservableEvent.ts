import {firestore} from "firebase-admin";
import {safeAsBoolean, safeAsNumber, safeAsReference, safeAsString, safeAsTimeStamp} from "../../SafeAs";
import DocumentSnapshot = firestore.DocumentSnapshot;
import DocumentReference = firestore.DocumentReference;
import Firestore = firestore.Firestore;
import {Reservation, reservationFromDocument, reservationToCollection, ReserveRequest} from "./Reservation";
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {TicketType, ticketTypeFromDocument} from "./TicketType";
import {ReferenceCollection} from "../../ReferenceCollection";
import {errorGCP, headCount, sumAll} from "../../util";
import {registerTicketsToCollection, Ticket} from "./Ticket";
import Timestamp = firestore.Timestamp;

export type ReservableEvent = {
  event_id: string;
  display_name: string;
  description?: string;

  date_start: Timestamp;
  date_end?: Timestamp;
  available_at?: Timestamp;

  capacity?: number;
  taken_capacity: number;
  required_reservation?: ReservableEvent;

  reservable_ticket_type: TicketType[];
  require_two_factor: boolean;

  maximum_reservations_per_user?: number;
}

export async function eventFromDoc(doc: DocumentSnapshot): Promise<ReservableEvent | null> {
  if (doc.exists) {
    // Eventが存在する場合
    const event_id = doc.ref.id;
    const display_name = safeAsString(doc.get("display_name"));
    const description = safeAsString(doc.get("description"));
    const date_start = safeAsTimeStamp(doc.get("date_start"));
    const date_end = safeAsTimeStamp(doc.get("date_end"));
    const available_at = safeAsTimeStamp(doc.get("available_at"));
    const capacity = safeAsNumber(doc.get("capacity"));
    const taken_capacity = safeAsNumber(doc.get("taken_capacity"));
    const required_reservation_ref = safeAsReference(doc.get("required_reservation"));
    let required_reservation: ReservableEvent | undefined = undefined;
    if (required_reservation_ref !== undefined) {
      let r = await eventFromDoc(await required_reservation_ref.get());
      if (r !== null) {
        required_reservation = r;
      } else {
        required_reservation = undefined;
      }
    }
    const ticket_types = (doc.get("ticket_type") as any[]).map(ref => safeAsReference(ref)).filter(ref => ref !== undefined) as DocumentReference[];
    const reservable_ticket_type = (await (Promise.all(ticket_types.map(async ref => ticketTypeFromDocument(await ref.get()))))).filter(type => type !== null) as TicketType[];
    const require_two_factor = safeAsBoolean(doc.get("require_two_factor"));

    if (display_name === undefined || date_start === undefined || reservable_ticket_type.length === 0 || require_two_factor === undefined || taken_capacity === undefined) {
      errorGCP("in eventFromDoc, returns null # display_name || date_start || reservable_ticket_type.length === 0 || require_two_factor === undefined || taken_capacity === undefined", "path", doc.ref.path, "display_name", display_name, "date_start", date_start, "reservable_ticket_type.length", reservable_ticket_type.length, "require_two_factor", require_two_factor, "taken_capacity", taken_capacity);
      return null;
    }

    const maximum_reservations_per_user = safeAsNumber(doc.get("maximum_reservations_per_user"));


    return {
      event_id,
      display_name,
      description,
      date_start,
      date_end,
      available_at,
      capacity,
      taken_capacity,
      required_reservation,
      reservable_ticket_type,
      require_two_factor,
      maximum_reservations_per_user: maximum_reservations_per_user
    }
  }

  return null;
}

export async function eventByID(collection: ReferenceCollection, event_id: string): Promise<ReservableEvent | null> {
  return eventFromDoc(await collection.eventsCollection.doc(event_id).get());
}

/**
 * 実際に予約処理をする(人数の変更だけ)
 * @param db
 * @param collection
 * @param user
 * @param reservationRequest
 */
export async function reserveEvent(db: Firestore, collection: ReferenceCollection, user: UserRecord, reservationRequest: ReserveRequest): Promise<ReservationStatus> {
  if (reservationRequest.event.available_at != null && Timestamp.now().toMillis() < reservationRequest.event.available_at.toMillis() || // 予約可能機関にまだ入っていない
    reservationRequest.event.date_start.toMillis() < Timestamp.now().toMillis()  // イベントがもうすでに開始している
  ) {
    // 予約可能期間外
    return ReservationStatus.NOT_AVAILABLE;
  }


  if (sumAll(reservationRequest.ticket_types.map(ticket => ticket.reservable_group.headcount)) < 1) {
    // 人数が1人未満の場合は予約できない
    return ReservationStatus.INVALID_GROUP;
  }

  const ticket_two_factor_key = await getTwoFactorKey(collection, reservationRequest.event)
  if (ticket_two_factor_key != undefined) {
    // 2FAが必要な場合
    if (ticket_two_factor_key !== reservationRequest.two_factor_key) {
      return ReservationStatus.INVALID_TWO_FACTOR_KEY;
    }
  }

  // Check if the user is already reserved the event
  let docReference = await collection.reservationsCollection.doc(user.uid).collection("reservations").get()
  const reservations = (await Promise.all(docReference.docs.map(async doc => {
    return reservationFromDocument(doc);
  }))).filter(ev => ev !== null) as Reservation[];
  const sameEventReservation = reservations.find(rv => rv.event.event_id === reservationRequest.event.event_id);
  if (sameEventReservation !== undefined) {
    // Already reserved
    return ReservationStatus.ALREADY_RESERVED;
  }
  if (reservationRequest.event.required_reservation != null) {
    // Check if the user is reserved the required event
    const requiredReservation = reservations.filter(rv => rv.event.event_id === reservationRequest.event.required_reservation!.event_id);
    if (requiredReservation.length === 0) {
      // Not reserved the required event
      return ReservationStatus.NOT_RESERVED_REQUIRED_EVENT;
    }
  }

  // Check if the event is available and update the taken_capacity
  const result = await addTakenCapacity(db, collection, reservationRequest.event, headCount(reservationRequest.ticket_types));
  if (result === ReservationStatus.RESERVED) {
    // Register Tickets
    const reserved_tickets: Ticket[] = await Promise.all(reservationRequest.ticket_types.map(async ticketType => {
      const ticket_id = await registerTicketsToCollection(collection, ticketType, reservationRequest.event);
      return {
        ticket_id: ticket_id,
        ticket_type: ticketType,
        event: reservationRequest.event
      }
    }));

    // Register Reservation
    await reservationToCollection({
      reservation_id: reservationRequest.reservation_id,
      event: reservationRequest.event,
      tickets: reserved_tickets,
    }, user, collection)

    return ReservationStatus.RESERVED;
  }
  return result;
}

export enum ReservationStatus {
  RESERVED,
  CAPACITY_OVER,
  EVENT_NOT_FOUND,
  TRANSACTION_FAILED,
  ALREADY_RESERVED,
  INVALID_GROUP,
  INVALID_TICKET_TYPE,
  INVALID_TWO_FACTOR_KEY,
  NOT_AVAILABLE,
  NOT_RESERVED_REQUIRED_EVENT
}

/**
 * increment the taken_capacity of the event
 * @param db
 * @param collection
 * @param event
 * @param toAdd
 */
export async function addTakenCapacity(db: Firestore, collection: ReferenceCollection, event: ReservableEvent, toAdd: number): Promise<ReservationStatus> {
  try {
    return await db.runTransaction(async (t) => {
      const ref = collection.eventsCollection.doc(event.event_id);
      const data = await ref.get();
      const new_taken_capacity = Math.max(data.get("taken_capacity") as number + toAdd, 0); // TODO should be error when the value is less than 0
      const capacity: number | undefined = safeAsNumber(data.get("capacity"));
      if (data.exists) {
        if (capacity !== undefined) {
          // 予約上限がある場合
          if (new_taken_capacity <= capacity) {
            // 予約可能
            t.update(ref, {
              taken_capacity: new_taken_capacity
            });
            return ReservationStatus.RESERVED;
          } else {
            // 定員オーバー
            return ReservationStatus.CAPACITY_OVER;
          }
        } else {
          // 予約上限がない場合
          t.update(ref, {
            taken_capacity: new_taken_capacity
          });
          return ReservationStatus.RESERVED;
        }
      } else {
        // イベントが存在しない
        return ReservationStatus.EVENT_NOT_FOUND;
      }
    });
  } catch (e) {
    // トランザクション失敗
    return ReservationStatus.TRANSACTION_FAILED;
  }
}

export async function getTwoFactorKey(collection: ReferenceCollection, event: ReservableEvent): Promise<string | null> {
  return getTwoFactorKeyByRef(collection.eventsCollection.doc(event.event_id));
}

export async function getTwoFactorKeyByRef(event_ref: DocumentReference): Promise<string | null> {
  const data = await event_ref.get();
  const two_factor_key = safeAsString(data.get("two_factor_key"));
  if (two_factor_key === undefined) {
    return null;
  }
  return two_factor_key;
}