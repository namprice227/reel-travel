import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  analyticsPath,
  ga4PageView,
  ga4Event,
  trackApiAction,
} from "../../apps/web/src/lib/ga4";
const gtag = vi.fn();
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_GA4_ENABLED", "true");
  vi.stubGlobal("window", {
    location: {
      origin: "https://reel-travel.vercel.app",
      pathname: "/my-trip/private-trip/itinerary",
    },
    sessionStorage: { getItem: () => null },
    gtag,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("aggregates private routes and does not send unknown route text", () => {
  expect(analyticsPath("/my-trip/private-trip/itinerary")).toBe(
    "/my-trip/[tripId]/itinerary",
  );
  expect(analyticsPath("/my-trip/private-trip/place/private-place")).toBe(
    "/my-trip/[tripId]/place/[placeId]",
  );
  expect(analyticsPath("/s/secret-token")).toBe("/s/[token]");
  expect(analyticsPath("/my-trip/new")).toBe("/my-trip/new");
  expect(analyticsPath("/unexpected/person@example.com")).toBe("/other");
  expect(analyticsPath("/my-trip/id/person@example.com")).toBe("/other");
});
it("sends one manual pageview per pathname transition, including SPA back navigation", () => {
  ga4PageView("/home");
  ga4PageView("/home");
  ga4PageView("/my-trip");
  ga4PageView("/home");
  expect(gtag.mock.calls.filter((c) => c[1] === "page_view")).toHaveLength(3);
  expect(gtag.mock.calls.find((c) => c[0] === "config")?.[2]).toMatchObject({
    send_page_view: false,
    allow_google_signals: false,
  });
  expect(JSON.stringify(gtag.mock.calls)).not.toContain("private-trip");
});
it("tracks fresh generation versus regeneration and separates starts, successes and failures", () => {
  trackApiAction("itinerary.generate", "start", { expectedVersion: 1 });
  trackApiAction(
    "itinerary.generate",
    "success",
    { expectedVersion: 1 },
    { itinerary: { title: "PRIVATE" } },
  );
  trackApiAction(
    "itinerary.generate",
    "failure",
    { expectedVersion: null },
    undefined,
    502,
  );
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "plan_generation_started",
    expect.objectContaining({ generation_kind: "regeneration" }),
  );
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "plan_generated",
    expect.objectContaining({ generation_kind: "regeneration" }),
  );
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "action_failed",
    expect.objectContaining({ generation_kind: "initial", http_status: 502 }),
  );
  expect(JSON.stringify(gtag.mock.calls)).not.toContain("PRIVATE");
});
it("records counts and source enums without form text, identifiers or response content", () => {
  trackApiAction(
    "places.copy",
    "success",
    { placeIds: ["SECRET"] },
    { places: [{ id: "SECRET" }] },
  );
  trackApiAction("inspirations.create", "success", {
    sourceType: "text",
    text: "PRIVATE",
  });
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "places_added",
    expect.objectContaining({ place_count: 1 }),
  );
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "import_submitted",
    expect.objectContaining({ source_type: "text" }),
  );
  expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/SECRET|PRIVATE/);
});
it("does not count dry-run edits, polling or development traffic", () => {
  trackApiAction("itinerary.edit", "success", { dryRun: true });
  trackApiAction("inspirations.get", "success", {});
  vi.stubEnv("NODE_ENV", "development");
  ga4PageView("/home");
  expect(gtag).not.toHaveBeenCalled();
});
it("labels debug visits and tolerates blocked analytics", () => {
  window.sessionStorage.getItem = () => "1";
  ga4Event("landing_cta_clicked");
  expect(gtag).toHaveBeenCalledWith(
    "event",
    "landing_cta_clicked",
    expect.objectContaining({ debug_mode: true, traffic_type: "developer" }),
  );
  gtag.mockImplementationOnce(() => {
    throw new Error("blocked");
  });
  expect(() => ga4Event("landing_cta_clicked")).not.toThrow();
});
