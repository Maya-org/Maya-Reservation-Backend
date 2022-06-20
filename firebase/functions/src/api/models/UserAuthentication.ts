import {auth} from "firebase-admin";
import Auth = auth.Auth;

export type UserAuthentication = {
  firebase_auth_uid: string;
}

/**
 * UserAuthenticationが登録済みのユーザーを指しているかどうかをFirebase.authで判定する
 * @param firebaseAuth
 * @param userAuthentication
 * @returns {boolean} true: 登録済み, false: 未登録 | エラー
 */
export async function isValidUserAuthentication(firebaseAuth: Auth, userAuthentication: UserAuthentication): Promise<boolean> {
  return firebaseAuth.getUser(userAuthentication.firebase_auth_uid).then((userR) => {
    return true;
  }).catch((error) => {
    return false;
  });
}

/**
 * @return {UserAuthentication} A new instance of UserAuthentication
 * @param firebase_auth_uid
 */
export function toAuth(firebase_auth_uid: string): UserAuthentication {
  return {
    firebase_auth_uid: firebase_auth_uid
  };
}