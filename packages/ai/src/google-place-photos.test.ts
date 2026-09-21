import { expect, it, vi } from "vitest";
import { getGooglePlacePhoto } from "./google-place-photos";

const resource = "places/synthetic_place/photos/synthetic_photo";
const details = { googleMapsUri: "https://maps.google.com/place", photos: [{ name: resource,
  googleMapsUri: "https://maps.google.com/photo", authorAttributions: [
    { displayName: "Synthetic photographer", uri: "//maps.google.com/author", photoUri: "//lh3.googleusercontent.com/avatar" },
  ] }] };
const setup = (metadata: unknown = details, media: unknown = { photoUri: "https://lh3.googleusercontent.com/photo" }) =>
  vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(Response.json(media));

it("fetches fresh metadata and exactly one bounded image URL with attribution and no leaked key", async () => {
  const fetcher = setup();
  const result = await getGooglePlacePhoto("synthetic_place", { apiKey: "secret-test-key", fetch: fetcher });
  expect(result).toEqual({ imageUrl: "https://lh3.googleusercontent.com/photo", googleMapsUrl: "https://maps.google.com/photo",
    authors: [{ name: "Synthetic photographer", url: "https://maps.google.com/author", avatarUrl: "https://lh3.googleusercontent.com/avatar" }] });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![0]).toBe(`https://places.googleapis.com/v1/${resource}/media?maxWidthPx=640&maxHeightPx=480&skipHttpRedirect=true`);
  for (const [url, init] of fetcher.mock.calls) {
    expect(url).not.toContain("secret-test-key");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error", headers: { "X-Goog-Api-Key": "secret-test-key" } });
  }
  expect(JSON.stringify(result)).not.toContain("secret-test-key");
  expect(JSON.stringify(result)).not.toContain(resource);
});
it.each([{}, { photos: [] }])("returns no photo without requesting media: %j", async metadata => {
  const fetcher = setup(metadata);
  expect(await getGooglePlacePhoto("synthetic_place", { apiKey: "test", fetch: fetcher })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["places/other/photos/photo", "places/synthetic_place/photos/../../evil", "https://evil.test/image"])("rejects an unrelated or unsafe photo resource %s", async name => {
  const fetcher = setup({ ...details, photos: [{ ...details.photos[0], name }] });
  await expect(getGooglePlacePhoto("synthetic_place", { apiKey: "test", fetch: fetcher })).rejects.toMatchObject({ code: "PHOTO_ERROR" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["http://lh3.googleusercontent.com/a", "https://evil.test/a", "https://lh3.googleusercontent.com.evil.test/a", "https://lh3.googleusercontent.com/a?key=secret", "javascript:alert(1)"])("rejects unsafe image URL %s", async photoUri => {
  await expect(getGooglePlacePhoto("synthetic_place", { apiKey: "test", fetch: setup(details, { photoUri }) })).rejects.toMatchObject({ code: "PHOTO_ERROR" });
});
it("keeps author text but never renders unsafe attribution links", async () => {
  const fetcher = setup({ ...details, photos: [{ ...details.photos[0], authorAttributions: [{ displayName: "Synthetic", uri: "javascript:alert(1)", photoUri: "http://invalid.test/a" }] }] });
  expect(await getGooglePlacePhoto("synthetic_place", { apiKey: "test", fetch: fetcher })).toMatchObject({ authors: [{ name: "Synthetic", url: null, avatarUrl: null }] });
});
it("fails unavailable providers without forwarding their response payload", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("PRIVATE_PROVIDER_PAYLOAD", { status: 403 }));
  await expect(getGooglePlacePhoto("synthetic_place", { apiKey: "test", fetch: fetcher })).rejects.toThrow("HTTP 403");
});
it("does not send requests with absent credentials or invalid place identifiers", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(getGooglePlacePhoto("synthetic_place", { fetch: fetcher })).rejects.toMatchObject({ code: "API_KEY_MISSING" });
  await expect(getGooglePlacePhoto("../elsewhere", { apiKey: "test", fetch: fetcher })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(fetcher).not.toHaveBeenCalled();
});
