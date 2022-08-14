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