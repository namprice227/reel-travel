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

export const AnalyticsPropsSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
  z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]),
).refine((props) => Object.keys(props).length <= 20, "At most 20 analytics properties");
export type AnalyticsProps = z.infer<typeof AnalyticsPropsSchema>;

export const AnalyticsEvent = z.object({ name: AnalyticsEventName, props: AnalyticsPropsSchema.default({}) });
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;
