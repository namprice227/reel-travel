import { z } from "zod";
import type { LatLng } from "@reel/contracts";
import type { NearbySlot, NearbyVenue, WeatherDay } from "@reel/planner";
import { googleOpeningHours } from "./google-places";
import { providerJson } from "./provider-request";
const point = z.object({
  day: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(23).default(0),
  minute: z.number().int().min(0).max(59).default(0),
});
const place = z.object({
  id: z.string().min(1).max(300),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  types: z.array(z.string()).default([]),
  primaryType: z.string().optional(),
  priceLevel: z.string().optional(),
  businessStatus: z.string().optional(),
  regularOpeningHours: z
    .object({
      periods: z
        .array(z.object({ open: point, close: point.optional() }))
        .optional(),
    })
    .optional(),
  attributions: z
    .array(
      z.object({
        provider: z.string().optional(),
        providerUri: z.string().optional(),
      }),
    )
    .optional(),
});
export function createDiscovery(options: {
  apiKey: string;
  weatherApiKey?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  async function search(body: object) {
    return (
      z.object({ places: z.array(place).optional() }).parse(
        await providerJson(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": options.apiKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.priceLevel,places.businessStatus,places.regularOpeningHours,places.attributions",
            },
            body: JSON.stringify(body),
          },
          { fetch: options.fetch, timeoutMs: 2500, code: "DISCOVERY_FAILED" },
        ),
      ).places ?? []
    );
  }
  return {
    async center(destination: string): Promise<LatLng | undefined> {
      const p = (await search({ textQuery: destination, pageSize: 5 })).find(
        (p) =>
          p.types.some((t) =>
            [
              "locality",
              "administrative_area_level_1",
              "administrative_area_level_2",
              "country",
            ].includes(t),
          ),
      );
      return p
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : undefined;
    },
    async nearby(slot: NearbySlot): Promise<NearbyVenue[]> {
      const places = await search({
        textQuery: slot.query,
        pageSize: 10,
        locationBias: {
          circle: {
            center: { latitude: slot.anchor.lat, longitude: slot.anchor.lng },
            radius: slot.radiusMeters,
          },
        },
      });
      return places
        .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
        .map((p) => ({
          name: p.displayName.text,
          address: p.formattedAddress ?? "",
          location: { lat: p.location.latitude, lng: p.location.longitude },
          types: p.types,
          facts: {
            provider: "google",
            providerPlaceId: p.id,
            fetchedAt: now().toISOString(),
            openingHours: googleOpeningHours(p.regularOpeningHours),
            category: p.primaryType ?? null,
            priceLevel:
              (
                {
                  PRICE_LEVEL_FREE: 0,
                  PRICE_LEVEL_INEXPENSIVE: 1,
                  PRICE_LEVEL_MODERATE: 2,
                  PRICE_LEVEL_EXPENSIVE: 3,
                  PRICE_LEVEL_VERY_EXPENSIVE: 4,
                } as Record<string, number>
              )[p.priceLevel ?? ""] ?? null,
            attribution: [
              "Google Maps",
              ...(p.attributions ?? []).map((a) =>
                [a.provider, a.providerUri].filter(Boolean).join(" "),
              ),
            ]
              .join("; ")
              .slice(0, 2000),
          },
        }));
    },
    async weather(location: LatLng, timezone: string): Promise<WeatherDay[]> {
      const url = new URL(
        options.weatherApiKey
          ? "https://customer-api.open-meteo.com/v1/forecast"
          : "https://api.open-meteo.com/v1/forecast",
      );
      url.search = new URLSearchParams({
        latitude: String(location.lat),
        longitude: String(location.lng),
        timezone,
        forecast_days: "16",
        temperature_unit: "celsius",
        hourly: "apparent_temperature,precipitation_probability,weather_code",
        ...(options.weatherApiKey ? { apikey: options.weatherApiKey } : {}),
      }).toString();
      const hourly = z
        .object({
          hourly: z.object({
            time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
            apparent_temperature: z.array(z.number().nullable()),
            precipitation_probability: z.array(
              z.number().min(0).max(100).nullable(),
            ),
            weather_code: z.array(z.number().nullable()),
          }),
        })
        .parse(
          await providerJson(
            url.toString(),
            {},
            { fetch: options.fetch, timeoutMs: 2500, code: "WEATHER_FAILED" },
          ),
        ).hourly;
      if (
        [
          hourly.apparent_temperature,
          hourly.precipitation_probability,
          hourly.weather_code,
        ].some((a) => a.length !== hourly.time.length)
      )
        throw new Error("Invalid weather series");
      const days = new Map<string, WeatherDay>();
      hourly.time.forEach((time, i) => {
        const date = time.slice(0, 10);
        const day = days.get(date) ?? {
          date,
          location,
          fetchedAt: now().toISOString(),
          hours: [],
        };
        day.hours.push({
          time: time.slice(11),
          apparentTemperature: hourly.apparent_temperature[i]!,
          precipitationProbability: hourly.precipitation_probability[i]!,
          weatherCode: hourly.weather_code[i]!,
        });
        days.set(date, day);
      });
      return [...days.values()];
    },
  };
}
