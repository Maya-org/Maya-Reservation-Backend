import {ReferenceCollection} from "./ReferenceCollection";
import {safeAsString} from "./SafeAs";

export type WristBand = {
  wristbandID: string,
  reserverID: string,
  ticketID: string,
}

/**
 * リストバンドとチケットの紐付けを行う。
 * 一度紐付けを行ったリストバンドは再度紐付けを行うことはできない。(もし紐付けを行いたい場合は、当該リストバンドのデータを削除する必要がある。)
 * @param collection
 * @param wristBandID
 * @param reserverID
 * @param ticketID
 */
export async function bindWristband(collection: ReferenceCollection, wristBandID: string, reserverID: string, ticketID: string): Promise<boolean> {
  const wristBandRef = collection.wristBandCollection.doc(wristBandID);
  const wristBandData = await wristBandRef.get();
  if (wristBandData.exists) {
    return false;
  }

  await wristBandRef.set({
    reserverID: reserverID,
    ticketID: ticketID
  });

  return true;
}

/**
 * [wristbandID]に紐付けられたチケットIDを取得する。
 * @param collection
 * @param wristBandID
 */
export async function getWristband(collection: ReferenceCollection, wristBandID: string): Promise<WristBand | undefined> {
  const wristBandRef = collection.wristBandCollection.doc(wristBandID);
  const wristBandData = await wristBandRef.get();
  if (!wristBandData.exists) {
    return undefined;
  }

  const reserverID = safeAsString(wristBandData.get("reserverID"));
  const ticketID = safeAsString(wristBandData.get("ticketID"));


  if (reserverID == undefined || ticketID == undefined) {
    return undefined;
  }

  return {
    wristbandID: wristBandID,
    reserverID: reserverID,
    ticketID: ticketID
  }
}