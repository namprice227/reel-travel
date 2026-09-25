import { describe, expect, it } from "vitest";
import type { AccountPlace, AccountReel } from "@reel/contracts";
import { buildAccountLibrary, matchesAccountPlace } from "../../apps/web/src/features/library/account-library-model";

const at = "2026-09-24T00:00:00.000Z";
const reel = (id: string, tripId: string | null = null): AccountReel => ({
  id, ownerId: "user_example", url: `https://www.youtube.com/shorts/${id}`, details: null,
  status: "ready", failureCode: null, failureMessage: null, attempts: 1, placeIds: [],
  format: "places", tripId, review: "done", createdAt: at, updatedAt: at,
});
const place = (id: string, reelId: string, country: AccountPlace["country"], category = "cafe"): AccountPlace => ({
  id, ownerId: "user_example", reelId, name: id, area: "Sample area", category,
  excerpt: "Synthetic source evidence", country, mappingStatus: "unverified", options: [], createdAt: at, updatedAt: at,
});

describe("account inspiration library", () => {
  it("groups source-backed account places by country and keeps unknowns separate", () => {
    const albums = buildAccountLibrary([reel("reel_jp"), reel("reel_unknown"), reel("reel_trip", "trip_1")], [
      place("Kumo", "reel_jp", { code: "JP", excerpt: "Japan" }),
      place("Harbor", "reel_unknown", null, "viewpoint"),
      place("Trip place", "reel_trip", { code: "JP", excerpt: "Japan" }),
    ]);
    expect(albums.map((album) => [album.id, album.places.length])).toEqual([["JP", 2], ["unknown", 1]]);
    expect(albums[0]?.places[0]?.categoryLabel).toBe("Food & drink");
    expect(albums[1]?.name).toBe("Unknown country");
  });

  it("searches place evidence and applies the friendly category", () => {
    const [album] = buildAccountLibrary([reel("reel_jp")], [
      place("Kumo", "reel_jp", { code: "JP", excerpt: "Japan" }),
    ]);
    const item = album!.places[0]!;
    expect(matchesAccountPlace(item, "sample area", "Food & drink")).toBe(true);
    expect(matchesAccountPlace(item, "sample area", "Shopping")).toBe(false);
  });
});
