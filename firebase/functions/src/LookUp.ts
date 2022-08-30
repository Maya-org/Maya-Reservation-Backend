import {readReserveID, Ticket, ticketByID} from "./api/models/Ticket";
import {ReferenceCollection} from "./ReferenceCollection";
import {Reservation, reservationByID} from "./api/models/Reservation";
import {RawTrackData, readAllTrackData} from "./Track";
import {mapUndefinedToNull} from "./SafeAs";

export type LookUpData = {
  tracks: (RawTrackData | null)[];
  reserveId: string | null;
  reservation: Reservation | null;
}

export async function lookUp(collection: ReferenceCollection, userId: string, ticketId: string): Promise<LookUpData> {
  const trackData = await readAllTrackData(collection, ticketId);
  const ticket: Ticket | null = await ticketByID(collection, ticketId);
  const reserveId: string | undefined = ticket != null ? await readReserveID(collection, ticket) : undefined;
  const reservation = reserveId != null ? await reservationByID(collection, userId, reserveId) : null;

  return {
    tracks: trackData,
    reserveId: mapUndefinedToNull(reserveId),
    reservation: reservation
  };
}