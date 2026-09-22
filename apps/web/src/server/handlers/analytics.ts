import type { HandlerMap } from "../http/types";
import { deliverAnalytics } from "../analytics";
import { enforceRateLimit } from "../services/rate-limits";

export const analyticsHandlers = {
  "analytics.track": async ({ body, request, runAfterResponse }) => {
    const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
    const client = forwarded.split(",", 1)[0]!.trim().slice(0, 100) || "unknown";
    await enforceRateLimit(`analytics-minute:${client}`, { limit: 120, windowMs: 60_000 });
    runAfterResponse(() => deliverAnalytics(body.name, body.props));
    return { ok: true as const };
  },
} satisfies Pick<HandlerMap, "analytics.track">;
