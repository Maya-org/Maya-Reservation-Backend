import {TicketType} from "./api/models/TicketType";

const {error} = require("firebase-functions/lib/logger");

export function findFirst<T>(arr: Array<T>, predicate: (item: T) => boolean): T | undefined {
  for (const item of arr) {
    if (predicate(item)) {
      return item;
    }
  }
  return undefined;
}

export function any<T>(arr: Array<T>, predicate: (item: T) => boolean): boolean {
  for (const item of arr) {
    if (predicate(item)) {
      return true;
    }
  }
  return false;
}

export function errorGCP(...args: any[]) {
  error(args);
}

export function sumAll(arr: Array<number>): number {
  let sum = 0;
  for (const item of arr) {
    sum += item;
  }
  return sum;
}

export function headCount(arr: TicketType[]): number {
  return sumAll(arr.map(type => type.reservable_group.headcount));
}

export function mapUndefined<I, R>(value: undefined | I, f: (I: I) => R): R | undefined {
  if (value === undefined) {
    return undefined;
  } else {
    return f(value);
  }
}