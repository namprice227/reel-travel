import type { HandlerMap } from "../http/types";
import { runJobInline } from "../jobs/inline";
import { config } from "../config";
import { addAccountReelDetails, createAccountReel, deleteAccountReel, keepReelAsIdeas, listAccountReels, mapAccountReelPlaces } from "../services/account-reels";
import { getAccountPlacePhoto } from "../services/place-photos";
import {
  addInspirationDetails,
  createInspiration,
  createScreenshotInspiration,
  getInspiration,
  getOwnedInspiration,
  getOwnedAsset,
  listInspirations,
  retryInspiration,
  skipInspiration,
} from "../services/inspirations";

// F1 import. Owners: Member 3 (import), Member 4 (jobs, uploads).
export const inspirationHandlers = {
  "accountReels.list": async ({ user }) => listAccountReels(user),
  "accountReels.create": async ({ user, body, runAfterResponse }) => {
    const result = await createAccountReel(user, body.url);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
    return result;
  },
  "accountReels.addDetails": async ({ user, params, body, runAfterResponse }) => {
    const result = await addAccountReelDetails(user, params.reelId, body.text);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
    return result;
  },
  "accountReels.mapPlaces": async ({ user, params }) => ({
    places: await mapAccountReelPlaces(user, params.reelId),
  }),
  "accountReels.placePhoto": async ({ user, params, query }) => ({
    photo: await getAccountPlacePhoto(user, params.reelId, params.placeId, query.providerPlaceId),
  }),
  "accountReels.keepAsIdeas": async ({ user, params }) => keepReelAsIdeas(user, params.reelId),
  "accountReels.delete": async ({ user, params }) => {
    await deleteAccountReel(user, params.reelId);
    return { ok: true };
  },
  "inspirations.list": async ({ user, params }) => ({ inspirations: await listInspirations(user, params.tripId) }),

  "inspirations.create": async ({ user, params, body, runAfterResponse }) => {
    const result = await createInspiration(user, params.tripId, body);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
    return result;
  },
  "inspirations.createFromScreenshot": async ({ user, params, body, runAfterResponse }) => {
    const result = await createScreenshotInspiration(user, params.tripId, body);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
    return result;
  },
  "inspirations.get": async ({ user, params }) => getInspiration(user, params.tripId, params.inspirationId),
  "inspirations.getOwned": async ({ user, params }) => getOwnedInspiration(user, params.inspirationId),

  "inspirations.retry": async ({ user, params, runAfterResponse }) => {
    const result = await retryInspiration(user, params.tripId, params.inspirationId);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
    return result;
  },
  "inspirations.addDetails": async ({ user, params, body, runAfterResponse }) => {
    const result = await addInspirationDetails(user, params.tripId, params.inspirationId, body);
    if (config.inlineImportsEnabled) runAfterResponse(() => runJobInline(result.job.id));
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
