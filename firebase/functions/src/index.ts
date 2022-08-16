import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import {toUser, userFromCollection, userToCollection} from "./api/models/User";
import {safeAsString} from "./SafeAs";
import {authenticated, checkPermission, getUser, Permission} from "./Auth";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";
import {toInternalException} from "./api/responces/InternalException";
import {eventFromDoc, ReservableEvent, ReservationStatus, reserveEvent} from "./api/models/ReservableEvent";
import {addTypeProperty, onGET, onPOST} from "./EndPointUtil";
import {
  Reservation,
  reservationFromDocument,
  reservationFromRequestBody,
  reservationToCollection
} from "./api/models/Reservation";
import {cancelReservation, modifyReservation, ModifyStatus} from "./Modify";
import {Group, groupFromObject} from "./api/models/Group";
import Timestamp = firestore.Timestamp;
import {checkInOut, operationFromString} from "./Track";
import {roomById} from "./api/models/Room";

admin.initializeApp();
const db = admin.firestore();
const realTimeDB = admin.database();

const usersCollection = db.collection("users");
const eventsCollection = db.collection("events");
const reservationsCollection = db.collection("reservations");
const adminCollection = db.collection("admin");
const ticketCollection = db.collection("tickets");
const roomsCollection = db.collection("rooms");
const trackCollection = db.collection("track");
const guestCountRef = realTimeDB.ref("guestCount");

export const register = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_ur, uAuth) => {
      const firstName = safeAsString(req.body.firstName);
      const lastName = safeAsString(req.body.lastName);
      const timeStamp = Timestamp.now();

      if (firstName === undefined || lastName === undefined) {
        res.status(400).send(toInternalException("InternalException", "名前情報が不足しています"));
      } else {
        if (await userFromCollection(usersCollection, uAuth) != null) {
          // すでに登録済みのユーザー
          res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed@AlreadyRegistered"));
        } else {
          const us = toUser(
            firstName, lastName, timeStamp, uAuth
          );

          if (us === null) {
            res.status(400).send(
              toInternalException("InternalException", "ユーザー情報が不足しています")
            );
          } else {
            await userToCollection(usersCollection, us);
            res.status(200).send(addTypeProperty({}, "register"));
          }
        }
      }
    })
  });
});

export const user = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, uAuth) => {
      const us = await userFromCollection(usersCollection, uAuth);
      if (us === null) {
        res.status(404).send(
          toInternalException("InternalException", "ユーザー情報が不足しています")
        );
      } else {
        res.status(200).send(addTypeProperty({
          firstName: us.firstName,
          lastName: us.lastName,
          createdDate: us.createdDate
        }, "user"));
      }
    })
  });
});

export const event = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, _uAuth) => {
      const docReference = await eventsCollection.get();
      const events = (await Promise.all(docReference.docs.map(doc => {
        return eventFromDoc(doc);
      }))).filter(ev => ev !== null) as ReservableEvent[];
      res.status(200).send(addTypeProperty({"events": events}, "events"));
    });
  });
});

export const reserve = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, _uAuth) => {
      const reservation = await reservationFromRequestBody(req, eventsCollection, ticketCollection);
      if (reservation === null) {
        res.status(400).send(
          toInternalException("InternalException", "予約情報が不足しています")
        );
      } else {
        // Check Event Availability and Update Event Taken_Capacity
        let reservation_status: ReservationStatus = await reserveEvent(db, reservationsCollection, eventsCollection, ticketCollection, record, reservation.event, reservation.group_data, reservation.reserved_ticket_type.ticket_type_id, reservation.two_factor_key);

        switch (reservation_status) {
          case ReservationStatus.RESERVED:
            // Add Reservation to Reservation Collection
            let b = await reservationToCollection(reservation, record, reservationsCollection, eventsCollection, ticketCollection);
            if (b) {
              res.status(200).send(addTypeProperty({"reservation_id": reservation.reservation_id}, "post-reservation"));
            } else {
              res.status(400).send(
                toInternalException("InternalException", "指定されたイベントが存在しません")
              );
            }
            break;
          case ReservationStatus.CAPACITY_OVER:
            res.status(400).send(
              toInternalException("InternalException@CapacityOver", "定員オーバーです")
            );
            break;
          case ReservationStatus.EVENT_NOT_FOUND:
            res.status(400).send(
              toInternalException("InternalException@EventNotFound", "指定されたイベントが存在しません")
            );
            break;
          case ReservationStatus.TRANSACTION_FAILED:
            res.status(400).send(
              toInternalException("InternalException@TransactionFailed", "予約に失敗しました")
            );
            break;
          case ReservationStatus.ALREADY_RESERVED:
            res.status(400).send(
              toInternalException("InternalException@AlreadyReserved", "すでに予約済みです")
            );
            break;
          case ReservationStatus.INVALID_GROUP:
            res.status(400).send(
              toInternalException("InternalException@InvalidGroup", "グループ人数が不正です")
            );
            break;
          case ReservationStatus.INVALID_TICKET_TYPE:
            res.status(400).send(
              toInternalException("InternalException@InvalidTicketType", "指定されたチケットタイプはこのイベントでは予約できません")
            );
            break;
          case ReservationStatus.INVALID_TWO_FACTOR_KEY:
            res.status(400).send(
              toInternalException("InternalException@InvalidTwoFactorKey", "2FAキーが不正です")
            );
            break;
        }
      }
    });
  });

  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, _uAuth) => {
      const docReference = await reservationsCollection.doc(record.uid).collection("reservations").get();
      const reservations = (await Promise.all(docReference.docs.map(async doc => {
        return reservationFromDocument(doc);
      }))).filter(ev => ev !== null) as Reservation[];
      res.status(200).send(addTypeProperty({"reservations": reservations}, "get-reservation"));
    });
  });
});

export const permissions = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await authenticated(admin.auth(), q, s, async (_record, uAuth) => {
    let values = Object.keys(Permission)
      .filter(async key => {
        // @ts-ignore
        let perm = Permission[key] as Permission
        let b: boolean = false;
        await checkPermission(s, adminCollection, uAuth, perm, async () => {
          b = true
        }, async () => {
          b = false
        });
        return b;
      })
      .filter(v => {
        return Number.isNaN(parseInt(v))
      });
    s.status(200).send(addTypeProperty({"permissions": values}, "permissions"));
  });
});

export const modify = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), q, s, async (record, _) => {
      let json = JSON.parse(req.body);
      let reservation_id: string | undefined = safeAsString(json["reservation_id"]);
      if (reservation_id === undefined) {
        res.status(400).send(
          toInternalException("InternalException", "予約IDが不足しています")
        );
        return;
      }
      const toUpdate_ticket_type_id = safeAsString(json["toUpdate_ticket_type_id"]);
      const toUpdateObj = json["toUpdate"];
      const two_factor_key = safeAsString(json["two_factor_key"]);
      let status: ModifyStatus | undefined = undefined;
      let type: "cancel" | "modify" | undefined = undefined;

      if (toUpdateObj == undefined || toUpdate_ticket_type_id == undefined) {
        // キャンセル
        status = await cancelReservation(db, eventsCollection, reservationsCollection, record, reservation_id);
        type = "cancel";
      } else {
        // 予約変更
        let toUpdate: Group | null = groupFromObject(json["toUpdate"]);
        if (toUpdate === null) {
          res.status(400).send(
            toInternalException("InternalException", "予約変更情報が不足しています : " + JSON.stringify(json))
          );
          return;
        }
        status = await modifyReservation(db, reservationsCollection, eventsCollection, ticketCollection, record, reservation_id, toUpdate, toUpdate_ticket_type_id, two_factor_key);
        type = "modify";
      }

      switch (status) {
        case ModifyStatus.MODIFIED:
        case ModifyStatus.CANCELLED:
          res.status(200).send(addTypeProperty({"reservation_id": reservation_id}, type));
          break;
        case ModifyStatus.RESERVATION_NOT_FOUND:
          res.status(400).send(
            toInternalException("InternalException@ReservationNotFound", "指定された予約が存在しません")
          );
          break;
        case ModifyStatus.CAPACITY_OVER:
          res.status(400).send(
            toInternalException("InternalException@CapacityOver", "定員オーバーです")
          );
          break;
        case ModifyStatus.INVALID_RESERVATION_DATA:
          res.status(400).send(
            toInternalException("InternalException@InvalidReservationData", "見つかった予約情報が不正です")
          );
          break;
        case ModifyStatus.TRANSACTION_FAILED:
          res.status(400).send(
            toInternalException("InternalException@TransactionFailed", "予約変更に失敗しました")
          );
          break;
        case ModifyStatus.INVALID_MODIFY_DATA:
          res.status(400).send(
            toInternalException("InternalException@InvalidModifyData", "予約変更情報が不正です")
          );
          break;
        case ModifyStatus.INVALID_TWO_FACTOR_KEY:
          res.status(400).send(
            toInternalException("InternalException@InvalidTwoFactorKey", "2FAキーが不正です")
          );
          break;
      }
    });
  });
});

export const check = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), q, s, async (_, __) => {
      const json = JSON.parse(req.body);
      const operation_str = safeAsString(json["operation"]);
      const auth_uid = safeAsString(json["auth_uid"]);
      const room_id = safeAsString(json["room_id"]);
      const reservation_id = safeAsString(json["reservation_id"]);

      if (operation_str === undefined || auth_uid === undefined || room_id === undefined || reservation_id === undefined) {
        res.status(400).send(
          toInternalException("InternalException", "チェックイン/アウト情報が不足しています")
        );
        return;
      }

      const operation = operationFromString(operation_str);
      if (operation == null) {
        res.status(400).send(
          toInternalException("InternalException", "チェックイン/アウトオペレーション情報が不正です")
        );
        return;
      }

      const targetRecord = await getUser(admin.auth(), auth_uid);
      if (targetRecord === null) {
        res.status(400).send(
          toInternalException("InternalException", "当該ユーザーの認証に失敗しました")
        );
        return;
      }

      const room = await roomById(roomsCollection, room_id);
      if (room === null) {
        res.status(400).send(
          toInternalException("InternalException", "指定された部屋が存在しません")
        );
        return;
      }

      const reservation = await reservationFromDocument(await reservationsCollection.doc(targetRecord.uid).collection("reservations").doc(reservation_id).get());
      if (reservation === null) {
        res.status(400).send(
          toInternalException("InternalException", "指定された予約が存在しません")
        );
        return;
      }
      const result = await checkInOut(operation, targetRecord, room, reservation, trackCollection, roomsCollection, guestCountRef);
      if (result) {
        res.status(200).send(addTypeProperty({}, "check"));
      } else {
        res.status(400).send(
          toInternalException("InternalException", "このチケットでは入場出来ません")
        );
      }
    });
  });
});

export const rooms = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  await onGET(q, s, async (_, res) => {
    await authenticated(admin.auth(), q, s, async (__, ___) => {
      const rs = await Promise.all((await (roomsCollection.get())).docs.map(async (doc) => {
        return roomById(roomsCollection, doc.id);
      }));
      res.status(200).send(addTypeProperty({"rooms": rs}, "rooms"));
    });
  });
});