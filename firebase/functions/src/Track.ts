import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {isEnterable, Room, roomFromObj} from "./api/models/Room";
import {Reservation} from "./api/models/Reservation";
import {database, firestore} from "firebase-admin";
import CollectionReference = firestore.CollectionReference;
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import FieldValue = firestore.FieldValue;
import Reference = database.Reference;

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
export async function checkInOut(operation: Operation, user: UserRecord, toRoom: Room, reservation: Reservation, trackCollection: CollectionReference, roomCollection: CollectionReference, guestCountRef: Reference): Promise<boolean> {
  {
    const fromRoom: Room | null = await getCurrentRoom(user, trackCollection)
    switch (operation) {
      case Operation.Enter:
        if (!isEnterable(toRoom, reservation.reserved_ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, user, reservation, fromRoom, trackCollection, roomCollection, guestCountRef);
        const fromRoomId = fromRoom ? fromRoom.room_id : "undefined";
        await recordTrackEntry(trackCollection, user, {
          operation: "enter",
          from_room: fromRoomId,
          toRoom: toRoom.room_id,
          reservation: reservation.reservation_id
        });
        break;
      case Operation.Exit:
        if (!isEnterable(toRoom, reservation.reserved_ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, user, reservation, fromRoom, trackCollection, roomCollection, guestCountRef);
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

async function updateCurrentRoom(toUpdate: Room, user: UserRecord, reservation: Reservation, fromRoom: Room | null, trackCollection: CollectionReference, roomCollection: CollectionReference, guestCountRef: Reference): Promise<boolean> {
  await trackCollection.doc(user.uid).set({current_room: roomCollection.doc(toUpdate.room_id)});
  let b = true;

  if (fromRoom) {
    // チェックアウトしたらチェックアウトした部屋の人数を減らす
    b = b && await updateGuestCount(guestCountRef, fromRoom, -(reservation.group_data.headcount));
  }
  // チェックアウトしたらチェックインした部屋の人数を増やす
  b = b && await updateGuestCount(guestCountRef, toUpdate, reservation.group_data.headcount);
  return b;
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


async function updateGuestCount(ref: Reference, room: Room, delta: number): Promise<boolean> {
  return ref.child(room.room_id).get().then(async snapshot => {
    let count = 0;
    if (snapshot.exists()) {
      count = snapshot.val();
    }
    count += delta;

    await ref.child(room.room_id).set(count);
    return true;
  }).catch(_ => {
    return false;
  });
}