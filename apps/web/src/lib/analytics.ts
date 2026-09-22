import type { AnalyticsEventName, AnalyticsProps } from "@reel/contracts";
import { api } from "./api-client";

/**
 * Browser product events (owner: Member 2, FE13; provider set up by Member 4, BE11). Logs in development; connect the chosen
 * analytics provider here. Never send source text, trip details or uploads.
 */
export function track(name: AnalyticsEventName, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV !== "production") console.info(`[analytics] ${name}`, props);
  void api("analytics.track", { body: { name, props } }).catch(() => {
    // Analytics must never block navigation or expose provider details.
  });
}
