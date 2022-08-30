import {firestore} from "firebase-admin";
import DocumentSnapshot = firestore.DocumentSnapshot;
import {safeAsReference, safeGet} from "../../SafeAs";
import DocumentReference = firestore.DocumentReference;
import {eventByID, eventFromDoc, ReservableEvent} from "./ReservableEvent";
import {TicketType, ticketTypeByID} from "./TicketType";
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {Ticket, ticketFromRef} from "./Ticket";
import {newRandomID, ReferenceCollection} from "../../ReferenceCollection";
import {any, errorGCP} from "../../util";


export type Reservation = {
  reservation_id: string;
  event: ReservableEvent;
  tickets: Ticket[];
}

export type ReserveRequest = {
  reservation_id: string;
  event: ReservableEvent;
  ticket_types: TicketType[];
  two_factor_key?: string;
}

export async function reservationFromDocument(document: DocumentSnapshot): Promise<Reservation | null> {
  const eventRef: DocumentReference | undefined = safeAsReference(document.get("event"));
  const ticketsRefAny: any = document.get("tickets");
  if (!ticketsRefAny || !Array.isArray(ticketsRefAny)) {
    errorGCP("Returning Null in ReservationFromDocument: tickets is not pointing an array");
    return null;
  }
  const ticketsRef: (DocumentReference | undefined)[] = ticketsRefAny.map(ref => safeAsReference(ref));

  if (eventRef === undefined || any(ticketsRef, ref => ref === undefined)) {
    errorGCP("Returning Null in ReservationFromDocument: eventRef or ticketsRef is not a reference");
    return null;
  }

  const event = await eventFromDoc(await eventRef.get());
  const tickets: (Ticket | null)[] = await Promise.all(ticketsRef.map(async ref => ticketFromRef(ref as DocumentReference)));

  if (event === null || any(tickets, t => t === null)) {
    errorGCP("Returning Null in ReservationFromDocument: event or tickets is null");
    return null;
  }

  return {
    reservation_id: document.id,
    event: event,
    tickets: tickets as Ticket[]  // Checked above
  }
}

export async function reservationRequestFromRequestBody(jsonBody: { [name: string]: any }, collection: ReferenceCollection): Promise<ReserveRequest | null> {
  const event_id: string | undefined = safeGet(jsonBody, "event_id");
  const two_factor_key: string | undefined = safeGet(jsonBody, "two_factor_key");
  const ticketsObj: any | undefined = safeGet(jsonBody, "tickets");
  if (event_id === undefined || ticketsObj === undefined || !Array.isArray(ticketsObj)) {
    return null;
  }

  const event = await eventByID(collection, event_id);
  const ticket_type_ids = ticketsObj.map(ticket => ticket["ticket_type_id"]);
  const tickets: (TicketType | null)[] = await Promise.all(ticket_type_ids.map(async ticket_type_id => {
    return ticketTypeByID(collection, ticket_type_id)
  }));
  if (any(tickets, ticket => ticket === null) || event === null) {
    return null;
  }

  const reservation_id = await newRandomID(collection.reservationsCollection);

  if (two_factor_key !== undefined) {
    return {
      reservation_id: reservation_id,
      event: event,
      ticket_types: tickets as TicketType[],
      two_factor_key: two_factor_key
    }
  } else {
    return {
      reservation_id: reservation_id,
      event: event,
      ticket_types: tickets as TicketType[], // Checked above
    }
  }
}

export async function reservationToCollection(reservation: Reservation, user: UserRecord, collection: ReferenceCollection): Promise<void> {
  const doc = collection.reservationsCollection.doc(user.uid).collection("reservations").doc(reservation.reservation_id);
  const eventRef = collection.eventsCollection.doc(reservation.event.event_id);

  const ticket_refs: DocumentReference[] = reservation.tickets.map(ticket => {
    return collection.ticketsCollection.doc(ticket.ticket_id);
  });

  await doc.set({
    event: eventRef,
    tickets: ticket_refs
  });
}

export async function cancelReservationFromCollection(user: UserRecord, reservation_id: string, collection: ReferenceCollection): Promise<boolean> {
  let doc = collection.reservationsCollection.doc(user.uid).collection("reservations").doc(reservation_id);
  if ((await doc.get()).exists) {
    await doc.delete();
    return true;
  }
  return false;
}

export async function reservationByID(collection: ReferenceCollection, user_id: string, reservation_id: string): Promise<Reservation | null> {
  return reservationFromDocument(await collection.reservationsCollection.doc(user_id).collection("reservations").doc(reservation_id).get());
}