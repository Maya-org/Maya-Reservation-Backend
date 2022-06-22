import Reference = database.Reference;
import {database} from "firebase-admin";

export type Reservation = {
  reservation_id: string;
  event: Reference;
  member_all?: number;
  group_data: Group;
}