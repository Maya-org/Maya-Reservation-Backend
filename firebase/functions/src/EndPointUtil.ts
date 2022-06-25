import {Request, Response} from "firebase-functions";

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
export async function onPOST(q: Request, s: Response, body: (req: Request, res: Response) => Promise<void>) {
  if (q.method === "POST") {
    await body(q, s);
  }
}