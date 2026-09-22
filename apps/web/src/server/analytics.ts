import type { AnalyticsEventName, AnalyticsProps } from "@reel/contracts";
import { AnalyticsEvent } from "@reel/contracts";
import { config } from "./config";

/**
 * Server-side product events (owner: Member 4, BE11). Logs only for now; connect a provider here.
 * Props must be ids, counts and enums: no source text, trip details or uploads.
 */
export function trackServer(name: AnalyticsEventName, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  void deliverAnalytics(name, props).catch((error) => console.error("[analytics] delivery failed", error));
}

export async function deliverAnalytics(name: AnalyticsEventName, props: AnalyticsProps = {}): Promise<void> {
  const event = AnalyticsEvent.parse({ name, props });
  const endpoint = config.analyticsEndpoint;
  if (!endpoint) {
    if (!config.isProduction) console.info(`[analytics] ${name} ${JSON.stringify(props)}`);
    return;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.analyticsWriteKey ? { Authorization: `Bearer ${config.analyticsWriteKey}` } : {}),
    },
    body: JSON.stringify({ ...event, sentAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Analytics sink returned HTTP ${response.status}.`);
}
