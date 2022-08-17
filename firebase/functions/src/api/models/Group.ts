import {Guest, guestFromString, guestTypes} from "./Guest";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;
import {any} from "../../util";

export type Group = {
  all_guests: Guest[];
  headcount: number;
}

export function isSameGroup(one: Group, other: Group): boolean {
  const one_map = groupToMap(one);
  const other_map = groupToMap(other);
  for (const i in guestTypes) {
    const type = guestTypes[i];
    if ((one_map.get(type) || 0) !== (other_map.get(type) || 0)) {
      return false;
    }
  }
  return true;
}

function groupToMap(group: Group): Map<string, number> {
  const map = new Map<string, number>();
  group.all_guests.forEach(guest => {
    const count = map.get(guest.type) || 0;
    map.set(guest.type, count + 1);
  });
  return map;
}

/**
 * 直下にall_guestsがあるReferenceからGroupを作る
 * @param ref
 */
export async function groupFromDocument(ref: DocumentReference): Promise<Group | null> {
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
    if (ss === undefined) {
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

export function groupFromStrings(str: string[]): Group | null {
  const arr = str.map(s => guestFromString(s));
  if (any(arr, g => g == null)) {
    return null;
  }

  return {
    // @ts-ignore safely casted to Guest[]
    all_guests: arr,
    headcount: arr.length
  }
}