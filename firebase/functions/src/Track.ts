import {isEnterable, Room, roomFromObj} from "./api/models/Room";
import {database, firestore} from "firebase-admin";
import CollectionReference = firestore.CollectionReference;
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import FieldValue = firestore.FieldValue;
import Reference = database.Reference;
import {ReferenceCollection} from "./ReferenceCollection";
import {Ticket} from "./api/models/Ticket";

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

export async function getCurrentRoom(ticket: Ticket, trackCollection: CollectionReference): Promise<Room | null> {
  const trackData = await (trackCollection.doc(ticket.ticket_id).get());
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
 * @param toRoom
 * @param ticket
 * @param collection
 */
export async function checkInOut(operation: Operation, toRoom: Room, ticket: Ticket, collection: ReferenceCollection): Promise<boolean> {
  {
    const fromRoom: Room | null = await getCurrentRoom(ticket, collection.tracksCollection)
    switch (operation) {
      case Operation.Enter:
        if (!isEnterable(toRoom, ticket.ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, ticket, fromRoom, collection);
        const fromRoomId = fromRoom ? fromRoom.room_id : "undefined";
        await recordTrackEntry(collection, ticket, {
          operation: "enter",
          from_room: fromRoomId,
          toRoom: toRoom.room_id
        });
        break;
      case Operation.Exit:
        if (!isEnterable(toRoom, ticket.ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, ticket, fromRoom, collection);
        const fromRoomId_ = fromRoom ? fromRoom.room_id : "undefined";
        await recordTrackEntry(collection, ticket, {
          operation: "exit",
          from_room: fromRoomId_,
          toRoom: toRoom.room_id,
        });
        break;
    }
  }

  return true;
}

async function updateCurrentRoom(toUpdate: Room, ticket: Ticket, fromRoom: Room | null, collection: ReferenceCollection): Promise<boolean> {
  await collection.tracksCollection.doc(ticket.ticket_id).set({current_room: collection.roomsCollection.doc(toUpdate.room_id)});
  let b = true;

  if (fromRoom) {
    // チェックアウトしたらチェックアウトした部屋の人数を減らす
    b = b && await updateGuestCount(collection.guestCountRef, fromRoom, -(ticket.ticket_type.reservable_group.headcount));
  }
  // チェックアウトしたらチェックインした部屋の人数を増やす
  b = b && await updateGuestCount(collection.guestCountRef, toUpdate, ticket.ticket_type.reservable_group.headcount);
  return b;
}

/**
 * トラックエントリーを記録する
 * @param collection
 * @param ticket
 * @param entryData
 */
export async function recordTrackEntry(collection: ReferenceCollection, ticket: Ticket, entryData: object): Promise<void> {
  const data = {
    data: entryData,
    time: FieldValue.serverTimestamp()
  }

  await collection.tracksCollection.doc(ticket.ticket_id).collection("trackings").add(data);
}


async function updateGuestCount(ref: Reference, room: Room, delta: number): Promise<boolean> {
  const result = await ref.child(room.room_id).transaction(count => {
    let c;
    if(count){
      c = count;
    }else{
      c = 0;
    }

    c+= delta;
    return c;
  });

  return result.committed;
}