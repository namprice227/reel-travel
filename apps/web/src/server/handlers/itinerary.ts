import type { HandlerMap } from "../http/types";
import { editItinerary, generateItinerary, getItinerary } from "../services/itinerary";

// F4/F5 itinerary. Owner: Member 4.
export const itineraryHandlers = {
  "itinerary.get": async ({ user, params }) => getItinerary(user, params.tripId),
  "itinerary.generate": async ({ user, params, body }) => ({
    itinerary: await generateItinerary(user, params.tripId, body),
  }),
  "itinerary.edit": async ({ user, params, body }) => editItinerary(user, params.tripId, body),
} satisfies Partial<HandlerMap>;
