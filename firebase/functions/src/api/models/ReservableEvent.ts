import {firestore} from "firebase-admin";
import {safeAsNumber, safeAsReference, safeAsString} from "../../SafeAs";
import {Group} from "./Group";
import DocumentSnapshot = firestore.DocumentSnapshot;
import DocumentReference = firestore.DocumentReference;
import CollectionReference = firestore.CollectionReference;
import Firestore = firestore.Firestore;
import {Reservation, reservationFromDocument} from "./Reservation";
import {UserRecord} from "firebase-admin/lib/auth/user-record";

export type ReservableEvent = {
  event_id: string;
  display_name: string;
  description?: string;

  date_start: string;
  date_end?: string;
  available_at?: string;

  capacity?: number;
  taken_capacity: number;
  reservations: DocumentReference[];
  required_reservation?: DocumentReference;
}

export function eventFromDoc(doc: DocumentSnapshot): ReservableEvent | null {
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
    const reservations = (doc.get("reservations") as string[]).map(ref => safeAsReference(ref)).filter(ref => ref !== undefined) as DocumentReference[];
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

/**
 * 実際に予約処理をする(人数の変更だけ)
 * @param db
 * @param eventsCollection
 * @param user
 * @param event
 * @param group
 */
export async function reserveEvent(db: Firestore, eventsCollection: CollectionReference, user: UserRecord, event: ReservableEvent, group: Group): Promise<ReservationStatus> {
  // Check if the user is already reserved at same group data
  let docReference = await db.collection("reservations").doc(user.uid).collection("reservations").get()
  const reservations = (await Promise.all(docReference.docs.map(async doc => {
    return await reservationFromDocument(doc);
  }))).filter(ev => ev !== null) as Reservation[];
  const reservation = reservations.find(rv => rv.event.event_id === event.event_id);
  if (reservation !== undefined) {
    // Already reserved
    return ReservationStatus.ALREADY_RESERVED;
  }

  // Check if the event is available and update the taken_capacity
  try {
    return await db.runTransaction(async (t) => {
      const ref = eventsCollection.doc(event.event_id);
      const data = await ref.get();
      const new_taken_capacity = data.get("taken_capacity") as number + group.headcount;
      const capacity: number | undefined = safeAsNumber(data.get("capacity"));
      if (data.exists) {
        if (capacity !== undefined) {
          // 予約上限がある場合
          if (new_taken_capacity <= capacity) {
            // 予約可能
            await t.update(ref, {
              taken_capacity: new_taken_capacity
            });
            return ReservationStatus.RESERVED;
          } else {
            // 定員オーバー
            return ReservationStatus.CAPACITY_OVER;
          }
        } else {
          // 予約上限がない場合
          await t.update(ref, {
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

export enum ReservationStatus {
  RESERVED,
  CAPACITY_OVER,
  EVENT_NOT_FOUND,
  TRANSACTION_FAILED,
  ALREADY_RESERVED
}