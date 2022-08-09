import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import {toUser, userFromCollection, userToCollection} from "./api/models/User";
import {safeAsString} from "./SafeAs";
import {authenticated, checkPermission, Permission} from "./Auth";
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
import {modifyReservation, ModifyStatus} from "./Modify";
import {Group, groupFromObject} from "./api/models/Group";
import Timestamp = firestore.Timestamp;

admin.initializeApp();
const db = admin.firestore();


export const register = functions.https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_ur, uAuth) => {
      const firstName = safeAsString(req.body.firstName);
      const lastName = safeAsString(req.body.lastName);
      const timeStamp = Timestamp.now();

      if (firstName === undefined || lastName === undefined) {
        res.status(400).send(toInternalException("InternalException", "名前情報が不足しています"));
      } else {
        if (await userFromCollection(db.collection("users"), uAuth) != null) {
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
            await userToCollection(db.collection("users"), us);
            res.status(200).send(addTypeProperty({}, "register"));
          }
        }
      }
    })
  });
});

export const user = functions.https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, uAuth) => {
      const us = await userFromCollection(db.collection("users"), uAuth);
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

export const event = functions.https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (_record, _uAuth) => {
      const docReference = await db.collection("events").get();
      const events = docReference.docs.map(doc => {
        return eventFromDoc(doc);
      }).filter(ev => ev !== null) as ReservableEvent[];
      res.status(200).send(addTypeProperty({"events": events}, "events"));
    });
  });
});

export const reserve = functions.https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, _uAuth) => {
      const reservation = await reservationFromRequestBody(req, db);
      if (reservation === null) {
        res.status(400).send(
          toInternalException("InternalException", "予約情報が不足しています")
        );
      } else {
        // Check Event Availability and Update Event Taken_Capacity
        let reservation_status: ReservationStatus = await reserveEvent(db, db.collection("events"), record, reservation.event, reservation.group_data);

        switch (reservation_status) {
          case ReservationStatus.RESERVED:
            // Add Reservation to Reservation Collection
            let b = await reservationToCollection(reservation, db.collection("reservations").doc(record.uid).collection("reservations"), db.collection("events"));
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
        }
      }
    });
  });

  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, _uAuth) => {
      const docReference = await db.collection("reservations").doc(record.uid).collection("reservations").get();
      const reservations = (await Promise.all(docReference.docs.map(async doc => {
        return reservationFromDocument(doc);
      }))).filter(ev => ev !== null) as Reservation[];
      res.status(200).send(addTypeProperty({"reservations": reservations}, "get-reservation"));
    });
  });
});

export const permissions = functions.https.onRequest(async (q, s) => {
  await authenticated(admin.auth(), q, s, async (_record, uAuth) => {
    let values = Object.keys(Permission)
      .filter(async key => {
        // @ts-ignore
        let perm = Permission[key] as Permission
        let b: boolean = false;
        await checkPermission(s, db.collection("admin"), uAuth, perm, async () => {
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

export const modify = functions.https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), q, s, async (record, _) => {
      let json = JSON.parse(req.body);
      let reservation_id: string | undefined = safeAsString(json["reservation_id"]);
      let group: Group | null = groupFromObject(json["group"]);
      if (reservation_id === undefined || group === null) {
        res.status(400).send(
          toInternalException("InternalException", "予約変更情報が不足しています : " + JSON.stringify(json))
        );
        return;
      }
      let status: ModifyStatus = await modifyReservation(db, db.collection("reservations").doc(record.uid).collection("reservations"), db.collection("events"), record, reservation_id, group);
      switch (status) {
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
      }
    });
  });
});