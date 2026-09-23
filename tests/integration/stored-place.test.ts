import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { CandidatePlace } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
import { readStoredPlace } from "../../apps/web/src/server/db/stored-place";
import { createFileRepositories } from "../../apps/web/src/server/db/file-store";
import { getGooglePlaceDetails } from "../../packages/ai/src/google-places";

function legacyPlace() {
  const place = structuredClone(placeFixtures.confirmed);
  place.options[0]!.details.websiteUrl = "http://synthetic.example.test";
  place.selected!.details.websiteUrl = "http://synthetic.example.test";
  place.selected!.details.providerUrl = "javascript:alert(1)";
  place.selected!.details.reviews = [{ text: "Synthetic review", authorName: "Synthetic author",
    rating: 4, relativeTime: null, authorPhotoUrl: "data:text/html,test", googleMapsUri: "https://maps.example.test/review" }];
  return place;
}

it("reads legacy optional links without changing the saved source or relaxing identity validation", () => {
  const raw = legacyPlace();
  expect(CandidatePlace.safeParse(raw).success).toBe(false);
  const result = readStoredPlace(raw);
  expect(result.options[0]!.details.websiteUrl).toBeNull();
  expect(result.selected!.details).toMatchObject({ websiteUrl: null, providerUrl: null,
    reviews: [{ text: "Synthetic review", authorPhotoUrl: null, googleMapsUri: "https://maps.example.test/review" }] });
  expect(result.evidence).toEqual(raw.evidence);
  expect(result.selected!.location).toEqual(raw.selected!.location);
  expect(result.status).toBe("confirmed");
  expect(raw.selected!.details.websiteUrl).toBe("http://synthetic.example.test");
  expect(() => readStoredPlace({ ...raw, selected: { ...raw.selected, location: { lat: 999, lng: 0 } } })).toThrow();
});

it("keeps file-store legacy reads and optimistic writes compatible without overwriting concurrent changes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-legacy-"));
  try {
    const raw = legacyPlace();
    fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ places: [raw] }));
    const repo = createFileRepositories(dir);
    const read = (await repo.places.get(raw.id))!;
    expect((await repo.places.listByTrip(raw.tripId))[0]).toEqual(read);
    expect(await repo.places.updateIfUnchanged({ ...read, name: "Updated synthetic venue" }, read)).toBe(true);
    expect(await repo.places.updateIfUnchanged({ ...read, name: "Stale write" }, read)).toBe(false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it("fresh Google details omit invalid optional URLs and retain provider facts and safe links", async () => {
  const result = await getGooglePlaceDetails("synthetic_id", { apiKey: "synthetic-key",
    fetch: async () => Response.json({ id: "synthetic_id", displayName: { text: "Synthetic venue" }, location: { latitude: 35, longitude: 139 }, websiteUri: "http://venue.example.test",
      googleMapsUri: "https://maps.example.test/venue", rating: 4.5,
      reviews: [{ text: { text: "Synthetic review" }, authorAttribution: { displayName: "Synthetic author", photoUri: "javascript:bad" } }] }),
  });
  expect(result).toMatchObject({ websiteUrl: null, providerUrl: "https://maps.example.test/venue", rating: 4.5,
    reviews: [{ text: "Synthetic review", authorPhotoUrl: null }] });
  expect(result.unknownFields).toContain("websiteUrl");
});
