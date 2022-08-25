import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {firestore} from "firebase-admin";
import {
  cancelReservationFromCollection,
  Reservation, reservationByID,
  reservationFromDocument,
  reservationToCollection
} from "./api/models/Reservation";
import {addTakenCapacity, getTwoFactorKey, ReservationStatus} from "./api/models/ReservableEvent";
import Firestore = firestore.Firestore;
import {errorGCP, headCount} from "./util";
import {ReferenceCollection} from "./ReferenceCollection";
import {deleteTicketsFromCollection, registerTicketsToCollection, Ticket} from "./api/models/Ticket";
import {TicketType} from "./api/models/TicketType";
import Timestamp = firestore.Timestamp;

/**
 * Modify/Delete a reservation.
 * @param collection
 * @param user
 * @param reservation_id
 * @param toUpdate
 * @param two_factor_key
 */
export async function modifyReservation(collection: ReferenceCollection, user: UserRecord, reservation_id: string, toUpdate: TicketType[], two_factor_key: string | undefined): Promise<ModifyStatus> {
  if (headCount(toUpdate) === 0) {
    errorGCP("CancelのリクエストなのにModifyが呼ばれた");
    return ModifyStatus.INVALID_MODIFY_DATA;
  }

  const reservation: Reservation | null = await reservationByID(collection, user, reservation_id);
  if (reservation === null) {
    return ModifyStatus.RESERVATION_NOT_FOUND;
  }

  if(reservation.event.date_start.toMillis() < Timestamp.now().toMillis()){
    // もうすでにイベントが開始している
    return ModifyStatus.EVENT_ALREADY_STARTED;
  }

  const ticket_two_factor_key = await getTwoFactorKey(collection, reservation.event)
  if (ticket_two_factor_key != null) {
    // 2FAが有効な場合
    if (ticket_two_factor_key !== two_factor_key) {
      // 2FAが違う場合
      return ModifyStatus.INVALID_TWO_FACTOR_KEY;
    }
  }


  // 予約が存在するので人数を更新
  let result = await updateTakenCapacity(collection.db, collection, reservation, reservation.tickets, toUpdate);
  if (result != null) {
    return result;  // 人数更新に失敗した場合
  }

  // Delete the tickets from the reservation.
  reservation.tickets.forEach(ticket => {
    deleteTicketsFromCollection(collection, ticket);
  });

  // Add the new tickets to the reservation.
  const updatedTickets: Ticket[] = await Promise.all(toUpdate.map(async type => {
    const updatedTicketID = await registerTicketsToCollection(collection, type, reservation.event);
    return {
      ticket_type: type,
      ticket_id: updatedTicketID,
      event: reservation.event
    }
  }));

  await reservationToCollection({
    event: reservation.event,
    reservation_id: reservation.reservation_id,
    tickets: updatedTickets
  }, user, collection)
  return ModifyStatus.MODIFIED;
}

/**
 * イベントのtaken_capacityを更新する。
 * @param db
 * @param collection
 * @param toModifyReservation
 * @param from
 * @param to
 */
async function updateTakenCapacity(db: Firestore, collection: ReferenceCollection, toModifyReservation: Reservation, from: Ticket[], to: TicketType[]): Promise<ModifyStatus | null> {
  // 予約更新時に増える人数
  const delta = headCount(to) - headCount(from.map(e => e.ticket_type));
  if (delta == 0) {
    // 人数が変わらない場合はチェック・人数更新をスキップ
  } else {
    // 増える人数がある場合 or 減る人数がある場合
    let result: ReservationStatus = await addTakenCapacity(db, collection, toModifyReservation.event, delta);
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
  INVALID_TWO_FACTOR_KEY,
  EVENT_ALREADY_STARTED
}

/**
 * 予約をキャンセルする
 * @param db
 * @param collection
 * @param user
 * @param reservation_id
 */
export async function cancelReservation(collection: ReferenceCollection, user: UserRecord, reservation_id: string): Promise<ModifyStatus> {
  const reservationSnapShot = await (collection.reservationsCollection.doc(user.uid).collection("reservations").doc(reservation_id).get());
  if (reservationSnapShot.exists) {
    const reservation: Reservation | null = await reservationFromDocument(reservationSnapShot);
    if (reservation != null) {
      // 予約が存在する場合人数を0に
      const updateResult = await updateTakenCapacity(collection.db, collection, reservation, reservation.tickets, []);
      if (updateResult != null) {
        return updateResult;
      } else {
        // 予約データを削除
        reservation.tickets.forEach(ticket => {
          deleteTicketsFromCollection(collection, ticket);  // チケット削除
        });
        await cancelReservationFromCollection(user, reservation.reservation_id, collection);
        return ModifyStatus.CANCELLED;
      }
    } else {
      return ModifyStatus.INVALID_RESERVATION_DATA;
    }
  } else {
    return ModifyStatus.RESERVATION_NOT_FOUND;
  }
}