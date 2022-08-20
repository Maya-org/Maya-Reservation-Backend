import {Request, Response} from "firebase-functions";
import {toInternalException} from "./api/responces/InternalException";

/**
 * リクエストの種類がGETならbodyを実行する。
 * @param q
 * @param s
 * @param body
 */
export async function onGET(q: Request, s: Response, body: (req: Request, res: Response) => Promise<void>) {
  if (q.method === "GET") {
    await body(q, s);
  }
}

/**
 * リクエストの種類がPOSTならbodyを実行する。
 * @param q
 * @param s
 * @param body
 */
export async function onPOST(q: Request, s: Response, body: (json: { [name: string]: any }, res: Response) => Promise<void>) {
  if (q.method === "POST") {
    try {
      const json: any | null | undefined = JSON.parse(q.body);
      if (json) {
        await body(json, s);
      }
    } catch (e) {
      // 握り潰しはしません
      s.status(400).send(toInternalException("InternalException@InvalidJson", "InvalidJson"));
    }
  }
}

export function handleOption(q: Request, s: Response) {
  if (q.method === "OPTIONS") {
    s.status(200).send({data:"OPTIONS"});
  }
}

/**
 * Typeプロパティを追加する
 * @param obj
 * @param type
 */
export function addTypeProperty(obj: {}, type: string): {} {
  return Object.assign(obj, {"type": type});
}

const origin = "https://maya-e0346.web.app";

export function applyCORSHeaders(s: Response) {
  s.header("Access-Control-Allow-Origin", origin);
  s.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
  s.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept , Authorization");
}