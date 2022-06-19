import {safeAsString} from "../../SafeAs";
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

export function toAuth(obj: any): UserAuthentication | undefined {
    let firebase_auth_uid = safeAsString(obj.firebase_auth_uid);
    if (firebase_auth_uid != undefined) {
        return {
            firebase_auth_uid: firebase_auth_uid
        }
    }
    return undefined;
}