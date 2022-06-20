type Guest = {
  type: "Adult" | "Child" | "Parent" | "Student" | "Staff";
  relating_group: Group;
}