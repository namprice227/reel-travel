import { z } from "zod";
import { PlaceOption, type OpeningHours } from "@reel/contracts";
import type { PlaceLookup } from "./types";
import { ProviderError, providerJson } from "./provider-request";
const point = z.object({ day: z.number().int().min(0).max(6).default(0), hour: z.number().int().min(0).max(23).default(0), minute: z.number().int().min(0).max(59).default(0) });
const hoursSchema = z.object({ periods: z.array(z.object({ open: point, close: point.optional() })).optional() });
const googleReview = z.object({
  text: z.object({ text: z.string() }).optional(),
  originalText: z.object({ text: z.string() }).optional(),
  authorAttribution: z.object({
    displayName: z.string().optional(),
    uri: z.string().optional(),
    photoUri: z.string().optional(),
  }).optional(),
  relativePublishTimeDescription: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  googleMapsUri: z.string().optional(),
});

const googlePlace = z.object({
  id: z.string().min(1), displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().optional(), location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  primaryType: z.string().optional(), primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
  types: z.array(z.string()).optional(),
  priceLevel: z.string().optional(), businessStatus: z.string().optional(),
  priceRange: z.object({
    startPrice: z.object({ currencyCode: z.string().optional(), units: z.string().optional() }).optional(),
    endPrice: z.object({ currencyCode: z.string().optional(), units: z.string().optional() }).optional(),
  }).optional(),
  regularOpeningHours: hoursSchema.optional(),
  attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).optional(),
  photos: z.array(z.object({
    name: z.string().min(1), widthPx: z.number().int().positive().optional(), heightPx: z.number().int().positive().optional(),
    authorAttributions: z.array(z.object({ displayName: z.string().optional() })).optional(),
  })).optional(),
  editorialSummary: z.object({ text: z.string() }).optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  reviews: z.array(googleReview).optional(),
  dineIn: z.boolean().optional(),
  takeout: z.boolean().optional(),
  delivery: z.boolean().optional(),
  reservable: z.boolean().optional(),
  servesVegetarianFood: z.boolean().optional(),
  servesBeer: z.boolean().optional(),
  servesWine: z.boolean().optional(),
  outdoorSeating: z.boolean().optional(),
  goodForChildren: z.boolean().optional(),
  goodForGroups: z.boolean().optional(),
  restroom: z.boolean().optional(),
  paymentOptions: z.object({
    acceptsCreditCards: z.boolean().optional(),
    acceptsDebitCards: z.boolean().optional(),
    acceptsCashOnly: z.boolean().optional(),
    acceptsNfc: z.boolean().optional(),
  }).optional(),
  accessibilityOptions: z.object({
    wheelchairAccessibleEntrance: z.boolean().optional(),
    wheelchairAccessibleSeating: z.boolean().optional(),
  }).optional(),
});

/** Up to five reviews per place, verbatim and untrusted. */
function reviews(list: z.infer<typeof googlePlace>["reviews"]) {
  return (list ?? [])
    .filter((r) => r.text?.text || r.originalText?.text)
    .slice(0, 5)
    .map((r) => ({
      text: r.text?.text ?? r.originalText?.text ?? "",
      authorName: r.authorAttribution?.displayName || "Google Maps contributor",
      relativeTime: r.relativePublishTimeDescription ?? null,
      rating: r.rating ?? null,
      authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
      googleMapsUri: r.googleMapsUri ?? r.authorAttribution?.uri ?? null,
    }));
}

const IGNORED_TYPES = new Set(["point_of_interest", "establishment", "food", "store", "restaurant"]);

function humanizeType(type: string): string {
  return type
    .replace(/_restaurant$/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanTypes(types: string[] | undefined, primary?: string | null): string[] {
  const result: string[] = [];
  if (primary?.trim()) result.push(primary.trim());
  for (const t of types ?? []) {
    if (IGNORED_TYPES.has(t)) continue;
    const human = humanizeType(t);
    if (!result.some((r) => r.toLowerCase() === human.toLowerCase())) {
      result.push(human);
    }
  }
  return result.slice(0, 6);
}

function formatPriceRange(range: z.infer<typeof googlePlace>["priceRange"]): string | null {
  if (!range) return null;
  const curr = range.startPrice?.currencyCode || range.endPrice?.currencyCode;
  const sym = curr === "JPY" ? "¥" : curr === "USD" ? "$" : curr === "EUR" ? "€" : curr ? `${curr} ` : "";
  const start = range.startPrice?.units ? Number(range.startPrice.units).toLocaleString() : null;
  const end = range.endPrice?.units ? Number(range.endPrice.units).toLocaleString() : null;
  if (start && end) return `${sym}${start} – ${sym}${end}`;
  if (start) return `From ${sym}${start}`;
  if (end) return `Up to ${sym}${end}`;
  return null;
}

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

export const GOOGLE_PLACES_FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.types,places.regularOpeningHours,places.priceLevel,places.priceRange,places.attributions,places.businessStatus,places.editorialSummary,places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.reviews,places.dineIn,places.takeout,places.delivery,places.reservable,places.servesVegetarianFood,places.servesBeer,places.servesWine,places.outdoorSeating,places.goodForChildren,places.goodForGroups,places.restroom,places.paymentOptions,places.accessibilityOptions,nextPageToken";

export function createGooglePlaceLookup(options: { apiKey?: string; timeoutMs?: number; fetch?: typeof fetch }): PlaceLookup {
  return { maxClues: 10, async search(clue, context) {
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
          const category = p.primaryTypeDisplayName?.text ?? p.primaryType ?? null;
          const types = cleanTypes(p.types, category);
          const priceRange = formatPriceRange(p.priceRange);
          const summary = p.editorialSummary?.text ?? null;
          const rating = p.rating ?? null;
          const ratingCount = p.userRatingCount ?? null;
          const websiteUrl = p.websiteUri ?? null;
          const providerUrl = p.googleMapsUri ?? null;
          const phone = p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null;
          // Photo resources are fetched fresh by the owner display endpoint, never persisted.
          const placeReviews = reviews(p.reviews);

          const unknownFields = ["typicalVisitMinutes"];
          if (!p.formattedAddress) unknownFields.push("address");
          if (!category) unknownFields.push("category");
          if (openingHours.status === "unknown") unknownFields.push("openingHours");
          if (priceLevel === null) unknownFields.push("priceLevel");
          unknownFields.push("photos");
          if (!summary) unknownFields.push("summary");
          if (rating === null) unknownFields.push("rating");
          if (!phone) unknownFields.push("phone");
          if (!websiteUrl) unknownFields.push("websiteUrl");
          if (placeReviews.length === 0) unknownFields.push("reviews");

          const paymentOptions = p.paymentOptions ? {
            acceptsCreditCards: p.paymentOptions.acceptsCreditCards ?? null,
            acceptsDebitCards: p.paymentOptions.acceptsDebitCards ?? null,
            acceptsCashOnly: p.paymentOptions.acceptsCashOnly ?? null,
            acceptsNfc: p.paymentOptions.acceptsNfc ?? null,
          } : null;

          const accessibilityOptions = p.accessibilityOptions ? {
            wheelchairAccessibleEntrance: p.accessibilityOptions.wheelchairAccessibleEntrance ?? null,
            wheelchairAccessibleSeating: p.accessibilityOptions.wheelchairAccessibleSeating ?? null,
          } : null;

          found.set(p.id, PlaceOption.parse({
            providerPlaceId: p.id,
            name: p.displayName.text,
            address: p.formattedAddress || null,
            location: { lat: p.location.latitude, lng: p.location.longitude },
            details: {
              provider: "google",
              providerPlaceId: p.id,
              fetchedAt: new Date().toISOString(),
              category,
              types,
              priceRange,
              openingHours,
              typicalVisitMinutes: null,
              priceLevel,
              unknownFields,
              photos: [],
              summary,
              rating,
              ratingCount,
              websiteUrl,
              providerUrl,
              phone,
              reviews: placeReviews,
              dineIn: p.dineIn ?? null,
              takeout: p.takeout ?? null,
              delivery: p.delivery ?? null,
              reservable: p.reservable ?? null,
              servesVegetarianFood: p.servesVegetarianFood ?? null,
              servesBeer: p.servesBeer ?? null,
              servesWine: p.servesWine ?? null,
              outdoorSeating: p.outdoorSeating ?? null,
              goodForChildren: p.goodForChildren ?? null,
              goodForGroups: p.goodForGroups ?? null,
              restroom: p.restroom ?? null,
              paymentOptions,
              accessibilityOptions,
              attribution: ["Google Maps", ...(p.attributions ?? []).map(a => [a.provider, a.providerUri].filter(Boolean).join(" "))].join("; "),
            },
          }));
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
