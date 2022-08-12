import {firestore} from "firebase-admin";
import DocumentSnapshot = firestore.DocumentSnapshot;
import {Group, groupFromObject} from "./Group";
import {safeAsReference, safeGet} from "../../SafeAs";
import {Request} from "firebase-functions";
import Firestore = firestore.Firestore;
import DocumentReference = firestore.DocumentReference;
import CollectionReference = firestore.CollectionReference;
import {eventFromDoc, ReservableEvent} from "./ReservableEvent";
import {v4 as uuidv4} from "uuid";

export type Reservation = {
  reservation_id: string;
  event: ReservableEvent;
  member_all?: number;
  group_data: Group;
}

export async function reservationFromDocument(document: DocumentSnapshot): Promise<Reservation | null> {
  let eventRef: DocumentReference | undefined = safeAsReference(document.get("event"));
  let group_data: Group | null = await groupFromObject(document.get("group_data"));

  if (eventRef !== undefined && group_data !== null) {
    let event: ReservableEvent | null = await eventFromDoc(await eventRef.get());
    if (event !== null) {
      return {
        reservation_id: document.ref.id,
        event,
        member_all: group_data.headcount,
        group_data
      }
    } else {
      return null;
    }
  } else {
    return null;
  }
}

export async function reservationFromRequestBody(req: Request, db: Firestore): Promise<Reservation | null> {
  let jsonBody;
  try {
    jsonBody = JSON.parse(req.body);
  } catch (e) {
    return null;
  }

  let event_id = safeGet(jsonBody, "event_id")
  let group_data: Group | null = groupFromObject(safeGet(jsonBody, "group"));

  if (event_id === undefined || group_data === null) {
    console.log("event_id, group_data, group_data is undefined,", "event_id:", event_id, "group_data:", group_data);
    return null;
  }

  let ref: DocumentReference = db.collection("events").doc(event_id);
  let event = await eventFromDoc(await ref.get());

  if (event === null) {
    console.log("event is null");
    return null;
  }

  let reservation_id: string = uuidv4();

  return {
    reservation_id: reservation_id,
    event,
    member_all: group_data.headcount,
    group_data
  }
}

export async function reservationToCollection(reservation: Reservation, reservationCollection: CollectionReference, eventCollection: CollectionReference): Promise<boolean> {
  let doc = reservationCollection.doc(reservation.reservation_id);

  let eventRef = eventCollection.doc(reservation.event.event_id);
  if ((await eventRef.get()).exists) {
    await doc.set({
      event: eventRef,
      group_data: reservation.group_data
    })
    return true;
  } else {
    return false;
  }
}

export async function cancelReservationFromCollection(reservation_id: string, reservationCollection: CollectionReference): Promise<boolean> {
  let doc = reservationCollection.doc(reservation_id);
  if ((await doc.get()).exists) {
    await doc.delete();
    return true;
  }
  return false;
}