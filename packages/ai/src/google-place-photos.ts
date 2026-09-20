import { z } from "zod";
import { PlacePhoto } from "@reel/contracts";
import { ProviderError, providerJson } from "./provider-request";

const photoSchema = z.object({
  name: z.string().max(4096),
  googleMapsUri: z.string().optional(),
  authorAttributions: z.array(z.object({ displayName: z.string().min(1), uri: z.string().optional(), photoUri: z.string().optional() })),
});
const https = (value?: string): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" && !url.username && !url.password && !url.searchParams.has("key") ? url.href : null;
  } catch { return null; }
};

/** Fetch a fresh name and resolve exactly one 640px photo. No disk/DB cache or API key in the result. */
export async function getGooglePlacePhoto(placeId: string, options: { apiKey?: string; fetch?: typeof fetch }): Promise<PlacePhoto | null> {
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) throw new ProviderError("INVALID_INPUT", "Invalid Google place ID.");
  if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Google Places photos are not configured.");
  const transport = { ...options, timeoutMs: 15_000, code: "PHOTO_ERROR" };
  const headers = { "X-Goog-Api-Key": options.apiKey.trim() };
  const details = await providerJson(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { ...headers, "X-Goog-FieldMask": "photos,googleMapsUri" }, cache: "no-store",
  }, transport);
  try {
    const parsed = z.object({ photos: z.array(photoSchema).max(10).optional(), googleMapsUri: z.string().optional() }).parse(details);
    const photo = parsed.photos?.[0];
    if (!photo) return null;
    if (!photo.name.startsWith(`places/${placeId}/photos/`) || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)) {
      throw new Error("Unexpected photo resource");
    }
    const media = await providerJson(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=640&maxHeightPx=480&skipHttpRedirect=true`, {
      headers, cache: "no-store",
    }, transport);
    const imageUrl = https(z.object({ photoUri: z.string() }).parse(media).photoUri);
    const host = imageUrl ? new URL(imageUrl).hostname : "";
    if (!imageUrl || !(host.endsWith(".googleusercontent.com") || host.endsWith(".ggpht.com"))) throw new Error("Unexpected image host");
    const googleMapsUrl = https(photo.googleMapsUri) ?? https(parsed.googleMapsUri);
    if (!googleMapsUrl) throw new Error("Missing source link");
    return PlacePhoto.parse({ imageUrl, googleMapsUrl, authors: photo.authorAttributions.map(author => ({
      name: author.displayName, url: https(author.uri), avatarUrl: https(author.photoUri),
    })) });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("PHOTO_ERROR", "Place photo is unavailable.");
  }
}
