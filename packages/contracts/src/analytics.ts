import { z } from "zod";

/**
 * Product events from docs/operations. Payloads carry ids and counts only:
 * never source text, trip details or uploads.
 */
export const AnalyticsEventName = z.enum([
  "landing_cta_clicked",
  "import_started",
  "import_completed",
  "import_recovered",
  "place_confirmed",
  "plan_generated",
  "stop_moved",
  "share_created",
  "share_revoked",
]);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventName>;

export type AnalyticsProps = Record<string, string | number | boolean | null>;
