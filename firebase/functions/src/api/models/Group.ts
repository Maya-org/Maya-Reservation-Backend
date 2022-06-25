import {Guest, guestFromString} from "./Guest";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;

export type Group = {
  all_guests: Guest[];
  headcount: number;
}

export async function groupFromDocument(ref: DocumentReference | undefined): Promise<Group | null> {
  if (ref === undefined) {
    return null
  }
  let document = await ref.get();
  let all_guests: Guest[] = (document.get("all_guests") as string[]).map((s) => {
    return guestFromString(s);
  }).filter((g) => {
    return g != null
  }) as Guest[];
  let headcount: number = all_guests.length;
  return {
    all_guests,
    headcount
  }
}

export function groupFromObject(object: any): Group | null {
  if (object === undefined) {
    return null;
  }
  let all_guest_array: any[] | undefined = object["all_guests"];
  if (all_guest_array === undefined) {
    return null;
  }
  let guests = all_guest_array.map((s) => {
    let ss = s["type"];
    if(ss === undefined){
      return null;
    }
    return guestFromString(ss);
  }).filter((g) => {
    return g != null
  }) as Guest[];

  return {
    all_guests: guests,
    headcount: guests.length
  };
}