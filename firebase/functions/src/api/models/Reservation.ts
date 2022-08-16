import {firestore} from "firebase-admin";
import DocumentSnapshot = firestore.DocumentSnapshot;
import {Group, groupFromObject} from "./Group";
import {safeAsReference, safeGet} from "../../SafeAs";
import {Request} from "firebase-functions";
import DocumentReference = firestore.DocumentReference;
import CollectionReference = firestore.CollectionReference;
import {eventFromDoc, ReservableEvent} from "./ReservableEvent";
import {v4 as uuidv4} from "uuid";
import {TicketType, ticketTypeFromDocument} from "./TicketType";
import {UserRecord} from "firebase-admin/lib/auth/user-record";


export type Reservation = {
  reservation_id: string;
  event: ReservableEvent;
  member_all?: number;
  group_data: Group;
  reserved_ticket_type: TicketType;
  two_factor_key?: string;
}

export async function reservationFromDocument(document: DocumentSnapshot): Promise<Reservation | null> {
  let eventRef: DocumentReference | undefined = safeAsReference(document.get("event"));
  let group_data: Group | null = await groupFromObject(document.get("group_data"));
  const ticket_type_ref: FirebaseFirestore.DocumentReference | undefined = safeAsReference(document.get("ticket_type_id"));
  if (eventRef === undefined || group_data === null || ticket_type_ref === undefined) {
    return null;
  }

  const ticket_type = await ticketTypeFromDocument(await ticket_type_ref.get());
  if (ticket_type === null) {
    return null;
  }

  let event: ReservableEvent | null = await eventFromDoc(await eventRef.get());
  if (event !== null) {
    return {
      reservation_id: document.ref.id,
      event,
      member_all: group_data.headcount,
      group_data,
      reserved_ticket_type: ticket_type
    }
  } else {
    return null;
  }
}

export async function reservationFromRequestBody(req: Request, eventsCollection: CollectionReference, ticketCollection: CollectionReference): Promise<Reservation | null> {
  let jsonBody;
  try {
    jsonBody = JSON.parse(req.body);
  } catch (e) {
    return null;
  }

  let event_id = safeGet(jsonBody, "event_id")
  let group_data: Group | null = groupFromObject(safeGet(jsonBody, "group"));
  let ticket_type_id = safeGet(jsonBody, "ticket_type_id");

  if (event_id === undefined || group_data === null || ticket_type_id === undefined) {
    console.log("event_id, group_data, ticket_type_id is undefined,", "event_id:", event_id, "group_data:", group_data, "ticket_type_id:", ticket_type_id);
    return null;
  }

  let ref: DocumentReference = eventsCollection.doc(event_id);
  let event = await eventFromDoc(await ref.get());

  if (event === null) {
    console.log("event is null");
    return null;
  }

  let ticket_type = await ticketTypeFromDocument(await ticketCollection.doc(ticket_type_id).get());

  if (ticket_type === null) {
    console.log("ticket_type is null");
    return null;
  }
  let two_factor_key: string | undefined = safeGet(jsonBody, "two_factor_key");
  let reservation_id: string = uuidv4();

  return {
    reservation_id: reservation_id,
    event,
    member_all: group_data.headcount,
    group_data,
    reserved_ticket_type: ticket_type,
    two_factor_key
  }
}

export async function reservationToCollection(reservation: Reservation, user: UserRecord, reservationCollection: CollectionReference, eventCollection: CollectionReference, ticketCollection: CollectionReference): Promise<boolean> {
  let doc = reservationCollection.doc(user.uid).collection("reservations").doc(reservation.reservation_id);

  let eventRef = eventCollection.doc(reservation.event.event_id);
  let ticket_type_ref = ticketCollection.doc(reservation.reserved_ticket_type.ticket_type_id);
  if ((await eventRef.get()).exists) {
    await doc.set({
      event: eventRef,
      group_data: reservation.group_data,
      ticket_type_id: ticket_type_ref
    })
    return true;
  } else {
    return false;
  }
}

export async function cancelReservationFromCollection(user: UserRecord, reservation_id: string, reservationCollection: CollectionReference): Promise<boolean> {
  let doc = reservationCollection.doc(user.uid).collection("reservations").doc(reservation_id);
  if ((await doc.get()).exists) {
    await doc.delete();
    return true;
  }
  return false;
}