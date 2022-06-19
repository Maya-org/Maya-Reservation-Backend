import {Reservation} from "./Reservation";

export type ReservableEvent = {
    event_id: number;
    display_name: string;
    description?: string;

    dating: {
        date_start: string;
        date_end?: string;
        available_at?: string;
    }

    capacity?: number;
    taken_capacity: number;
    reservations: Reservation[];
    required_reservation: ReservableEvent;
}