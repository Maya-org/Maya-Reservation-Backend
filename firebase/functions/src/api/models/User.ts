import {firestore} from "firebase-admin";
import Timestamp = firestore.Timestamp;
import {UserAuthentication} from "./UserAuthentication";
import CollectionReference = firestore.CollectionReference;

type User = {
  firstName: string;
  lastName: string;
  createdDate: Timestamp;
  auth: UserAuthentication;
}

export async function userToCollection(collection: CollectionReference, user: User) {
  await collection.doc(user.auth.firebase_auth_uid).set({
    firstName: user.firstName,
    lastName: user.lastName,
    createdDate: user.createdDate
  })
}

export async function userFromCollection(collection: CollectionReference, auth: UserAuthentication): Promise<User | null> {
  let doc = await collection.doc(auth.firebase_auth_uid).get();
  if (doc.exists) {
    return {
      firstName: doc.get("firstName") as string,
      lastName: doc.get("lastName") as string,
      createdDate: doc.get("createdDate") as Timestamp,
      auth
    }
  }
  return null;
}

/**
 * @return {UserAuthentication} A new instance of UserAuthentication
 * @param firstName
 * @param lastName
 * @param createdDate
 * @param auth
 */
export function toUser(firstName: string, lastName: string, createdDate: Timestamp, auth: UserAuthentication): User | null {

  if (firstName === undefined || lastName === undefined || createdDate === undefined || auth === null) {
    return null;
  }

  return {
    firstName,
    lastName,
    createdDate,
    auth
  };
}