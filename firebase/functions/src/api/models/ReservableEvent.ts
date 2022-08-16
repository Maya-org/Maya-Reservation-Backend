import {firestore} from "firebase-admin";
import {safeAsNumber, safeAsReference, safeAsString} from "../../SafeAs";
import {Group} from "./Group";
import DocumentSnapshot = firestore.DocumentSnapshot;
import DocumentReference = firestore.DocumentReference;
import CollectionReference = firestore.CollectionReference;
import Firestore = firestore.Firestore;
import {Reservation, reservationFromDocument} from "./Reservation";
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {getTwoFactorKey, isAssignable, TicketType, ticketTypeFromDocument} from "./TicketType";

export type ReservableEvent = {
  event_id: string;
  display_name: string;
  description?: string;

  date_start: string;
  date_end?: string;
  available_at?: string;

  capacity?: number;
  taken_capacity: number;
  required_reservation?: ReservableEvent;

  reservable_ticket_type: TicketType[];
}

export async function eventFromDoc(doc: DocumentSnapshot): Promise<ReservableEvent | null> {
  if (doc.exists) {
    // Eventが存在する場合
    const event_id = doc.ref.id;
    const display_name = doc.get("display_name") as string;
    const description = safeAsString(doc.get("description"));
    const date_start = doc.get("date_start") as string;
    const date_end = safeAsString(doc.get("date_end"));
    const available_at = safeAsString(doc.get("available_at"));
    const capacity = safeAsNumber(doc.get("capacity"));
    const taken_capacity = doc.get("taken_capacity") as number;
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
    const ticket_types = (doc.get("ticket_type") as string[]).map(ref => safeAsReference(ref)).filter(ref => ref !== undefined) as DocumentReference[];
    const reservable_ticket_type = (await (Promise.all(ticket_types.map(async ref => ticketTypeFromDocument(await ref.get()))))).filter(type => type !== null) as TicketType[];

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
      reservable_ticket_type
    }
  }

  return null;
}

/**
 * 実際に予約処理をする(人数の変更だけ)
 * @param db
 * @param reservationsCollection
 * @param eventsCollection
 * @param ticketCollection
 * @param user
 * @param event
 * @param group
 * @param ticket_type_id
 */
export async function reserveEvent(db: Firestore, reservationsCollection: CollectionReference, eventsCollection: CollectionReference,ticketCollection:CollectionReference, user: UserRecord, event: ReservableEvent, group: Group, ticket_type_id: string,two_factor_key:string | undefined): Promise<ReservationStatus> {
  if (group.headcount < 1) {
    // 人数が1人未満の場合は予約できない
    return ReservationStatus.INVALID_GROUP;
  }

  const ticketType = await ticketTypeFromDocument(await ticketCollection.doc(ticket_type_id).get());

  if (ticketType === null) {
    return ReservationStatus.INVALID_TICKET_TYPE;
  }

  if (!isAssignable(ticketType, group)) {
    return ReservationStatus.INVALID_TICKET_TYPE; // 予約できないチケットタイプ
  }

  const ticket_two_factor_key = await getTwoFactorKey(ticketCollection,ticketType)
  if(ticket_two_factor_key != undefined){
    // 2FAが必要な場合
    if(ticket_two_factor_key !== two_factor_key){
      return ReservationStatus.INVALID_TWO_FACTOR_KEY;
    }
  }

  // TODO Check if user is reserved the required event

  // Check if the user is already reserved at same group data
  let docReference = await reservationsCollection.doc(user.uid).collection("reservations").get()
  const reservations = (await Promise.all(docReference.docs.map(async doc => {
    return reservationFromDocument(doc);
  }))).filter(ev => ev !== null) as Reservation[];
  const reservation = reservations.find(rv => rv.event.event_id === event.event_id);
  if (reservation !== undefined) {
    // Already reserved
    return ReservationStatus.ALREADY_RESERVED;
  }

  // Check if the event is available and update the taken_capacity
  return addTakenCapacity(db, eventsCollection, event, group.headcount);
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
}

/**
 * increment the taken_capacity of the event
 * @param db
 * @param eventsCollection
 * @param event
 * @param toAdd
 */
export async function addTakenCapacity(db: Firestore, eventsCollection: CollectionReference, event: ReservableEvent, toAdd: number): Promise<ReservationStatus> {
  try {
    return await db.runTransaction(async (t) => {
      const ref = eventsCollection.doc(event.event_id);
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