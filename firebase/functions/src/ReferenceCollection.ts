/**
 * DBの主なCollectionReferenceを持っておくクラス
 */
import {database, firestore} from "firebase-admin";
import CollectionReference = firestore.CollectionReference;
import Reference = database.Reference;
import Firestore = firestore.Firestore;
import Database = database.Database;
import {v4 as uuidv4} from "uuid";
import DocumentReference = firestore.DocumentReference;

export type ReferenceCollection = {
  usersCollection: CollectionReference,
  eventsCollection: CollectionReference,
  ticketsCollection: CollectionReference,
  ticketTypesCollection: CollectionReference,
  reservationsCollection: CollectionReference,
  adminCollection: CollectionReference,
  roomsCollection: CollectionReference,
  tracksCollection: CollectionReference,
  wristBandCollection: CollectionReference,
  guestCountRef: Reference,
  guestCountSumRef:Reference,
  db: Firestore,
  realTimeDB: Database
}

export function initCollection(fs: Firestore, realTimeDB: Database): ReferenceCollection {
  return {
    usersCollection: fs.collection("users"),
    eventsCollection: fs.collection("events"),
    ticketsCollection: fs.collection("tickets"),
    ticketTypesCollection: fs.collection("ticketTypes"),
    reservationsCollection: fs.collection("reservations"),
    adminCollection: fs.collection("admin"),
    roomsCollection: fs.collection("rooms"),
    tracksCollection: fs.collection("track"),
    wristBandCollection: fs.collection("wristband"),
    guestCountRef: realTimeDB.ref("guestCount"),
    guestCountSumRef: realTimeDB.ref("guestCountSum"),
    db: fs,
    realTimeDB: realTimeDB
  }
}

export async function newRandomID(collection: CollectionReference): Promise<string> {
  const id = uuidv4();
  const doc = collection.doc(id);
  if ((await doc.get()).exists) {
    return newRandomID(collection);
  }
  return id;
}

export async function newRandomIDDocument(collection: CollectionReference): Promise<DocumentReference> {
  const id = await newRandomID(collection);
  return collection.doc(id);
}