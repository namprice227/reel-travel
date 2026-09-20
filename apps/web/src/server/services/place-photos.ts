import type { User } from "@reel/contracts";
import { getGooglePlacePhoto } from "@reel/ai/real-providers";
import { repos } from "../db";
import { AppError, notFound } from "../errors";
import { belongsTo, getOwnedTrip } from "./access";
import { enforceRateLimit } from "./rate-limits";

export async function getPlacePhoto(user: User, tripId: string, placeId: string, providerPlaceId: string) {
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await repos().places.get(placeId), trip, "Place");
  const option = [place.selected, ...place.options].find(option => option?.providerPlaceId === providerPlaceId);
  if (!option) throw notFound("Place match");
  if (option.details.provider !== "google") return null;
  await enforceRateLimit(`place-photo-minute:${user.id}`, { limit: 60, windowMs: 60_000 });
  await enforceRateLimit(`place-photo-day:${user.id}`, { limit: 300, windowMs: 86_400_000 });
  try {
    return await getGooglePlacePhoto(providerPlaceId, { apiKey: process.env.GOOGLE_PLACES_API_KEY });
  } catch {
    throw new AppError("INTERNAL", "Photo unavailable. Place details are still available.");
  }
}
