import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {isEnterable, Room, roomFromObj} from "./api/models/Room";
import {Reservation} from "./api/models/Reservation";
import {firestore} from "firebase-admin";
import CollectionReference = firestore.CollectionReference;
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import FieldValue = firestore.FieldValue;

export enum Operation {
  Enter, Exit
}

export function operationFromString(str: string): Operation | null {
  switch (str) {
    case 'enter':
      return Operation.Enter;
    case 'exit':
      return Operation.Exit;
    default:
      return null;
  }
}

export async function getCurrentRoom(user: UserRecord, trackCollection: CollectionReference): Promise<Room | null> {
  const trackData = await (trackCollection.doc(user.uid).get());
  if (trackData.exists) {
    const roomRef = trackData.get("current_room");
    if (roomRef) {
      const roomData: DocumentSnapshot = await roomRef.get();
      if (roomData.exists) {
        return roomFromObj(roomData.id, roomData);
      }
    }
  }

  return null;
}

/**
 * チェックイン/チェックアウトを行う。
 * @param operation
 * @param user
 * @param toRoom
 * @param reservation
 * @param trackCollection
 * @param roomCollection
 */
export async function checkInOut(operation: Operation, user: UserRecord, toRoom: Room, reservation: Reservation, trackCollection: CollectionReference, roomCollection: CollectionReference): Promise<boolean> {
  {
    const fromRoom: Room | null = await getCurrentRoom(user, trackCollection)
    switch (operation) {
      case Operation.Enter:
        if (!isEnterable(toRoom, reservation.reserved_ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, user, trackCollection, roomCollection);
        const fromRoomId = fromRoom ? fromRoom.room_id : "undefined";
        await recordTrackEntry(trackCollection, user, {
          operation: "enter",
          from_room: fromRoomId,
          toRoom: toRoom.room_id,
          reservation: reservation.reservation_id
        });
        break;
      case Operation.Exit:
        await updateCurrentRoom(toRoom, user, trackCollection, roomCollection);
        const fromRoomId_ = fromRoom ? fromRoom.room_id : "undefined";
        await recordTrackEntry(trackCollection, user, {
          operation: "exit",
          from_room: fromRoomId_,
          toRoom: toRoom.room_id,
          reservation: reservation.reservation_id
        });
        break;
    }
  }

  return true;
}

async function updateCurrentRoom(toUpdate: Room, user: UserRecord, trackCollection: CollectionReference, roomCollection: CollectionReference): Promise<void> {
  await trackCollection.doc(user.uid).set({current_room: roomCollection.doc(toUpdate.room_id)});
}

/**
 * トラックエントリーを記録する
 * @param trackCollection
 * @param user
 * @param entryData
 */
export async function recordTrackEntry(trackCollection: CollectionReference, user: UserRecord, entryData: object): Promise<void> {
  const data = {
    data: entryData,
    time: FieldValue.serverTimestamp()
  }

  await trackCollection.doc(user.uid).collection("trackings").add(data);
}