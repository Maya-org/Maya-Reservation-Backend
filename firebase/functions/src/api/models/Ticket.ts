import {TicketType, ticketTypeFromDocument} from "./TicketType";
import {eventFromDoc, ReservableEvent} from "./ReservableEvent";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;
import {newRandomID, ReferenceCollection} from "../../ReferenceCollection";

export type Ticket = {
  ticket_id: string;
  ticket_type: TicketType;
  event: ReservableEvent;
}

export function ticketByID(collection: ReferenceCollection, ticket_id: string): Promise<Ticket | null> {
  return ticketFromRef(collection.ticketsCollection.doc(ticket_id));
}

export async function ticketFromRef(ref: DocumentReference): Promise<Ticket | null> {
  const data = await ref.get();
  const event_ref = data.get("event");
  const type_ref = data.get("type");

  const event = await eventFromDoc(await event_ref.get());
  const type = await ticketTypeFromDocument(await type_ref.get());

  if (event === null || type === null) {
    return null;
  }

  return {
    ticket_id: ref.id,
    ticket_type: type,
    event: event
  }
}

/**
 * Creates a new ticket.
 * @param collection
 * @param ticket
 * @param event
 *
 * @returns The ticket ID.
 */
export async function registerTicketsToCollection(collection: ReferenceCollection, ticket: TicketType, event: ReservableEvent): Promise<string> {
  const id: string = await newRandomID(collection.ticketsCollection);
  await collection.ticketsCollection.doc(id).set({
    type: collection.ticketTypesCollection.doc(ticket.ticket_type_id),
    event: collection.eventsCollection.doc(event.event_id)
  });

  return id;
}

/**
 * チケットを削除(丁寧に扱え)
 * @param collection
 * @param ticket
 */
export async function deleteTicketsFromCollection(collection:ReferenceCollection,ticket:Ticket):Promise<void>{
  await collection.ticketsCollection.doc(ticket.ticket_id).delete();
}