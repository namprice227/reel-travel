import { Timezone, type EndpointBody, type EndpointQuery, type User } from "@reel/contracts";
import { z } from "zod";
import { AppError, invalidState, notFound } from "../errors";
import { enforceRateLimit } from "./rate-limits";
import { findCityCatalog, searchCityCatalog } from "./city-catalog";

const autocompleteResponse = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string(),
      distanceMeters: z.number().nonnegative().optional(),
      text: z.object({ text: z.string() }),
      structuredFormat: z.object({ mainText: z.object({ text: z.string() }) }),
    }).optional(),
  })).optional(),
});
const placeResponse = z.object({
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  addressComponents: z.array(z.object({ shortText: z.string().optional(), types: z.array(z.string()) })),
});
const timezoneResponse = z.object({ status: z.string(), timeZoneId: z.string().optional() });

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("en");

async function googleJson(url: string, init: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Google returned HTTP ${response.status}`);
    return await response.json();
  } catch {
    throw new AppError("INVALID_STATE", "City lookup is unavailable right now. Please try again later.");
  }
}

/** A typed city must resolve to one Google city in the selected country before its timezone is saved. */
export async function resolveCityFromGoogle(
  input: EndpointBody<"destinations.resolveCity">,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ city: string; timezone: string }> {
  if (!apiKey.trim()) throw invalidState("City lookup is not configured yet.");
  const selected = input.geonameId ? findCityCatalog(input.countryCode, input.geonameId) : null;
  if (input.geonameId && (!selected || normalize(input.city) !== normalize(selected.region
    ? `${selected.name}, ${selected.region}` : selected.name))) {
    throw notFound("Selected city in the chosen country");
  }
  const sessionToken = crypto.randomUUID();
  const origin = selected ? { latitude: selected.latitude, longitude: selected.longitude } : null;
  const rawSuggestions = await googleJson("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: selected?.name ?? input.city,
      includedPrimaryTypes: ["(cities)"],
      includedRegionCodes: [input.countryCode.toLowerCase()],
      ...(origin ? { origin, locationBias: { circle: { center: origin, radius: 50_000 } } } : {}),
      sessionToken,
    }),
  }, fetcher);
  const parsedSuggestions = autocompleteResponse.safeParse(rawSuggestions);
  if (!parsedSuggestions.success) throw invalidState("City lookup returned an unexpected result. Please try again.");
  const cityPart = normalize(input.city.split(",")[0] ?? "");
  const regionPart = normalize(input.city.split(",").slice(1).join(" "));
  const selectedNames = selected ? [selected.name, selected.asciiName, ...selected.aliases].map(normalize) : [];
  const matches = (parsedSuggestions.data.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => selected
      ? selectedNames.includes(normalize(item.structuredFormat.mainText.text))
      : normalize(item.structuredFormat.mainText.text) === cityPart)
    .filter((item) => selected || !regionPart || normalize(item.text.text).includes(regionPart));
  if (!matches.length) throw notFound(`City in ${input.countryCode}. Check the spelling or add its region`);
  if (!selected && matches.length > 1) throw invalidState("Several cities have that name in this country. Add a region after the city name.");

  const match = selected ? [...matches].sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))[0]! : matches[0]!;
  if (selected && (match.distanceMeters ?? 0) > 75_000) throw notFound("Selected city near the GeoNames location");
  const rawPlace = await googleJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(match.placeId)}?sessionToken=${sessionToken}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location,addressComponents" },
  }, fetcher);
  const place = placeResponse.safeParse(rawPlace);
  if (!place.success) throw invalidState("City lookup returned an unexpected location. Please try again.");
  const locatedCountry = place.data.addressComponents.find((part) => part.types.includes("country"))?.shortText;
  if (locatedCountry?.toUpperCase() !== input.countryCode) throw notFound("City in the selected country");
  if (selected && distanceKm(origin!, place.data.location) > 75) {
    throw notFound("Selected city near the GeoNames location");
  }

  const query = new URLSearchParams({
    location: `${place.data.location.latitude},${place.data.location.longitude}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    key: apiKey,
  });
  const rawTimezone = await googleJson(`https://maps.googleapis.com/maps/api/timezone/json?${query}`, {}, fetcher);
  const timezone = timezoneResponse.safeParse(rawTimezone);
  if (!timezone.success || timezone.data.status !== "OK" || !timezone.data.timeZoneId) {
    throw invalidState("The city's timezone could not be checked. Please try again later.");
  }
  const validTimezone = Timezone.safeParse(timezone.data.timeZoneId);
  if (!validTimezone.success) throw invalidState("The city returned an unsupported timezone.");
  return { city: match.structuredFormat.mainText.text, timezone: validTimezone.data };
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const size = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(size));
}

export async function resolveTripCity(user: User, input: EndpointBody<"destinations.resolveCity">) {
  await enforceRateLimit(`trip-city-minute:${user.id}`, { limit: 10, windowMs: 60_000 });
  await enforceRateLimit(`trip-city-day:${user.id}`, { limit: 100, windowMs: 86_400_000 });
  return resolveCityFromGoogle(input, process.env.GOOGLE_PLACES_API_KEY ?? "");
}

export async function searchTripCities(user: User, input: EndpointQuery<"destinations.searchCities">) {
  await enforceRateLimit(`trip-city-search-minute:${user.id}`, { limit: 120, windowMs: 60_000 });
  return { cities: searchCityCatalog(input.countryCode, input.q) };
}
