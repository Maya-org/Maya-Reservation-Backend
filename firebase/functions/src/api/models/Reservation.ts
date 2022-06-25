import {firestore} from "firebase-admin";
import DocumentSnapshot = firestore.DocumentSnapshot;
import {Group, groupFromObject} from "./Group";
import {safeAsReference, safeAsString} from "../../SafeAs";
import {Request} from "firebase-functions";
import Firestore = firestore.Firestore;
import DocumentReference = firestore.DocumentReference;
import CollectionReference = firestore.CollectionReference;
import {eventFromDoc, ReservableEvent} from "./ReservableEvent";

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
  try{
    jsonBody = JSON.parse(req.body);
  }catch (e){
    return null;
  }

  let reservation_id: string | undefined = jsonBody["reservation_id"];
  let event_obj: any | undefined = jsonBody["event"];
  let group_data: Group | null = groupFromObject(jsonBody["group_data"]);

  if (reservation_id === undefined || event_obj === undefined || group_data === null) {
    console.log("reservation_id, event_obj, group_data is undefined,reservation_id:", reservation_id, "event_obj:", event_obj, "group_data:", group_data);
    return null;
  }

  let event_ref_string: string | undefined = safeAsString(event_obj["event_id"]);

  if (event_ref_string === undefined) {
    console.log("event_ref_string is undefined");
    return null;
  }

  let ref: DocumentReference = db.collection("events").doc(event_ref_string);
  let event = await eventFromDoc(await ref.get());

  if (event === null) {
    console.log("event is null");
    return null;
  }

  return {
    reservation_id: reservation_id,
    event,
    member_all: group_data.headcount,
    group_data
  }
}

export async function reservationToCollection(reservation: Reservation, reservationCollection: CollectionReference,eventCollection:CollectionReference):Promise<boolean>{
  let doc = await reservationCollection.doc(reservation.reservation_id);

  let eventRef = await eventCollection.doc(reservation.event.event_id);
  if ((await eventRef.get()).exists) {
    await doc.set({
      event: eventRef,
      group_data: reservation.group_data
    })
    return true;
  }else{
    return false;
  }
}