import { z } from "zod";
import { PlaceOption, type OpeningHours } from "@reel/contracts";
import type { PlaceLookup } from "./types";
import { ProviderError, providerJson } from "./provider-request";
const point = z.object({ day: z.number().int().min(0).max(6).default(0), hour: z.number().int().min(0).max(23).default(0), minute: z.number().int().min(0).max(59).default(0) });
const hoursSchema = z.object({ periods: z.array(z.object({ open: point, close: point.optional() })).optional() });
const googlePlace = z.object({
  id: z.string().min(1), displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().optional(), location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  primaryType: z.string().optional(), priceLevel: z.string().optional(), businessStatus: z.string().optional(),
  regularOpeningHours: hoursSchema.optional(),
  attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).optional(),
});
function hours(value: z.infer<typeof hoursSchema> | undefined): OpeningHours {
  const periods = value?.periods;
  if (!periods) return { status: "unknown" };
  if (periods.length === 1 && periods[0]!.open.day === 0 && periods[0]!.open.hour === 0 && periods[0]!.open.minute === 0 && !periods[0]!.close)
    return { status: "known", windows: Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "00:00" })) };
  // The planner cannot model carry-over from a previous day's overnight opening.
  // Preserve uncertainty for those schedules rather than falsely declaring mornings closed.
  if (periods.some(p => !p.close || p.close.day !== p.open.day || p.close.hour * 60 + p.close.minute <= p.open.hour * 60 + p.open.minute))
    return { status: "unknown" };
  const time = (p: z.infer<typeof point>) => `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return { status: "known", windows: periods.map(p => ({ day: p.open.day, open: time(p.open), close: time(p.close!) })) };
}
export const GOOGLE_PLACES_FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.regularOpeningHours,places.priceLevel,places.attributions,places.businessStatus,nextPageToken";
export function createGooglePlaceLookup(options: { apiKey?: string; timeoutMs?: number; fetch?: typeof fetch }): PlaceLookup {
  return { async search(clue, context) {
    if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_PLACES_API_KEY in apps/web/.env.local; enable Places API (New) and billing.");
    const found = new Map<string, PlaceOption>();
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const raw = await providerJson("https://places.googleapis.com/v1/places:searchText", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": options.apiKey.trim(), "X-Goog-FieldMask": GOOGLE_PLACES_FIELDS },
        body: JSON.stringify({ textQuery: [clue.query, clue.hint, context.destination].filter(Boolean).join(" "), pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      }, { ...options, code: "LOOKUP_ERROR" });
      try {
        const result = z.object({ places: z.array(googlePlace).optional(), nextPageToken: z.string().optional() }).parse(raw);
        for (const p of result.places ?? []) {
          if (p.businessStatus === "CLOSED_PERMANENTLY") continue;
          const openingHours = p.businessStatus === "CLOSED_TEMPORARILY" ? { status: "unknown" as const } : hours(p.regularOpeningHours);
          const priceLevel = ({ PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 } as Record<string, number>)[p.priceLevel ?? ""] ?? null;
          const unknownFields = ["typicalVisitMinutes"];
          if (!p.formattedAddress) unknownFields.push("address");
          if (!p.primaryType) unknownFields.push("category");
          if (openingHours.status === "unknown") unknownFields.push("openingHours");
          if (priceLevel === null) unknownFields.push("priceLevel");
          found.set(p.id, PlaceOption.parse({ providerPlaceId: p.id, name: p.displayName.text,
            address: p.formattedAddress || null, location: { lat: p.location.latitude, lng: p.location.longitude },
            details: { provider: "google", providerPlaceId: p.id, fetchedAt: new Date().toISOString(), category: p.primaryType ?? null,
              openingHours, typicalVisitMinutes: null, priceLevel, unknownFields,
              attribution: ["Google Maps", ...(p.attributions ?? []).map(a => [a.provider, a.providerUri].filter(Boolean).join(" "))].join("; ") } }));
        }
        pageToken = result.nextPageToken || undefined;
        if (!pageToken) return [...found.values()];
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("LOOKUP_ERROR", "Invalid Places response; no guessed facts or partial matches accepted.");
      }
    }
    throw new ProviderError("LOOKUP_ERROR", "Too many matches. Add a more specific area or venue name.");
  } };
}
