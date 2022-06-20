import {ReservableEvent} from "./ReservableEvent";

export type Reservation = {
  reservation_id: string;
  event: ReservableEvent;
  member_all?: number;
  group_data: Group;
}