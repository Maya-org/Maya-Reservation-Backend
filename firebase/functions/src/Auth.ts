import {auth, firestore} from "firebase-admin";
import Auth = auth.Auth;
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {Request, Response} from "firebase-functions";
import {toAuth, UserAuthentication} from "./api/models/UserAuthentication";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";
import CollectionReference = firestore.CollectionReference;

/**
 * @return {string} The authentication bearer token.
 * @param req
 */
export function getIdToken(req: Request): string | undefined {
  let authorization = req.headers.authorization;
  if (authorization === undefined) {
    return undefined;
  } else {
    let token = authorization.match(/^Bearer (.*)$/);
    if (token) {
      return token[1];
    } else {
      return undefined;
    }
  }
}

export async function verifyToken(authObj: Auth, token: string): Promise<UserRecord | undefined> {
  let decoded = await authObj.verifyIdToken(token);
  let uid = decoded.uid;
  try {
    return await authObj.getUser(uid);
  } catch (e) {
    return undefined
  }
}

/**
 * Firebase Authenticationの認証を行った上でリクエストを処理する。
 *
 * @param authObj
 * @param req
 * @param res
 * @param body
 * @param fail
 */
export async function authenticated(
  authObj: Auth,
  req: Request,
  res: Response,
  body: (record: UserRecord, userAuthentication: UserAuthentication) => Promise<void>,
  fail: (token: string | undefined) => Promise<void> = async () => {
    res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed"));
  }) {
  let token = getIdToken(req);
  if (token) {
    let user = await verifyToken(authObj, token);
    if (user) {
      await body(user, toAuth(user.uid));
      return;
    }
  }

  await fail(token);
}

export enum Permission {
  Debug,
  Entrance,
  Promote
}

function permissionToString(permission: Permission): string {
  switch (permission) {
    case Permission.Debug:
      return "debug";
    case Permission.Entrance:
      return "entrance";
    case Permission.Promote:
      return "promote";
  }
}

export async function checkPermission(
  res: Response,
  adminCollection: CollectionReference,
  user: UserAuthentication,
  permission: Permission,
  body: () => Promise<void>,
  fail: () => Promise<void> = async () => {
    res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed@PermissionDenied"));
  }) {
  let permissionStr = permissionToString(permission);
  let doc = await adminCollection.doc(user.firebase_auth_uid).get();
  if (doc.exists) {
    let permissionData = doc.get(permissionStr);
    if (permissionData !== undefined && permissionData != null && permissionData === true) {
      await body()
      return
    }
  }

  // permission not found
  await fail()
}