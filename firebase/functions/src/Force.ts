import {UserRecord} from "firebase-admin/lib/auth/user-record";
import {Reservation, ReserveRequest} from "./api/models/Reservation";
import {ReferenceCollection} from "./ReferenceCollection";
import {hasPermission, Permission} from "./Auth";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;
import {headCount, sumAll} from "./util";
import {addTakenCapacity, ReservationStatus} from "./api/models/ReservableEvent";
import {registerTicketsToCollection, Ticket} from "./api/models/Ticket";

export const forceReserveID = "[force]"

/**
 * Force a reservation.
 * @param user
 * @param reservationRequest
 * @param collection
 * @param data(備考用)
 * @return null when permission denied.
 */
export async function forceReserve(user: UserRecord, reservationRequest: ReserveRequest, collection: ReferenceCollection, data: string): Promise<Ticket[] | null> {
  if (await hasPermission(user, Permission.ForceReserve, collection)) {
    if (sumAll(reservationRequest.ticket_types.map(ticket => ticket.reservable_group.headcount)) < 1) {
      // 人数が1人未満の場合は予約できない
      return null;
    }

    // Check if the event is available and update the taken_capacity
    const result = await addTakenCapacity(collection.db, collection, reservationRequest.event, headCount(reservationRequest.ticket_types), true);
    if (result === ReservationStatus.RESERVED) {
      // Register Tickets
      const reserved_tickets: Ticket[] = await Promise.all(reservationRequest.ticket_types.map(async ticketType => {
        const ticket_id = await registerTicketsToCollection(collection, ticketType, reservationRequest.event, reservationRequest.reservation_id);
        return {
          ticket_id: ticket_id,
          ticket_type: ticketType,
          event: reservationRequest.event
        }
      }));

      // Register Reservation
      await storeReservation({
        reservation_id: reservationRequest.reservation_id,
        event: reservationRequest.event,
        tickets: reserved_tickets,
      }, collection, data)

      return reserved_tickets;
    }
    return null;
  } else {
    return null;
  }
}

/**
 * Store a reservation. force.
 * @param reservation
 * @param collection
 * @param data(備考用)
 */
async function storeReservation(reservation: Reservation, collection: ReferenceCollection, data: string) {
  const doc = collection.reservationsCollection.doc(forceReserveID).collection("reservations").doc(reservation.reservation_id);
  const eventRef = collection.eventsCollection.doc(reservation.event.event_id);

  const ticket_refs: DocumentReference[] = reservation.tickets.map(ticket => {
    return collection.ticketsCollection.doc(ticket.ticket_id);
  });

  await doc.set({
    event: eventRef,
    tickets: ticket_refs,
    data: data,
    isForce: true
  });
}