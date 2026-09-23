import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultTripPreferences } from "@reel/contracts";
import type { PlannerContext, PlanResult } from "@reel/planner";
const mocks = vi.hoisted(() => ({
  center: vi.fn(),
  weather: vi.fn(),
  nearby: vi.fn(),
}));
vi.mock("@reel/ai/itinerary-discovery", () => ({
  createDiscovery: () => mocks,
}));
import { prepareDiscovery } from "../../apps/web/src/server/itinerary-discovery";
const ctx: PlannerContext = {
  destination: "Tokyo",
  startDate: "2026-09-23",
  endDate: "2026-09-23",
  timezone: "Asia/Tokyo",
  preferences: { ...defaultTripPreferences, breakMinutes: 0 },
  places: [],
  reservations: [],
};
const plan: PlanResult = {
  days: [{ date: ctx.startDate, stops: [] }],
  unscheduledPlaceIds: [],
  conflicts: [],
  validationStatus: "valid",
  assumptions: [],
};
beforeEach(() => {
  vi.stubEnv("PLACES_PROVIDER", "google");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "synthetic");
  vi.stubEnv("ITINERARY_NEARBY_ENABLED", "true");
  vi.stubEnv("ITINERARY_WEATHER_PROVIDER", "open-meteo");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
  mocks.center.mockResolvedValue({ lat: 35, lng: 139 });
  mocks.weather.mockResolvedValue([]);
  mocks.nearby.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("keeps all provider calls disabled for fake Places", async () => {
  vi.stubEnv("PLACES_PROVIDER", "fake");
  const prepared = await prepareDiscovery(ctx);
  expect(await prepared.enrich(plan)).toBe(plan);
  expect(mocks.center).not.toHaveBeenCalled();
});
it("leaves a provisional lunch and clear weather fallback when both providers fail", async () => {
  mocks.weather.mockRejectedValue(new Error("offline"));
  mocks.nearby.mockRejectedValue(new Error("offline"));
  const prepared = await prepareDiscovery(ctx);
  const out = await prepared.enrich(plan);
  expect(out.days[0]!.stops[0]!.kind).toBe("meal");
  expect(out.days[0]!.stops[0]!.suggestedVenue).toBeUndefined();
  expect(out.assumptions.join(" ")).toContain("No dated forecast available");
  expect(out.validationStatus).toBe("partially_checked");
});
it("does not request current weather for a trip outside the forecast horizon", async () => {
  await prepareDiscovery({
    ...ctx,
    startDate: "2027-01-01",
    endDate: "2027-01-02",
  });
  expect(mocks.weather).not.toHaveBeenCalled();
});
it("drops weather records for other dates and preserves trip inputs", async () => {
  mocks.weather.mockResolvedValue([
    {
      date: "2026-09-22",
      location: { lat: 35, lng: 139 },
      fetchedAt: "2026-09-22T00:00:00Z",
      hours: [],
    },
  ]);
  const prepared = await prepareDiscovery(ctx);
  expect(prepared.ctx.weather).toEqual([]);
  expect(ctx.weather).toBeUndefined();
});

it("keeps only each stay's relevant forecast day instead of multiplying seven days by seven locations", async () => {
  const accommodations = Array.from({ length: 7 }, (_, i) => ({
    name: `Synthetic stay ${i}`,
    location: { lat: 35 + i / 100, lng: 139 },
    checkIn: `2026-09-${23 + i}`,
    checkOut: `2026-09-${23 + i}`,
  }));
  mocks.weather.mockImplementation(async (location) =>
    Array.from({ length: 16 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 22 + i)).toISOString().slice(0, 10),
      location,
      fetchedAt: "2026-09-22T00:00:00Z",
      hours: [],
    })),
  );
  const result = await prepareDiscovery({
    ...ctx,
    endDate: "2026-09-29",
    preferences: { ...ctx.preferences, accommodations },
  });
  expect(result.ctx.weather).toHaveLength(7);
  expect(mocks.weather).toHaveBeenCalledTimes(7);
  expect(result.ctx.weather?.map((w) => w.location.lat)).toEqual(
    accommodations.map((a) => a.location.lat),
  );
});
