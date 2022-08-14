import {Group} from "./api/models/Group";
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {firestore} from "firebase-admin";
import {
  cancelReservationFromCollection,
  Reservation,
  reservationFromDocument,
  reservationToCollection
} from "./api/models/Reservation";
import {addTakenCapacity, ReservationStatus} from "./api/models/ReservableEvent";
import CollectionReference = firestore.CollectionReference;
import Firestore = firestore.Firestore;

/**
 * Modify/Delete a reservation.
 * @param db
 * @param reservationCollection
 * @param eventsCollection
 * @param ticketCollection
 * @param user
 * @param reservation_id
 * @param toUpdate
 */
export async function modifyReservation(db: Firestore, reservationCollection: CollectionReference, eventsCollection: CollectionReference,ticketCollection:CollectionReference, user: UserRecord, reservation_id: string, toUpdate: Group): Promise<ModifyStatus> {
  const reservationSnapShot = await db.collection("reservations").doc(user.uid).collection("reservations").doc(reservation_id).get();
  if (reservationSnapShot.exists) {
    const reservation: Reservation | null = await reservationFromDocument(reservationSnapShot);
    if (reservation != null) {
      // 予約が存在する場合
      const reservedGroup: Group = reservation.group_data;

      // 人数更新
      let result = await updateTakenCapacity(db, eventsCollection, reservation, toUpdate, reservedGroup);
      if (result != null) {
        return result;
      }

      if (toUpdate.headcount == 0) {
        // 人数が0になった場合は予約を削除
        await cancelReservationFromCollection(reservation.reservation_id, reservationCollection);
        return ModifyStatus.CANCELLED;
      } else {
        await reservationToCollection({
          event: reservation.event,
          group_data: toUpdate,
          member_all: toUpdate.headcount,
          reservation_id: reservation.reservation_id,
          reserved_ticket_type:reservation.reserved_ticket_type
        }, reservationCollection, eventsCollection,ticketCollection)
        return ModifyStatus.MODIFIED;
      }
    } else {
      // 予約データが壊れてる
      return ModifyStatus.INVALID_RESERVATION_DATA;
    }
  } else {
    // 予約が存在しない
    return ModifyStatus.RESERVATION_NOT_FOUND;
  }
}

async function updateTakenCapacity(db: Firestore, eventsCollection: CollectionReference, reservation: Reservation, toUpdate: Group, reservedGroup: Group): Promise<ModifyStatus | null> {
  // 予約更新時に増える人数
  const delta = toUpdate.headcount - reservedGroup.headcount;
  if (delta == 0) {
    // 人数が変わらない場合はチェック・人数更新をスキップ
  } else {
    // 増える人数がある場合 or 減る人数がある場合
    let result: ReservationStatus = await addTakenCapacity(db, eventsCollection, reservation.event, delta);
    switch (result) {
      case ReservationStatus.RESERVED:
        // OK
        break;
      case ReservationStatus.TRANSACTION_FAILED:
        // トランザクションに失敗した場合
        return ModifyStatus.TRANSACTION_FAILED;
      case ReservationStatus.CAPACITY_OVER:
        // 予約可能人数を超えている場合
        return ModifyStatus.CAPACITY_OVER;
    }
  }

  return null
}

export enum ModifyStatus {
  TRANSACTION_FAILED,
  CAPACITY_OVER,
  MODIFIED,
  INVALID_RESERVATION_DATA,
  RESERVATION_NOT_FOUND,
  CANCELLED
}