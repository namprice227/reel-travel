/** Public web-stream ID supplied by the project owner; never use a Measurement Protocol secret here. */
export const GA4_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "G-1MNPG57MNM";
type EventProps = Record<string, string | number | boolean>;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  reelGa4Ready?: boolean;
  reelGa4LastPage?: string;
};

/** Aggregate dynamic routes and omit every query/hash, including share tokens and trip/place IDs. */
export function analyticsPath(pathname: string): string {
  if (/^\/s\//.test(pathname)) return "/s/[token]";
  if (
    /^\/my-trip\/(?!new(?:\/|$)|all(?:\/|$))[^/]+(?:\/(?:itinerary|map|setup|share|places|timeline)|\/place\/[^/]+)?$/.test(
      pathname,
    )
  )
    return pathname
      .replace(/^\/my-trip\/[^/]+/, "/my-trip/[tripId]")
      .replace(/\/place\/[^/]+/, "/place/[placeId]");
  return [
    "/",
    "/home",
    "/sign-in",
    "/my-trip",
    "/my-trip/new",
    "/my-trip/all",
    "/inspiration-library",
    "/discover",
    "/privacy",
    "/terms",
  ].includes(pathname)
    ? pathname
    : "/other";
}
function browser(): AnalyticsWindow | null {
  return typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_GA4_ENABLED !== "false"
    ? window
    : null;
}
export function initializeGa4(): void {
  const w = browser();
  if (!w || w.reelGa4Ready) return;
  if (!/^G-[A-Z0-9]+$/.test(GA4_MEASUREMENT_ID)) return;
  w.dataLayer ??= [];
  w.gtag ??= function () {
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA4_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: w.location.origin + analyticsPath(w.location.pathname),
    page_title: "Reel Travel",
    page_referrer: "",
  });
  w.reelGa4Ready = true;
}
export function ga4Event(name: string, props: EventProps = {}): void {
  try {
    const w = browser();
    if (!w) return;
    initializeGa4();
    let debug = false;
    try {
      debug = w.sessionStorage.getItem("reel.analytics.debug") === "1";
    } catch {
      /* storage can be disabled */
    }
    w.gtag?.("event", name, {
      ...props,
      send_to: GA4_MEASUREMENT_ID,
      page_location: w.location.origin + analyticsPath(w.location.pathname),
      page_title: "Reel Travel",
      page_referrer: "",
      ...(debug ? { debug_mode: true, traffic_type: "developer" } : {}),
    });
  } catch {
    /* Analytics never blocks the product flow. */
  }
}
export function ga4PageView(pathname: string): void {
  const w = browser();
  if (!w || w.reelGa4LastPage === pathname) return;
  // Remember only in memory. Different trips count as navigation but their IDs never leave the browser.
  w.reelGa4LastPage = pathname;
  ga4Event("page_view", { page_path: analyticsPath(pathname) });
}

const actionEvents: Record<string, string> = {
  "trips.create": "trip_created",
  "places.copy": "places_added",
  "places.confirm": "place_confirmed",
  "inspirations.create": "import_submitted",
  "inspirations.createFromScreenshot": "import_submitted",
  "inspirations.retry": "import_retried",
  "inspirations.addDetails": "import_retried",
  "itinerary.generate": "plan_generated",
  "itinerary.edit": "itinerary_edited",
  "shares.create": "share_created",
  "shares.revoke": "share_revoked",
};
/** Only extract explicitly selected enums/counts; never forward request or response objects. */
export function trackApiAction(
  id: string,
  phase: "start" | "success" | "failure",
  body: unknown,
  response?: unknown,
  status?: number,
): void {
  const event = actionEvents[id];
  if (!event) return;
  const input = body as Record<string, unknown> | undefined;
  if (id === "itinerary.edit" && input?.dryRun) return;
  const props: EventProps = {};
  if (id === "itinerary.generate")
    props.generation_kind =
      input?.expectedVersion == null ? "initial" : "regeneration";
  if (phase === "start") {
    if (id === "itinerary.generate") ga4Event("plan_generation_started", props);
    return;
  }
  if (phase === "failure") {
    ga4Event("action_failed", {
      ...props,
      action: id,
      http_status: status ?? 0,
    });
    return;
  }
  const result = response as Record<string, unknown> | undefined;
  if (id === "places.copy" && Array.isArray(result?.places))
    props.place_count = result.places.length;
  if (id === "inspirations.createFromScreenshot") props.source_type = "image";
  else if (
    id === "inspirations.create" &&
    ["text", "link", "audio", "image", "video"].includes(
      String(input?.sourceType),
    )
  )
    props.source_type = String(input?.sourceType);
  if (id === "itinerary.edit") {
    const edit = input?.edit as { type?: string } | undefined;
    if (
      ["move_stop", "remove_stop", "add_place", "replace_stop"].includes(
        edit?.type ?? "",
      )
    )
      props.edit_type = edit!.type!;
  }
  ga4Event(event, props);
}
