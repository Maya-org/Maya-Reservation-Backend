/**
 * TSのゴミ仕様に対抗する
 * @return {string|undefined} 絶対にこれのどっちかを返す
 */
import {database} from "firebase-admin";
import Reference = database.Reference;

export function safeAsString(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "string") {
    return value;
  }
  return undefined;
}

/**
 * TSのゴミ仕様に対抗する
 * @return {number|undefined} 絶対にこれのどっちかを返す
 */
export function safeAsNumber(value: any): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "number") {
    return value;
  }
  return undefined;
}

/**
 * TSのゴミ仕様に対抗する
 * @return {Reference|undefined} 絶対にこれのどっちかを返す
 */
export function safeAsReference(value: any): Reference | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value as Reference;
}