import type { HandlerMap } from "../http/types";
import { runJob } from "../jobs/queue";
import {
  addInspirationDetails,
  createInspiration,
  createScreenshotInspiration,
  getInspiration,
  getOwnedAsset,
  listInspirations,
  retryInspiration,
  skipInspiration,
} from "../services/inspirations";

// F1 import. Owners: Member 3 (import), Member 4 (jobs, uploads).
export const inspirationHandlers = {
  "inspirations.list": async ({ user, params }) => ({ inspirations: await listInspirations(user, params.tripId) }),

  "inspirations.create": async ({ user, params, body, runAfterResponse }) => {
    const result = await createInspiration(user, params.tripId, body);
    runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "inspirations.createFromScreenshot": async ({ user, params, body, runAfterResponse }) => {
    const result = await createScreenshotInspiration(user, params.tripId, body);
    runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "inspirations.get": async ({ user, params }) => getInspiration(user, params.tripId, params.inspirationId),

  "inspirations.retry": async ({ user, params, runAfterResponse }) => {
    const result = await retryInspiration(user, params.tripId, params.inspirationId);
    runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "inspirations.addDetails": async ({ user, params, body, runAfterResponse }) => {
    const result = await addInspirationDetails(user, params.tripId, params.inspirationId, body);
    runAfterResponse(() => runJob(result.job.id));
    return result;
  },
  "inspirations.skip": async ({ user, params }) => ({
    inspiration: await skipInspiration(user, params.tripId, params.inspirationId),
  }),

  "uploads.get": async ({ user, params }) => {
    const { asset, bytes } = await getOwnedAsset(user, params.assetId);
    return new Response(bytes, {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
} satisfies Partial<HandlerMap>;
