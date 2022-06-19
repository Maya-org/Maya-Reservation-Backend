import {UserAuthentication} from "./UserAuthentication";
import {ReservableEvent} from "./ReservableEvent";

export type Reservation = {
    user: UserAuthentication;
    reservation_id: string;
    event: ReservableEvent;
    member_all?: number;
    group_data: Group;
}