/**
 * TSのゴミ仕様に対抗する
 * @return {string|undefined} 絶対にこれのどっちかを返す
 */
export function safeAsString(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  } else if (typeof value === "string") {
    return value;
  }
  return undefined;
}