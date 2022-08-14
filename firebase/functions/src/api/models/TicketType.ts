import {Group, groupFromObject, isSameGroup} from "./Group";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {safeAsBoolean, safeAsString} from "../../SafeAs";
import {any} from "../../util";

export type TicketType = {
  ticket_type_id: string;
  reservable_group: Group[];
  display_ticket_name: string;
  display_ticket_description?: string;
  require_two_factor: boolean;
}

export function isAssignable(ticket: TicketType, group: Group): boolean {
  return any(ticket.reservable_group, g => isSameGroup(g, group));
}

/**
 * ticketsコレクションの真下のドキュメントからTicketTypeを作成する
 * @param document
 */
export async function ticketTypeFromDocument(document: DocumentSnapshot): Promise<TicketType | null> {
  const ticket_type_id = document.id;
  const display_ticket_name = safeAsString(document.get("display_ticket_name"));
  const display_ticket_description = safeAsString(document.get("display_ticket_description"));
  const require_two_factor = safeAsBoolean(document.get("require_two_factor"));
  let reservable_group: Group[] = [];

  for(const key in Object.keys(document.get("reservable_group"))){
    const group = groupFromObject(document.get("reservable_group")[key]);
    if(group !== null){
      reservable_group.push(group);
    }
  }

  if (reservable_group === []) {
    // reservable_groupが空の場合はnullを返す
    return null;
  }

  if (display_ticket_name === undefined || require_two_factor === undefined) {
    return null;
  }

  return {
    ticket_type_id: ticket_type_id,
    reservable_group: reservable_group,
    display_ticket_name: display_ticket_name,
    display_ticket_description: display_ticket_description,
    require_two_factor: require_two_factor
  }
}