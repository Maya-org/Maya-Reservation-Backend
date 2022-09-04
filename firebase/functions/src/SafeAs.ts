/**
 * TSのゴミ仕様に対抗する
 * @return {string|undefined} 絶対にこれのどっちかを返す
 */
import {firestore} from "firebase-admin";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import DocumentReference = firestore.DocumentReference;
import Timestamp = firestore.Timestamp;

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
 * @return {DocumentReference|undefined} 絶対にこれのどっちかを返す
 */
export function safeAsReference(value: any): DocumentReference | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value as DocumentReference;
}

/**
 * TSのゴミ仕様に対抗する
 * @return {DocumentSnapshot|undefined} 絶対にこれのどっちかを返す
 */
export function safeAsDocumentSnapshot(value: any): DocumentSnapshot | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value as DocumentSnapshot;
}

export function safeGet(obj: any | undefined, key: string): any | undefined {
  if (obj !== undefined) {
    return obj[key];
  } else {
    return undefined
  }
}

export function safeAsBoolean(value: any): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

export function mapUndefinedToNull<T>(obj: T | null | undefined): T | null {
  if (obj === undefined) {
    return null;
  } else {
    return obj;
  }
}

export function mapNullToUndefined<T>(obj: T | null | undefined): T | undefined {
  if (obj === null) {
    return undefined;
  } else {
    return obj;
  }
}

export function safeAsTimeStamp(value: any): Timestamp | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (value instanceof Timestamp) {
    return value;
  }
  return undefined;
}

export function safeAsObject(value:any):Object | undefined{
  if(value === undefined || value === null){
    return undefined;
  }else if(typeof value === "object"){
    return value;
  }
  return undefined;
}