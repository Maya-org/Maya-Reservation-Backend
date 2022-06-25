import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import Timestamp = firestore.Timestamp;
import {userFromCollection, userToCollection, toUser} from "./api/models/User";
import {safeAsString} from "./SafeAs";
import {authenticated} from "./Auth";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";
import {toInternalException} from "./api/responces/InternalException";
import {eventFromDoc, ReservableEvent} from "./api/models/ReservableEvent";
import {onGET, onPOST} from "./EndPointUtil";
import {
  Reservation,
  reservationFromDocument,
  reservationFromRequestBody,
  reservationToCollection
} from "./api/models/Reservation";

admin.initializeApp();
const db = admin.firestore();

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const register = functions.https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (user, uAuth) => {
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
          const user = toUser(
            firstName, lastName, timeStamp, uAuth
          );

          if (user === null) {
            res.status(400).send(
              toInternalException("InternalException", "ユーザー情報が不足しています")
            );
          } else {
            await userToCollection(db.collection("users"), user);
            res.status(200).send();
          }
        }
      }
    })
  });
});

export const user = functions.https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, uAuth) => {
      const user = await userFromCollection(db.collection("users"), uAuth);
      if (user === null) {
        res.status(404).send(
          toInternalException("InternalException", "ユーザー情報が不足しています")
        );
      } else {
        res.status(200).send({
          firstName: user.firstName,
          lastName: user.lastName,
          createdDate: user.createdDate
        });
      }
    })
  });
});

export const event = functions.https.onRequest(async (q, s) => {
  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, uAuth) => {
      const docReference = await db.collection("events").get();
      const events = docReference.docs.map(doc => {
        return eventFromDoc(doc);
      }).filter(ev => ev !== null) as ReservableEvent[];
      res.status(200).send(events);
    });
  });
});

export const reserve = functions.https.onRequest(async (q, s) => {
  await onPOST(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (user, uAuth) => {
      const reservation = await reservationFromRequestBody(req, db);
      if (reservation === null) {
        res.status(400).send(
          toInternalException("InternalException", "予約情報が不足しています")
        );
      } else {
        // TODO check availability
        let b = await reservationToCollection(reservation, db.collection("reservations").doc(user.uid).collection("reservations"), db.collection("events"));
        if (b) {
          res.status(200).send();
        } else {
          res.status(400).send(
            toInternalException("InternalException", "指定されたイベントが存在しません")
          );
        }
      }
    });
  });

  await onGET(q, s, async (req, res) => {
    await authenticated(admin.auth(), req, res, async (record, uAuth) => {
      const docReference = await db.collection("reservations").doc(record.uid).collection("reservations").get();
      const reservations = (await Promise.all(docReference.docs.map(async doc => {
        return await reservationFromDocument(doc);
      }))).filter(ev => ev !== null) as Reservation[];
      res.status(200).send(reservations);
    });
  });
});