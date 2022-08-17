import {TicketType, ticketTypeFromDocument} from "./TicketType";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;
import {any} from "../../util";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {ReferenceCollection} from "../../ReferenceCollection";

export type Room = {
  capacity: number,
  room_id: string,
  display_name: string,
  permitted_tickets: TicketType[]
}

export async function roomById(collection:ReferenceCollection, room_id: string): Promise<Room | null> {
  const ref = collection.roomsCollection.doc(room_id);
  return roomFromObj(room_id, await ref.get())
}

export async function roomFromObj(room_id: string, obj: DocumentSnapshot): Promise<Room | null> {
  const capacity = obj.get("capacity");
  const display_name = obj.get("display_name");
  const permitted_tickets_refs: DocumentReference[] = obj.get("permitted_tickets");
  const permitted_tickets: Awaited<TicketType | null>[] = await Promise.all(permitted_tickets_refs.map(async ticket_ref => ticketTypeFromDocument(await ticket_ref.get())));

  if (any(permitted_tickets, (it) => {
    return it == null
  })) {
    return null;
  }

  return {
    capacity,
    room_id,
    display_name,
    // @ts-ignore checked above
    permitted_tickets
  }
}

export function isEnterable(room:Room,ticket:TicketType):boolean{
  return room.permitted_tickets.some(it=>it.ticket_type_id==ticket.ticket_type_id);
}