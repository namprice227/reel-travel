import { z } from "zod";
import type { DestinationArea } from "@reel/planner";
import { GOOGLE_PLACES_FIELDS, googlePlace, googleSearchOption } from "./google-places";
import { PROVIDER_RETRY_DELAYS_MS, ProviderError, providerJson } from "./provider-request";
import type { StayCandidate, StayLookup, StaySuggestionCandidate } from "./types";

/**
 * Hotel lookup for trip stays with Places API (New). Autocomplete suggests hotels while the traveler types, limited
 * to the trip's country and biased to the destination; one Place Details call with the same session token then
 * supplies the facts for the chosen one (address components give country and town). Text Search finds the
 * destination area. Nothing here is saved; the server looks the place up again when a stay is linked.
 */
const STAY_FIELDS = `${GOOGLE_PLACES_FIELDS},places.addressComponents,places.viewport`;
const STAY_DETAILS_FIELDS = STAY_FIELDS.split(",").map((f) => f.replace(/^places\./, "")).join(",");
const SUGGESTION_LIMIT = 5;
const AREA_TYPES = ["locality", "postal_town", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "sublocality", "colloquial_area", "country"];

const latLng = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const stayPlace = googlePlace.extend({
  addressComponents: z.array(z.object({ longText: z.string().optional(), shortText: z.string().optional(), types: z.array(z.string()).optional() })).optional(),
  viewport: z.object({ low: latLng, high: latLng }).optional(),
});
type StayPlace = z.infer<typeof stayPlace>;
const autocompleteResponse = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string().min(1).max(300),
      text: z.object({ text: z.string() }),
      structuredFormat: z.object({ mainText: z.object({ text: z.string() }), secondaryText: z.object({ text: z.string() }).optional() }).optional(),
      distanceMeters: z.number().int().nonnegative().optional(),
    }).optional(),
  })).optional(),
});

const component = (p: StayPlace, type: string) => p.addressComponents?.find((c) => c.types?.includes(type));
const countryCode = (p: StayPlace) => component(p, "country")?.shortText?.toUpperCase() ?? null;
const NAME_TYPES = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "colloquial_area", "country"];
const addressNames = (p: StayPlace) => [...new Set((p.addressComponents ?? [])
  .filter((c) => c.types?.some((t) => NAME_TYPES.includes(t)))
  .flatMap((c) => [c.longText, c.shortText].filter((n): n is string => Boolean(n))))];
const locality = (p: StayPlace) =>
  ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"]
    .map((type) => component(p, type)?.longText).find(Boolean) ?? null;

export function createGoogleStayLookup(options: { apiKey?: string; timeoutMs?: number; fetch?: typeof fetch }): StayLookup {
  async function searchText(body: Record<string, unknown>): Promise<StayPlace[]> {
    if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_PLACES_API_KEY in apps/web/.env.local; enable Places API (New) and billing.");
    const raw = await providerJson("https://places.googleapis.com/v1/places:searchText", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": options.apiKey.trim(), "X-Goog-FieldMask": STAY_FIELDS },
      body: JSON.stringify(body),
    }, { ...options, code: "LOOKUP_ERROR", retryDelaysMs: PROVIDER_RETRY_DELAYS_MS });
    const parsed = z.object({ places: z.array(stayPlace).max(10).optional() }).safeParse(raw);
    if (!parsed.success) throw new ProviderError("LOOKUP_ERROR", "Invalid Places response; no guessed facts or partial matches accepted.");
    return parsed.data.places ?? [];
  }

  return {
    attribution: "Google Maps",
    async area(destination) {
      const found = (await searchText({ textQuery: destination, pageSize: 5, languageCode: "en" }))
        .find((p) => p.types?.some((t) => AREA_TYPES.includes(t)));
      if (!found) return null;
      const area: DestinationArea = {
        center: { lat: found.location.latitude, lng: found.location.longitude },
        bounds: found.viewport
          ? { south: found.viewport.low.latitude, west: found.viewport.low.longitude, north: found.viewport.high.latitude, east: found.viewport.high.longitude }
          : null,
        countryCode: countryCode(found),
        // The traveler's own word for the destination and the provider's name for it, e.g. "Tokyo".
        names: [...new Set([destination.split(",")[0]!.trim(), found.displayName.text])],
      };
      return area;
    },
    async suggest(input, context) {
      if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_PLACES_API_KEY in apps/web/.env.local; enable Places API (New) and billing.");
      const centre = context.area ? { latitude: context.area.center.lat, longitude: context.area.center.lng } : null;
      const raw = await providerJson("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": options.apiKey.trim() },
        body: JSON.stringify({
          input, sessionToken: context.sessionToken, languageCode: "en",
          ...(context.countryCode ? { includedRegionCodes: [context.countryCode.toLowerCase()] } : {}),
          ...(centre ? { locationBias: { circle: { center: centre, radius: 50_000 } }, origin: centre } : {}),
        }),
      }, { ...options, code: "LOOKUP_ERROR", timeoutMs: options.timeoutMs ?? 5_000 });
      const parsed = autocompleteResponse.safeParse(raw);
      if (!parsed.success) throw new ProviderError("LOOKUP_ERROR", "Invalid Places response; no guessed facts or partial matches accepted.");
      return (parsed.data.suggestions ?? []).flatMap(({ placePrediction: p }): StaySuggestionCandidate[] => p ? [{
        providerPlaceId: p.placeId,
        name: p.structuredFormat?.mainText.text ?? p.text.text,
        secondary: p.structuredFormat?.secondaryText?.text ?? null,
        distanceKm: p.distanceMeters === undefined ? null : Math.round(p.distanceMeters / 100) / 10,
      }] : []).slice(0, SUGGESTION_LIMIT);
    },
    async details(providerPlaceId, sessionToken) {
      if (!/^[A-Za-z0-9_-]{1,300}$/.test(providerPlaceId)) return null;
      if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_PLACES_API_KEY in apps/web/.env.local; enable Places API (New) and billing.");
      const url = new URL(`https://places.googleapis.com/v1/places/${providerPlaceId}`);
      url.searchParams.set("languageCode", "en");
      // Ends the autocomplete session, so its keystrokes are billed as one session.
      if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
      let raw: unknown;
      try {
        raw = await providerJson(url.href, {
          method: "GET", headers: { "X-Goog-Api-Key": options.apiKey.trim(), "X-Goog-FieldMask": STAY_DETAILS_FIELDS }, cache: "no-store",
        }, { ...options, code: "LOOKUP_ERROR", retryDelaysMs: PROVIDER_RETRY_DELAYS_MS });
      } catch (error) {
        if (error instanceof ProviderError && /404|NOT_FOUND/.test(error.message)) return null;
        throw error;
      }
      const parsed = stayPlace.safeParse(raw);
      if (!parsed.success) throw new ProviderError("LOOKUP_ERROR", "Invalid Places response; no guessed facts or partial matches accepted.");
      const p = parsed.data;
      if (p.businessStatus === "CLOSED_PERMANENTLY") return null;
      return { option: googleSearchOption(p), countryCode: countryCode(p), locality: locality(p), addressNames: addressNames(p) };
    },
  };
}
