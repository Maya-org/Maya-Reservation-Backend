import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import {toUser, userFromCollection, userToCollection} from "./api/models/User";
import {safeAsString} from "./SafeAs";
import {authenticated, checkPermission, getUser, Permission} from "./Auth";
import {toInternalException} from "./api/responces/InternalException";
import {eventFromDoc, ReservableEvent, ReservationStatus, reserveEvent} from "./api/models/ReservableEvent";
import {addTypeProperty, applyCORSHeaders, handleOption, onGET, onPOST} from "./EndPointUtil";
import {Reservation, reservationFromDocument, reservationRequestFromRequestBody} from "./api/models/Reservation";
import {cancelReservation, modifyReservation, ModifyStatus} from "./Modify";
import {checkInOut, operationFromString} from "./Track";
import {roomById} from "./api/models/Room";
import {initCollection} from "./ReferenceCollection";
import {TicketType, ticketTypeByID} from "./api/models/TicketType";
import {any, errorGCP} from "./util";
import {ticketByID} from "./api/models/Ticket";
import Timestamp = firestore.Timestamp;

admin.initializeApp();
const db = admin.firestore();
const realTimeDB = admin.database();

const collection = initCollection(db, realTimeDB);

export const register = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onPOST(q, s, async (reqJson, res) => {
    await authenticated(admin.auth(), q, res, async (_ur, uAuth) => {
      const firstName = safeAsString(reqJson['first_name']);
      const lastName = safeAsString(reqJson['last_name']);
      const timeStamp = Timestamp.now();

      if (firstName === undefined || lastName === undefined) {
        res.status(400).send(toInternalException("InternalException", "名前情報が不足しています"));
      } else {
        let alreadyRegistered = false;
        if (await userFromCollection(collection, uAuth) != null) {
          // すでに登録済みのユーザー
          alreadyRegistered = true;
        }

        const us = toUser(
          firstName, lastName, timeStamp, uAuth
        );

        if (us === null) {
          res.status(400).send(
            toInternalException("InternalException", "ユーザー情報が不足しています")
          );
        } else {
          await userToCollection(collection, us);
        }

        res.status(200).send(addTypeProperty({alreadyRegistered: alreadyRegistered}, "register"));
      }
    })
  });
});

export const user = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, uAuth) => {
      const us = await userFromCollection(collection, uAuth);
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
  applyCORSHeaders(s);
  handleOption(q, s);
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, _uAuth) => {
      const docReference = await collection.eventsCollection.get();
      const events = (await Promise.all(docReference.docs.map(doc => {
        return eventFromDoc(doc);
      }))).filter(ev => ev !== null) as ReservableEvent[];
      res.status(200).send(addTypeProperty({"events": events}, "events"));
    });
  });
});

export const reserve = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onPOST(q, s, async (reqJSon, res) => {
    await authenticated(admin.auth(), q, res, async (record, _uAuth) => {
      const reservationRequest = await reservationRequestFromRequestBody(reqJSon, collection);
      if (reservationRequest === null) {
        res.status(400).send(
          toInternalException("InternalException", "予約情報が不足しています")
        );
      } else {
        // Check Event Availability and Update Event Taken_Capacity
        let reservation_status: ReservationStatus = await reserveEvent(db, collection, record, reservationRequest);

        switch (reservation_status) {
          case ReservationStatus.RESERVED:
            res.status(200).send(addTypeProperty({"reservation_id": reservationRequest.reservation_id}, "post-reservation"));
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
          case ReservationStatus.NOT_AVAILABLE:
            res.status(400).send(
              toInternalException("InternalException@NotAvailable", "まだ予約できません(予約期間外です)")
            );
            break;
          case ReservationStatus.NOT_RESERVED_REQUIRED_EVENT:
            res.status(400).send(
              toInternalException("InternalException@NotReservedRequiredEvent", "必要なイベントが予約されていません")
            );
            break;
        }
      }
    });
  });

  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, _uAuth) => {
      const docReference = await collection.reservationsCollection.doc(record.uid).collection("reservations").get();
      const reservations = (await Promise.all(docReference.docs.map(async doc => {
        return reservationFromDocument(doc);
      }))).filter(ev => ev !== null) as Reservation[];
      res.status(200).send(addTypeProperty({"reservations": reservations}, "get-reservation"));
    });
  });
});

export const permissions = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, uAuth) => {
      let values = Object.keys(Permission)
        .filter(async key => {
          // @ts-ignore
          let perm = Permission[key] as Permission
          let b: boolean = false;
          await checkPermission(s, collection, uAuth, perm, async () => {
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
});

export const modify = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onPOST(q, s, async (json, res) => {
    await authenticated(admin.auth(), q, s, async (record, _) => {
      let reservation_id: string | undefined = safeAsString(json["reservation_id"]);
      if (reservation_id === undefined) {
        res.status(400).send(
          toInternalException("InternalException", "予約IDが不足しています")
        );
        return;
      }
      const two_factor_key = safeAsString(json["two_factor_key"]);
      const ticketTypes_obj = json["tickets"];
      if (!ticketTypes_obj || !Array.isArray(ticketTypes_obj)) {
        res.status(400).send(
          toInternalException("InternalException", "チケットタイプが不足しています")
        );
        return;
      }
      const ticketTypes_nullable: (TicketType | null)[] = await Promise.all(ticketTypes_obj.map(ticketType => {
        return ticketTypeByID(collection, ticketType["ticket_type_id"]);
      }));

      if (any(ticketTypes_nullable, ticketType => ticketType == null)) {
        // Contains invalid ticket type id
        res.status(400).send(
          toInternalException("InternalException", "不正なチケットタイプが含まれています")
        );
        return;
      }
      const ticketTypes = ticketTypes_nullable as TicketType[];
      const modifyResult = await modifyReservation(collection, record, reservation_id, ticketTypes, two_factor_key);

      switch (modifyResult) {
        case ModifyStatus.MODIFIED:
          res.status(200).send(addTypeProperty({"reservation_id": reservation_id}, "modify"));
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
        case ModifyStatus.CANCELLED:
          res.status(400).send(
            toInternalException("InternalException@Cancelled", "予約変更なのにキャンセルされました")
          );
          break;
      }
    });
  });
});

export const cancel = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onPOST(q, s, async (json, res) => {
    await authenticated(admin.auth(), q, s, async (record, _) => {
      const reservation_id = safeAsString(json["reservation_id"]);
      if (reservation_id === undefined) {
        res.status(400).send(
          toInternalException("InternalException", "予約IDが不足しています")
        );
        return;
      }

      const cancelResult = await cancelReservation(collection, record, reservation_id);
      switch (cancelResult) {
        case ModifyStatus.CANCELLED:
          res.status(200).send(addTypeProperty({}, "cancel"));
          break;
        case ModifyStatus.INVALID_RESERVATION_DATA:
          res.status(400).send(
            toInternalException("InternalException@InvalidReservationData", "見つかった予約情報が不正です")
          );
          break;
        case ModifyStatus.TRANSACTION_FAILED:
          res.status(400).send(
            toInternalException("InternalException@TransactionFailed", "予約キャンセルに失敗しました")
          );
          break;
        case ModifyStatus.CAPACITY_OVER:
          res.status(400).send(
            toInternalException("InternalException@CapacityOver", "定員オーバーです")
          );
          break;
        case ModifyStatus.RESERVATION_NOT_FOUND:
          res.status(400).send(
            toInternalException("InternalException@ReservationNotFound", "指定された予約が存在しません")
          );
          break;
      }
    });
  });
});

export const check = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onPOST(q, s, async (json, res) => {
    await authenticated(admin.auth(), q, s, async (_, __) => {
      const operation_str = safeAsString(json["operation"]);
      const auth_uid = safeAsString(json["auth_uid"]);
      const room_id = safeAsString(json["room_id"]);
      const ticket_id = safeAsString(json["ticket_id"]);

      if (operation_str === undefined || auth_uid === undefined || room_id === undefined || ticket_id === undefined) {
        errorGCP("Failed in check", "必要なパラメータが不足しています", "operation", operation_str, "auth_uid", auth_uid, "room_id", room_id, "ticket_id", ticket_id);
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

      const targetRoom = await roomById(collection, room_id);
      if (targetRoom === null) {
        res.status(400).send(
          toInternalException("InternalException", "指定された部屋が存在しません")
        );
        return;
      }

      const ticket = await ticketByID(collection, ticket_id);
      if (ticket === null) {
        res.status(400).send(
          toInternalException("InternalException", "指定されたチケットが存在しません")
        );
        return;
      }
      const result = await checkInOut(operation, targetRoom, ticket, collection);
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

export const room = functions.region('asia-northeast1').https.onRequest(async (q, s) => {
  applyCORSHeaders(s);
  handleOption(q, s);
  await onGET(q, s, async (_, res) => {
    await authenticated(admin.auth(), q, s, async (__, ___) => {
      const rs = await Promise.all((await (collection.roomsCollection.get())).docs.map(async (doc) => {
        return roomById(collection, doc.id);
      }));
      res.status(200).send(addTypeProperty({"rooms": rs}, "rooms"));
    });
  });
});