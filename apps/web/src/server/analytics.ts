import type { AnalyticsEventName, AnalyticsProps } from "@reel/contracts";

/**
 * Server-side product events (owner: Member 4, BE11). Logs only for now; connect a provider here.
 * Props must be ids, counts and enums: no source text, trip details or uploads.
 */
export function trackServer(name: AnalyticsEventName, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  console.info(`[analytics] ${name} ${JSON.stringify(props)}`);
}
