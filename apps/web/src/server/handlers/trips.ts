import type { HandlerMap } from "../http/types";
import { resolveTripCity, searchTripCities } from "../services/destinations";
import {
  createReservation,
  createTrip,
  deleteTrip,
  deleteReservation,
  getTrip,
  listReservations,
  listTrips,
  uploadTripCover,
  updateTrip,
} from "../services/trips";
import { checkStayPlace, suggestStays } from "../services/stays";

// F3 trip setup. Owner: Member 4.
export const tripHandlers = {
  "destinations.searchCities": async ({ user, query }) => searchTripCities(user, query),
  "destinations.resolveCity": async ({ user, body }) => resolveTripCity(user, body),
  "trips.list": async ({ user }) => ({ trips: await listTrips(user) }),
  "trips.create": async ({ user, body }) => ({ trip: await createTrip(user, body) }),
  "trips.get": async ({ user, params }) => ({ trip: await getTrip(user, params.tripId) }),
  "trips.update": async ({ user, params, body }) => ({ trip: await updateTrip(user, params.tripId, body) }),
  "trips.delete": async ({ user, params }) => {
    await deleteTrip(user, params.tripId);
    return { ok: true };
  },
  "trips.cover.upload": async ({ user, params, body }) => ({ trip: await uploadTripCover(user, params.tripId, body) }),
  "stays.suggest": async ({ user, params, query }) => suggestStays(user, params.tripId, query.q, query.session),
  "stays.place": async ({ user, params, query }) => ({ result: await checkStayPlace(user, params.tripId, query.id, query.session) }),

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
