import {isEnterable, Room, roomById, roomFromObj} from "./api/models/Room";
import {database, firestore} from "firebase-admin";
import CollectionReference = firestore.CollectionReference;
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import FieldValue = firestore.FieldValue;
import Reference = database.Reference;
import {ReferenceCollection} from "./ReferenceCollection";
import {Ticket} from "./api/models/Ticket";
import {safeAsObject, safeAsString, safeAsTimeStamp, safeGet} from "./SafeAs";
import Timestamp = firestore.Timestamp;
import DocumentData = firestore.DocumentData;
import {errorGCP} from "./util";

export enum Operation {
  Enter, Exit
}

export type TrackData = {
  operation: Operation;
  fromRoom: Room | null;
  toRoom: Room;
}

export type RawTrackData = {
  data :{
    operation: string;
    fromRoom: Room | null;
    toRoom: Room;
  }
  time: Timestamp;
}

export function operationFromString(str: string): Operation | null {
  switch (str) {
    case 'enter':
    case 'Enter':
      return Operation.Enter;
    case 'exit':
    case 'Exit':
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
        await recordTrackEntry(collection, ticket, {
          operation: Operation.Enter,
          fromRoom: fromRoom,
          toRoom: toRoom
        });
        break;
      case Operation.Exit:
        if (!isEnterable(toRoom, ticket.ticket_type)) {
          return false;
        }
        await updateCurrentRoom(toRoom, ticket, fromRoom, collection);
        await recordTrackEntry(collection, ticket, {
          operation: Operation.Exit,
          fromRoom: fromRoom,
          toRoom: toRoom,
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
export async function recordTrackEntry(collection: ReferenceCollection, ticket: Ticket, entryData: TrackData): Promise<void> {
  const toRecord = {
    operation: Operation[entryData.operation],  // TypeScriptではenumを文字列に変換できないのでこうする
    fromRoom: entryData.fromRoom ? entryData.fromRoom.room_id : "undefined",
    toRoom: entryData.toRoom.room_id,
  }

  const data = {
    data: toRecord,
    time: FieldValue.serverTimestamp()
  }

  await collection.tracksCollection.doc(ticket.ticket_id).collection("trackings").add(data);
}


async function updateGuestCount(ref: Reference, room: Room, delta: number): Promise<boolean> {
  const result = await ref.child(room.room_id).transaction(count => {
    let c;
    if (count) {
      c = count;
    } else {
      c = 0;
    }

    c += delta;
    return c;
  });

  return result.committed;
}

export async function readAllTrackData(collection: ReferenceCollection, ticket_id: string): Promise<(RawTrackData | null)[]> {
  const trackData = await (collection.tracksCollection.doc(ticket_id).collection("trackings").get());
  return Promise.all(trackData.docs.map(doc => rawTrackDataFromSnapShot(collection, doc.data())));
}

async function rawTrackDataFromSnapShot(collection: ReferenceCollection, snapshot: DocumentData): Promise<RawTrackData | null> {
  const data = safeAsObject(snapshot["data"]);
  if (data) {
    const trackData = await trackDataFromSnapShot(collection, data); // TODO wrap safeAs
    if (trackData) {
      const time = safeAsTimeStamp(snapshot["time"]);
      if (time) {
        return {
          data:{
            operation: Operation[trackData.operation],
            fromRoom: trackData.fromRoom,
            toRoom: trackData.toRoom
          },
          time: time
        }
      } else {
        errorGCP("rawTrackDataFromSnapShot time is null");
      }
    } else {
      errorGCP("rawTrackDataFromSnapShot trackData is null");
    }
  } else {
    errorGCP("[Returning Null]in rawTrackDataFromSnapShot data is not object");
  }
  return null;
}

async function trackDataFromSnapShot(collection: ReferenceCollection, obj: any): Promise<TrackData | null> {
  const operation_str = safeAsString(safeGet(obj, "operation"));
  if (!operation_str) return null;
  const operation = operationFromString(operation_str);
  if (operation != null) {
    const fromRoomId = safeAsString(safeGet(obj, "fromRoom"));
    const toRoomId = safeAsString(safeGet(obj, "toRoom"));
    if (toRoomId == undefined) {
      errorGCP("trackDataFromSnapShot toRoom is not string");
      return null;
    }
    let fromRoom: Room | null = null;
    let toRoom: Room | null = await roomById(collection, toRoomId);
    if (fromRoomId != undefined && fromRoomId != "undefined") {
      fromRoom = await roomById(collection, fromRoomId);
    }
    if(toRoom == null) {
      errorGCP("trackDataFromSnapShot toRoom is null");
      return null;
    }
    return {
      operation: operation,
      fromRoom: fromRoom,
      toRoom: toRoom
    }
  } else {
    errorGCP("trackDataFromSnapShot operation is null");
  }
  return null;
}