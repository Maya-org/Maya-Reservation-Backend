import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {firestore} from "firebase-admin";
import Timestamp = firestore.Timestamp;
import {fromCollection, toCollection, toUser} from "./api/models/User";
import {isValidUserAuthentication, toAuth} from "./api/models/UserAuthentication";
import {safeAsString} from "./SafeAs";

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
    let firstName = safeAsString(req.body.firstName)
    let lastName = safeAsString(req.body.lastName);
    let auth = toAuth(safeAsString(req.body.auth));
    let timeStamp = Timestamp.now();

    if (firstName === undefined || lastName === undefined) {
        res.status(400).send(toInternalException("InternalException", "名前情報が不足しています"));
    } else if (auth === undefined || !(await isValidUserAuthentication(admin.auth(), auth))) {
        res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed"));
    } else {
        if (await fromCollection(db.collection("users"), auth) != null) {
            // すでに登録済みのユーザー
            res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed@AlreadyRegistered"));
        } else {
            let user = toUser({
                firstName, lastName, createdDate: timeStamp, auth
            })

            if (user === null) {
                res.status(400).send(toInternalException("InternalException", "ユーザー情報が不足しています"));
            } else {
                await toCollection(db.collection("users"), user)
            }
        }
    }
});