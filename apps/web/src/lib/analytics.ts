import type { AnalyticsEventName, AnalyticsProps } from "@reel/contracts";

/**
 * Browser product events (owner: Member 4, D03). Logs in development; connect the chosen
 * analytics provider here. Never send source text, trip details or uploads.
 */
export function track(name: AnalyticsEventName, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV !== "production") console.info(`[analytics] ${name}`, props);
}
