import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import Timestamp = firestore.Timestamp;
import {fromCollection, toCollection, toUser} from "./api/models/User";
import {safeAsString} from "./SafeAs";
import {authenticated} from "./Auth";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";
import {toInternalException} from "./api/responces/InternalException";

admin.initializeApp();
const db = admin.firestore();

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const register = functions.https.onRequest(async (req, res) => {
  await authenticated(admin.auth(), req, res, async (user, uAuth) => {
    const firstName = safeAsString(req.body.firstName);
    const lastName = safeAsString(req.body.lastName);
    const timeStamp = Timestamp.now();

    if (firstName === undefined || lastName === undefined) {
      res.status(400).send(toInternalException("InternalException", "名前情報が不足しています"));
    } else {
      if (await fromCollection(db.collection("users"), uAuth) != null) {
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
          await toCollection(db.collection("users"), user);
          res.status(200).send();
        }
      }
    }
  })
});

export const user = functions.https.onRequest(async (req, res) => {
  await authenticated(admin.auth(), req, res, async (record, uAuth) => {
    const user = await fromCollection(db.collection("users"), uAuth);
    if (user === null) {
      res.status(404).send(
        toInternalException("InternalException", "ユーザー情報が不足しています")
      );
    } else {
      res.status(200).send({
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdDate
      });
    }
  })
});