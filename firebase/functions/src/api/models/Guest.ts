export type Guest = {
  type: "Adult" | "Child" | "Parent" | "Student" | "Staff";
}

export function guestFromString(type: string): Guest | null {
  switch (type) {
    case "Adult":
    case "Child":
    case "Parent":
    case "Student":
    case "Staff":
      return {
        type: type as "Adult" | "Child" | "Parent" | "Student" | "Staff"
      }
  }
  return null;
}