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
  guestCountRef: Reference,
  db: Firestore,
  realTimeDB: Database
}

export function initCollection(firestore: Firestore, realTimeDB: Database): ReferenceCollection {
  return {
    usersCollection: firestore.collection("users"),
    eventsCollection: firestore.collection("events"),
    ticketsCollection: firestore.collection("tickets"),
    ticketTypesCollection: firestore.collection("ticketTypes"),
    reservationsCollection: firestore.collection("reservations"),
    adminCollection: firestore.collection("admin"),
    roomsCollection: firestore.collection("rooms"),
    tracksCollection: firestore.collection("track"),
    guestCountRef: realTimeDB.ref("guestCount"),
    db: firestore,
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