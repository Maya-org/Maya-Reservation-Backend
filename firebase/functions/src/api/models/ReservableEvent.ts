import {database, firestore} from "firebase-admin";
import {safeAsNumber, safeAsReference, safeAsString} from "../../SafeAs";
import Reference = database.Reference;
import DocumentSnapshot = firestore.DocumentSnapshot;

export type ReservableEvent = {
  event_id: number;
  display_name: string;
  description?: string;

  date_start: string;
  date_end?: string;
  available_at?: string;

  capacity?: number;
  taken_capacity: number;
  reservations: Reference[];
  required_reservation?: Reference;
}

export function eventFromDoc(doc:DocumentSnapshot): ReservableEvent | null {
  if (doc.exists) {
    // Eventが存在する場合
    const event_id = doc.get("event_id") as number;
    const display_name = doc.get("display_name") as string;
    const description = safeAsString(doc.get("description"));
    const date_start = doc.get("date_start") as string;
    const date_end = safeAsString(doc.get("date_end"));
    const available_at = safeAsString(doc.get("available_at"));
    const capacity = safeAsNumber(doc.get("capacity"));
    const taken_capacity = doc.get("taken_capacity") as number;
    const reservations = (doc.get("reservations") as Reference[]);
    const required_reservation = safeAsReference(doc.get("required_reservation"));

    return {
      event_id,
      display_name,
      description,
      date_start,
      date_end,
      available_at,
      capacity,
      taken_capacity,
      reservations,
      required_reservation
    }
  }

  return null;
}

