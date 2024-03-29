import {auth} from "firebase-admin";
import Auth = auth.Auth;
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {Request, Response} from "firebase-functions";
import {toAuth, UserAuthentication} from "./api/models/UserAuthentication";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";
import {ReferenceCollection} from "./ReferenceCollection";
import {safeAsBoolean} from "./SafeAs";

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

export function permissionToString(permission: Permission): string {
  switch (permission) {
    case Permission.Debug:
      return "debug";
    case Permission.Entrance:
      return "entrance";
    case Permission.Promote:
      return "promote";
  }
}

export async function hasPermission(user: UserRecord, permission: Permission, collection: ReferenceCollection): Promise<boolean> {
  let permissionStr = permissionToString(permission);
  let doc = await collection.adminCollection.doc(user.uid).get();
  if (doc.exists) {
    let permissionData = safeAsBoolean(doc.get(permissionStr));
    if (permissionData != undefined && permissionData) {
      return true
    }
  }
  return false
}

export async function getUser(auth: Auth, uid: string): Promise<UserRecord | null> {
  return auth.getUser(uid).then(user => {
    return user
  }).catch(_ => {
    return null
  });
}

export async function updatePermission(collection: ReferenceCollection, operator: UserRecord, target_uid: string, data: {[field: string]: any}) {
  await collection.adminCollection.doc(target_uid).set(data, {merge: true});
}