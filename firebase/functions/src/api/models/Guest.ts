export type Guest = {
  type: "Adult" | "Child" | "Parent" | "Student" | "Staff";
}

export const guestTypes = ["Adult", "Child", "Parent", "Student", "Staff"];

export function guestFromString(type: string): Guest | null {
  switch (type) {
    case "Adult":
    case "Child":
    case "Parent":
    case "Student":
    case "Staff":
      return {
        type: type
      }
  }
  return null;
}