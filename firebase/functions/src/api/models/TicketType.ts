import {Group, groupFromStrings, isSameGroup} from "./Group";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {safeAsString} from "../../SafeAs";
import {ReferenceCollection} from "../../ReferenceCollection";
import {errorGCP} from "../../util";

export type TicketType = {
  ticket_type_id: string;
  reservable_group: Group;
  display_ticket_name: string;
  display_ticket_description?: string;
}

export function isAssignable(ticket: TicketType, group: Group): boolean {
  return isSameGroup(ticket.reservable_group, group);
}

/**
 * ticketsコレクションの真下のドキュメントからTicketTypeを作成する
 * @param document
 */
export async function ticketTypeFromDocument(document: DocumentSnapshot): Promise<TicketType | null> {
  const ticket_type_id = document.id;
  const display_ticket_name = safeAsString(document.get("display_ticket_name"));
  const display_ticket_description = safeAsString(document.get("display_ticket_description"));
  const reservable_group_data: string[] | undefined = document.get("reservable_group"); // undefinable
  if (display_ticket_name === undefined || reservable_group_data === undefined) {
    errorGCP("in ticketTypeFromDocument, returns null # display_ticket_name || reservable_group_data", "path", document.ref.path);
    return null;
  }
  const reservable_group = groupFromStrings(reservable_group_data);
  if (reservable_group === null) {
    errorGCP("in ticketTypeFromDocument, returns null # reservable_group", "path", document.ref.path);
    return null;
  }


  return {
    ticket_type_id: ticket_type_id,
    reservable_group: reservable_group,
    display_ticket_name: display_ticket_name,
    display_ticket_description: display_ticket_description,
  }
}

export async function ticketTypeByID(collection: ReferenceCollection, ticket_type_id: string): Promise<TicketType | null> {
  return ticketTypeFromDocument(await collection.ticketTypesCollection.doc(ticket_type_id).get());
}