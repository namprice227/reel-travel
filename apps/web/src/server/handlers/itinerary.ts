import type { HandlerMap } from "../http/types";
import { addItineraryPlace, editItinerary, generateItinerary, getItinerary, updateItineraryPlace } from "../services/itinerary";

// F4/F5 itinerary. Owner: Member 4.
export const itineraryHandlers = {
  "itinerary.get": async ({ user, params }) => getItinerary(user, params.tripId),
  "itinerary.generate": async ({ user, params, body }) => ({
    itinerary: await generateItinerary(user, params.tripId, body),
  }),
  "itinerary.edit": async ({ user, params, body }) => editItinerary(user, params.tripId, body),
  "itinerary.addPlace": async ({ user, params, body }) => addItineraryPlace(user, params.tripId, body),
  "itinerary.updatePlace": async ({ user, params, body }) => updateItineraryPlace(user, params.tripId, params.placeId, body),
} satisfies Partial<HandlerMap>;
