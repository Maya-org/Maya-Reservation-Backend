import {Request} from "firebase-functions/lib/common/providers/https";
import {auth} from "firebase-admin";
import Auth = auth.Auth;
import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {Response} from "firebase-functions";
import {toAuth, UserAuthentication} from "./api/models/UserAuthentication";
import {toUserAuthenticationFailed} from "./api/responces/UserAuthenticationFailed";

/**
 * @return {string} The authentication bearer token.
 * @param req
 */
export function getIdToken(req: Request): string | undefined {
  let auth = req.headers.authorization;
  if (auth === undefined) {
    return undefined;
  } else {
    let token = auth.match(/^Bearer (.*)$/);
    if (token) {
      return token[0];
    } else {
      return undefined;
    }
  }
}

export async function verifyToken(auth: Auth, token: string): Promise<UserRecord | undefined> {
  let decoded = await auth.verifyIdToken(token);
  let uid = decoded.uid;
  try {
    return await auth.getUser(uid);
  } catch (e) {
    return undefined
  }
}

/**
 * Firebase Authenticationの認証を行った上でリクエストを処理する。
 *
 * @param auth
 * @param req
 * @param res
 * @param body
 * @param fail
 */
export async function authenticated(
  auth: Auth,
  req: Request,
  res: Response,
  body: (record: UserRecord, userAuthentication: UserAuthentication) => Promise<void>,
  fail: (token: string | undefined) => Promise<void> = async () => {
    res.status(401).send(toUserAuthenticationFailed("UserAuthenticationFailed"));
  }) {
  let token = getIdToken(req);
  if (token) {
    let user = await verifyToken(auth, token);
    if (user) {
      await body(user, toAuth(user.uid));
      return;
    }
  }

  await fail(token);
}