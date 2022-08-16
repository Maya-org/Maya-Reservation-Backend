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
import {errorGCP} from "./util";
import {getTwoFactorKey, isAssignable, TicketType, ticketTypeFromDocument} from "./api/models/TicketType";

/**
 * Modify/Delete a reservation.
 * @param db
 * @param reservationCollection
 * @param eventsCollection
 * @param ticketCollection
 * @param user
 * @param reservation_id
 * @param toUpdate
 * @param toUpdate_ticket_type_id
 */
export async function modifyReservation(db: Firestore, reservationCollection: CollectionReference, eventsCollection: CollectionReference, ticketCollection: CollectionReference, user: UserRecord, reservation_id: string, toUpdate: Group, toUpdate_ticket_type_id: string, two_factor_key: string | undefined): Promise<ModifyStatus> {
  if (toUpdate.headcount === 0) {
    errorGCP("CancelのリクエストなのにModifyが呼ばれた");
    return ModifyStatus.INVALID_MODIFY_DATA;
  }

  const ticket_type: TicketType | null = await ticketTypeFromDocument(await ticketCollection.doc(toUpdate_ticket_type_id).get());
  if (ticket_type === null) {
    // チケットタイプが不正な場合
    return ModifyStatus.INVALID_MODIFY_DATA;
  }
  if (!isAssignable(ticket_type, toUpdate)) {
    // 予約可能グループにない場合
    return ModifyStatus.INVALID_MODIFY_DATA;
  }
  const ticket_two_factor_key = await getTwoFactorKey(ticketCollection,ticket_type)
  if(ticket_two_factor_key!= null){
    // 2FAが有効な場合
    if(ticket_two_factor_key !== two_factor_key){
      // 2FAが違う場合
      return ModifyStatus.INVALID_TWO_FACTOR_KEY;
    }
  }
  const reservationSnapShot = await (reservationCollection.doc(user.uid).collection("reservations").doc(reservation_id).get());
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

      await reservationToCollection({
        event: reservation.event,
        group_data: toUpdate,
        member_all: toUpdate.headcount,
        reservation_id: reservation.reservation_id,
        reserved_ticket_type: ticket_type
      }, user, reservationCollection, eventsCollection, ticketCollection)
      return ModifyStatus.MODIFIED;
    } else {
      // 予約データが壊れてる
      return ModifyStatus.INVALID_RESERVATION_DATA;
    }
  } else {
    // 予約が存在しない
    return ModifyStatus.RESERVATION_NOT_FOUND;
  }
}

/**
 * イベントのtaken_capacityを更新する。
 * @param db
 * @param eventsCollection
 * @param reservation
 * @param toUpdate
 * @param reservedGroup
 */
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
        errorGCP("updateTakenCapacity", "トランザクションに失敗しました");
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
  CANCELLED,
  INVALID_MODIFY_DATA,
  INVALID_TWO_FACTOR_KEY
}

/**
 * 予約をキャンセルする
 * @param db
 * @param eventsCollection
 * @param reservationCollection
 * @param user
 * @param reservation_id
 */
export async function cancelReservation(db: Firestore, eventsCollection: CollectionReference, reservationCollection: CollectionReference, user: UserRecord, reservation_id: string): Promise<ModifyStatus> {
  const reservationSnapShot = await (reservationCollection.doc(user.uid).collection("reservations").doc(reservation_id).get());
  if (reservationSnapShot.exists) {
    const reservation: Reservation | null = await reservationFromDocument(reservationSnapShot);
    if (reservation != null) {
      // 予約が存在する場合人数を0に
      const updateResult = await updateTakenCapacity(db, eventsCollection, reservation, {
        all_guests: [],
        headcount: 0
      }, reservation.group_data);
      if (updateResult != null) {
        return updateResult;
      } else {
        // 予約データを削除
        await cancelReservationFromCollection(user, reservation.reservation_id, reservationCollection);
        return ModifyStatus.CANCELLED;
      }
    } else {
      return ModifyStatus.INVALID_RESERVATION_DATA;
    }
  } else {
    return ModifyStatus.RESERVATION_NOT_FOUND;
  }
}