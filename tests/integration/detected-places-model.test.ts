import { describe, expect, it } from "vitest";
import type { AccountPlace, Trip } from "@reel/contracts";
import { tripFixture } from "@reel/contracts/fixtures";
import { confirmLabel, placesCountry, tripChoices, withAdded } from "../../apps/web/src/features/home/detected-places-model";

// Synthetic records only; names are fictional stand-ins, not real venues or hours.
const at = "2026-09-25T00:00:00.000Z";
const place = (overrides: Partial<AccountPlace>): AccountPlace => ({
  id: "idea_1", ownerId: "user_example", reelId: "reel_1", name: "Synthetic Kissa", area: null, category: "cafe",
  excerpt: null, country: null, mappingStatus: "unverified", options: [], createdAt: at, updatedAt: at, ...overrides,
});
const trip = (id: string, destination: string, startDate: string | null, endDate = startDate): Trip => ({
  ...tripFixture, id, title: id, destination, startDate, endDate, updatedAt: at,
  ...(startDate ? {} : { status: "draft" as const }),
} as Trip);

describe("detected places popup rules", () => {
  it("uses the reel's most common source-supported country, ignoring unsupported ones", () => {
    const jp = { code: "JP", excerpt: "Japan" };
    expect(placesCountry([place({ country: jp }), place({ country: null }), place({ country: jp }), place({ country: { code: "FR", excerpt: "Paris" } })])).toBe("JP");
    expect(placesCountry([place({})])).toBeNull();
  });

  it("offers trips that have not ended, same-country trips first", () => {
    const today = new Date("2026-09-25T00:00:00Z");
    const choices = tripChoices([
      trip("paris", "Paris, France", "2026-10-01"),
      trip("past-tokyo", "Tokyo", "2026-01-01"),
      trip("osaka-draft", "Osaka", null),
      trip("tokyo", "Tokyo", "2026-11-01"),
    ], "JP", today);
    expect(choices.map((choice) => [choice.trip.id, choice.sameCountry])).toEqual([
      ["tokyo", true], ["osaka-draft", true], ["paris", false],
    ]);
  });

  it("names what confirming does, and adding to a trip needs a ticked place", () => {
    expect(confirmLabel(3, 4, { kind: "library" })).toBe("Save to library");
    expect(confirmLabel(0, 4, { kind: "library" })).toBe("Remove all");
    expect(confirmLabel(0, 1, { kind: "library" })).toBe("Remove place");
    expect(confirmLabel(2, 4, { kind: "trip", tripId: "t" })).toBe("Add");
    expect(confirmLabel(2, 4, { kind: "new" })).toBe("Continue");
    expect(confirmLabel(0, 4, { kind: "trip", tripId: "t" })).toBeNull();
    expect(confirmLabel(0, 4, { kind: "new" })).toBeNull();
  });

  it("adds copies to the trip selection without dropping places already chosen", () => {
    expect(withAdded(["a", "b"], ["ignored"], ["b", "c"])).toEqual(["a", "b", "c"]);
    // A trip that never saved a selection plans its confirmed places, so those stay chosen.
    expect(withAdded(undefined, ["confirmed"], ["c"])).toEqual(["confirmed", "c"]);
  });
});
