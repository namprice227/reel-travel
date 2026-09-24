import { it, expect, vi } from "vitest";
import { createDiscovery } from "./itinerary-discovery";
import type { NearbySlot } from "@reel/planner";
const slot: NearbySlot = {
  date: "2026-10-01",
  stopId: "lunch",
  anchor: { lat: 35, lng: 139 },
  kind: "meal",
  start: "12:00",
  end: "13:00",
  radiusMeters: 1000,
  query: "vegetarian restaurants",
  preferIndoor: false,
};
const item = {
  id: "synthetic",
  displayName: { text: "Synthetic Restaurant" },
  location: { latitude: 35, longitude: 139 },
  types: ["restaurant"],
  businessStatus: "OPERATIONAL",
  regularOpeningHours: {
    periods: [{ open: { day: 4, hour: 11 }, close: { day: 4, hour: 14 } }],
  },
};
it("sends a geographic bias and thin field mask, never current openNow for a future trip", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      places: [
        item,
        { ...item, id: "closed", businessStatus: "CLOSED_TEMPORARILY" },
      ],
    }),
  );
  const out = await createDiscovery({ apiKey: "test-only", fetch }).nearby(
    slot,
  );
  expect(out).toHaveLength(1);
  expect(out[0]!.facts.openingHours).toEqual({
    status: "known",
    windows: [{ day: 4, open: "11:00", close: "14:00" }],
  });
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  expect(body.locationBias.circle.radius).toBe(1000);
  expect(body.languageCode).toBe("en");
  expect(body.openNow).toBeUndefined();
  expect(
    (init.headers as Record<string, string>)["X-Goog-FieldMask"],
  ).not.toContain("reviews");
  expect(out[0]!.facts.priceLevel).toBeNull();
});
it("rejects malformed coordinates without creating a guessed venue", async () => {
  await expect(
    createDiscovery({
      apiKey: "x",
      fetch: async () =>
        Response.json({
          places: [{ ...item, location: { latitude: 200, longitude: 139 } }],
        }),
    }).nearby(slot),
  ).rejects.toThrow();
});
it("requires an actual geographical result to locate a destination", async () => {
  const provider = createDiscovery({
    apiKey: "x",
    fetch: async () => Response.json({ places: [item] }),
  });
  expect(await provider.center("Tokyo")).toBeUndefined();
});
it("keeps dated hourly weather and missing observations, with the requested timezone and Celsius", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      hourly: {
        time: ["2026-10-01T12:00", "2026-10-01T13:00"],
        apparent_temperature: [31, null],
        precipitation_probability: [90, null],
        weather_code: [61, null],
      },
    }),
  );
  const out = await createDiscovery({
    apiKey: "x",
    fetch,
    now: () => new Date("2026-09-22T00:00:00Z"),
  }).weather(slot.anchor, "Asia/Tokyo");
  expect(out[0]!.date).toBe("2026-10-01");
  expect(out[0]!.hours[1]!.apparentTemperature).toBeNull();
  const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
  expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
  expect(url.searchParams.get("temperature_unit")).toBe("celsius");
  expect(url.searchParams.get("forecast_days")).toBe("16");
});
it("rejects mismatched weather series and propagates transport failure for caller fallback", async () => {
  const provider = createDiscovery({
    apiKey: "x",
    fetch: async () =>
      Response.json({
        hourly: {
          time: ["2026-10-01T12:00"],
          apparent_temperature: [],
          precipitation_probability: [90],
          weather_code: [61],
        },
      }),
  });
  await expect(provider.weather(slot.anchor, "Asia/Tokyo")).rejects.toThrow(
    "Invalid weather series",
  );
  await expect(
    createDiscovery({
      apiKey: "x",
      fetch: async () => new Response("", { status: 503 }),
    }).nearby(slot),
  ).rejects.toThrow();
});
