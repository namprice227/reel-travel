import type { HandlerMap } from "../http/types";
import { createShare, getSharedView, listShares, revokeShare } from "../services/shares";

// F6 sharing. Owner: Member 4.
export const sharingHandlers = {
  "shares.list": async ({ user, params }) => ({ shares: await listShares(user, params.tripId) }),
  "shares.create": async ({ user, params, request }) => createShare(user, params.tripId, new URL(request.url).origin),
  "shares.revoke": async ({ user, params }) => ({ share: await revokeShare(user, params.tripId, params.shareId) }),
  "shared.get": async ({ params }) => ({ view: await getSharedView(params.token) }),
} satisfies Partial<HandlerMap>;
