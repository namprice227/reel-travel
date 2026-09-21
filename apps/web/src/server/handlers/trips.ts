import type { HandlerMap } from "../http/types";
import {
  createReservation,
  createTrip,
  deleteReservation,
  getTrip,
  listReservations,
  listTrips,
  uploadTripCover,
  updateTrip,
} from "../services/trips";

// F3 trip setup. Owner: Member 4.
export const tripHandlers = {
  "trips.list": async ({ user }) => ({ trips: await listTrips(user) }),
  "trips.create": async ({ user, body }) => ({ trip: await createTrip(user, body) }),
  "trips.get": async ({ user, params }) => ({ trip: await getTrip(user, params.tripId) }),
  "trips.update": async ({ user, params, body }) => ({ trip: await updateTrip(user, params.tripId, body) }),
  "trips.cover.upload": async ({ user, params, body }) => ({ trip: await uploadTripCover(user, params.tripId, body) }),

  "reservations.list": async ({ user, params }) => ({
    reservations: await listReservations(user, params.tripId),
  }),
  "reservations.create": async ({ user, params, body }) => ({
    reservation: await createReservation(user, params.tripId, body),
  }),
  "reservations.delete": async ({ user, params }) => {
    await deleteReservation(user, params.tripId, params.reservationId);
    return { ok: true };
  },
} satisfies Partial<HandlerMap>;
