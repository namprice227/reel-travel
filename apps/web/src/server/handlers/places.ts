import type { HandlerMap } from "../http/types";
import { confirmPlace, copyPlacesToTrip, listPlaces, listSavedPlaces, rejectPlace } from "../services/places";
import { listVerificationJobs, verifyPlace } from "../services/place-verification";
import { config } from "../config";
import { runJob } from "../jobs/queue";
import { getPlacePhoto } from "../services/place-photos";
import { getPlaceDetails } from "../services/place-details";

// F2 places. Owner: Member 3.
export const placeHandlers = {
  "places.listSaved": async ({ user }) => ({ places: await listSavedPlaces(user) }),
  "places.photo": async ({ user, params, query }) => ({ photo: await getPlacePhoto(user, params.tripId, params.placeId, query.providerPlaceId) }),
  "places.details": async ({ user, params, query }) => ({ details: await getPlaceDetails(user, params.tripId, params.placeId, query.providerPlaceId) }),
  "places.list": async ({ user, params, query }) => ({ places: await listPlaces(user, params.tripId, query.status),
    verificationJobs: await listVerificationJobs(user, params.tripId) }),
  "places.copy": async ({ user, params, body }) => ({ places: await copyPlacesToTrip(user, params.tripId, body) }),
  "places.verify": async ({ user, params, runAfterResponse }) => {
    const result = await verifyPlace(user, params.tripId, params.placeId);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "places.confirm": async ({ user, params, body }) => confirmPlace(user, params.tripId, params.placeId, body),
  "places.reject": async ({ user, params }) => ({ place: await rejectPlace(user, params.tripId, params.placeId) }),
} satisfies Partial<HandlerMap>;
