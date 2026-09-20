import { describe, expect, it } from "vitest";
import { hoursForDate } from "../../apps/web/src/features/itinerary/place-hours";
import { todayIso, tripGroup, tripStatusLabel } from "../../apps/web/src/lib/trip-dates";
import { getGoogleMapsEmbedUrl, getGoogleMapsPlaceUrl } from "../../apps/web/src/lib/maps";

describe("My Trip calendar context", () => {
  const trip = { startDate: "2026-10-01", endDate: "2026-10-02", currentItineraryVersion: 1, timezone: "Asia/Tokyo" };
  it("selects the destination's day before UTC midnight", () => {
    const now = new Date("2026-09-30T16:00:00Z");
    expect(todayIso(now, trip.timezone)).toBe("2026-10-01");
    expect(tripGroup(trip, now)).toBe("current");
    expect(tripStatusLabel(trip, now)).toBe("Day 1 of 2");
    expect(tripStatusLabel(trip, new Date("2026-10-01T16:00:00Z"))).toBe("Day 2 of 2");
    expect(tripGroup(trip, new Date("2026-10-02T16:00:00Z"))).toBe("past");
  });
  it("handles a trip west of UTC and daylight-saving boundaries", () => {
    expect(todayIso(new Date("2026-11-01T06:30:00Z"), "America/Los_Angeles")).toBe("2026-10-31");
    expect(todayIso(new Date("2026-11-01T09:30:00Z"), "America/Los_Angeles")).toBe("2026-11-01");
  });
  it("keeps future drafts distinct from saved itineraries", () => {
    expect(tripGroup({ ...trip, currentItineraryVersion: null }, new Date("2026-09-20T12:00:00Z"))).toBe("draft");
  });
});

describe("planned-date hours", () => {
  it("keeps missing hours unknown", () => {
    expect(hoursForDate(undefined, "2026-10-01")).toBe("Hours unknown");
    expect(hoursForDate({ status: "unknown" }, "2026-10-01")).toBe("Hours unknown");
  });
  it("uses the itinerary date and preserves split windows in order", () => {
    expect(hoursForDate({ status: "known", windows: [
      { day: 0, open: "17:00", close: "22:00" }, { day: 0, open: "09:00", close: "12:00" },
      { day: 1, open: "10:00", close: "20:00" },
    ] }, "2026-09-20")).toBe("Sun hours · 09:00–12:00, 17:00–22:00");
  });
  it("reports a closed weekday without inventing hours", () => {
    expect(hoursForDate({ status: "known", windows: [{ day: 1, open: "10:00", close: "20:00" }] }, "2026-09-20")).toBe("Closed on Sun");
  });
});

describe("confirmed-location map links", () => {
  const location = { lat: 35.71, lng: 139.81 };
  it("prefers the canonical Google URL and otherwise keeps place ID and coordinates", () => {
    const canonical = "https://maps.google.com/?cid=123";
    expect(getGoogleMapsPlaceUrl({ location, providerUrl: canonical })).toBe(canonical);
    const url = new URL(getGoogleMapsPlaceUrl({ location, name: "A repeated branch name", placeId: "sample-id" }));
    expect(url.searchParams.get("query")).toBe("35.71,139.81");
    expect(url.searchParams.get("query_place_id")).toBe("sample-id");
  });
  it("rejects non-Google, credential-bearing and executable provider URLs", () => {
    for (const providerUrl of ["javascript:alert(1)", "https://google.com.evil.test/maps", "https://user:password@google.com/maps"]) {
      expect(new URL(getGoogleMapsPlaceUrl({ location, providerUrl })).hostname).toBe("www.google.com");
    }
  });
  it("embeds coordinates with English requested and no invented fixture venue query", () => {
    const url = new URL(getGoogleMapsEmbedUrl({ location, label: "Fictional fixture" }));
    expect(url.searchParams.get("q")).toBe("35.71,139.81");
    expect(url.searchParams.get("hl")).toBe("en");
    expect(url.searchParams.has("key")).toBe(false);
    expect(getGoogleMapsPlaceUrl({})).toBe("https://www.google.com/maps");
  });
});
