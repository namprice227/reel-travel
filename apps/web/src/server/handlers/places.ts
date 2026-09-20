import type { HandlerMap } from "../http/types";
import { confirmPlace, listPlaces, rejectPlace } from "../services/places";
import { listVerificationJobs, verifyPlace } from "../services/place-verification";
import { config } from "../config";
import { runJob } from "../jobs/queue";

// F2 places. Owner: Member 3.
export const placeHandlers = {
  "places.list": async ({ user, params, query }) => ({ places: await listPlaces(user, params.tripId, query.status),
    verificationJobs: await listVerificationJobs(user, params.tripId) }),
  "places.verify": async ({ user, params, runAfterResponse }) => {
    const result = await verifyPlace(user, params.tripId, params.placeId);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "places.confirm": async ({ user, params, body }) => confirmPlace(user, params.tripId, params.placeId, body),
  "places.reject": async ({ user, params }) => ({ place: await rejectPlace(user, params.tripId, params.placeId) }),
} satisfies Partial<HandlerMap>;
