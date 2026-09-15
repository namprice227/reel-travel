import type { HandlerMap } from "../http/types";
import { confirmPlace, listPlaces, rejectPlace } from "../services/places";

// F2 places. Owner: Member 3.
export const placeHandlers = {
  "places.list": async ({ user, params, query }) => ({ places: await listPlaces(user, params.tripId, query.status) }),
  "places.confirm": async ({ user, params, body }) => confirmPlace(user, params.tripId, params.placeId, body),
  "places.reject": async ({ user, params }) => ({ place: await rejectPlace(user, params.tripId, params.placeId) }),
} satisfies Partial<HandlerMap>;
