import type { PlaceDetails, User } from "@reel/contracts";
import { getGooglePlaceDetails } from "@reel/ai/real-providers";
import { repos } from "../db";
import { AppError, notFound } from "../errors";
import { belongsTo, getOwnedTrip } from "./access";
import { enforceRateLimit } from "./rate-limits";

/** 30 days in milliseconds per Google Maps Platform Terms of Service §3.2.3. */
export const MAX_PLACE_DETAILS_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

export async function getPlaceDetails(
  user: User,
  tripId: string,
  placeId: string,
  providerPlaceId: string,
): Promise<PlaceDetails | null> {
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await repos().places.get(placeId), trip, "Place");
  const option = [place.selected, ...place.options].find((opt) => opt?.providerPlaceId === providerPlaceId);
  if (!option) throw notFound("Place match");

  // Non-Google providers (fixtures, OpenStreetMap) use their existing stored details
  if (option.details.provider !== "google") {
    return option.details;
  }

  // 30-Day Caching Strategy:
  // Check if we have rich details already populated and whether fetchedAt is within the 30-day window.
  const hasRichDetails =
    option.details.rating !== null ||
    (option.details.reviews && option.details.reviews.length > 0) ||
    !option.details.unknownFields.includes("rating");

  const fetchedAtMs = new Date(option.details.fetchedAt).getTime();
  const cacheAgeMs = Date.now() - fetchedAtMs;

  if (hasRichDetails && cacheAgeMs < MAX_PLACE_DETAILS_CACHE_MS) {
    // Cache hit: return without making billable external Google Places API requests
    return option.details;
  }

  // Rate limit: 60/minute and 300/day per user
  await enforceRateLimit(`place-details-minute:${user.id}`, { limit: 60, windowMs: 60_000 });
  await enforceRateLimit(`place-details-day:${user.id}`, { limit: 300, windowMs: 86_400_000 });

  try {
    const freshDetails = await getGooglePlaceDetails(providerPlaceId, {
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
    });

    // Update the option in place and persist so subsequent requests within 30 days are cached
    option.details = freshDetails;
    if (place.selected?.providerPlaceId === providerPlaceId) {
      place.selected.details = freshDetails;
    }
    const optIndex = place.options.findIndex((opt) => opt.providerPlaceId === providerPlaceId);
    if (optIndex !== -1) {
      place.options[optIndex]!.details = freshDetails;
    }
    await repos().places.update(place);

    return freshDetails;
  } catch (error) {
    if (error instanceof AppError) throw error;
    // If provider call fails but we had older/partial details, fall back to them rather than crashing
    if (option.details) return option.details;
    throw new AppError("INTERNAL", "Place details are temporarily unavailable.");
  }
}

