import { describe, expect, it } from "vitest";
import { inspirationFixtures, placeFixtures, tripFixture } from "@reel/contracts/fixtures";
import type { CandidatePlace, SourceClassification } from "@reel/contracts";
import { sourceLabels } from "../../apps/web/src/features/places/source-labels";
import {
  buildLibrary,
  countryAlbums,
  destinationLocation,
  matchesQuery,
  placeCategories,
} from "../../apps/web/src/features/library/library-model";

describe("inspiration library organization", () => {
  const labelled = (id: string, country: string | null, category: "food" | "attraction" | "other" | null): CandidatePlace => ({
    ...placeFixtures.confirmed, id, status: "unverified", options: [], selected: null,
    evidence: [{ ...placeFixtures.confirmed.evidence[0]!, inspirationId: inspirationFixtures.ready.id,
      classification: { source: "ai", country: country ? { code: country, excerpt: "Synthetic country evidence" } : null,
        category: category ? { value: category, excerpt: "Synthetic category evidence" } : null } }],
  });
  const libraryFor = (places: CandidatePlace[]) => buildLibrary([tripFixture], { [tripFixture.id]: {
    inspirations: [{ ...inspirationFixtures.ready, placeIds: places.map(p => p.id) }], places,
  } });
  it("organizes extracted places by source country and food/attraction even before lookup", () => {
    const places = [labelled("place_fr", "FR", "food"), labelled("place_jp", "JP", "attraction")];
    const items = libraryFor(places);
    expect(items).toHaveLength(1); // One save in the overview, even with multiple countries.
    expect(items[0]!.categories).toEqual(["Food & drink", "Attractions"]);
    expect(items[0]!.location.country).toBe("Multiple countries");
    const albums = countryAlbums(items);
    expect(albums.map(a => a.id)).toEqual(["FR", "JP"]);
    expect(albums[0]!.items[0]!.categories).toEqual(["Food & drink"]);
    expect(albums[0]!.items[0]!.places.map(p => p.id)).toEqual(["place_fr"]);
    expect(albums[1]!.items[0]!.categories).toEqual(["Attractions"]);
    expect(matchesQuery(items[0]!, "France")).toBe(true);
    expect(sourceLabels(places[0]!).country).toBe("France");
  });
  it("leaves unsupported country/category Unsorted instead of inheriting the trip or a provider type", () => {
    const place = labelled("place_unknown", null, null);
    place.options = [placeFixtures.confirmed.selected!];
    const [item] = libraryFor([place]);
    expect(item!.location.countryId).toBe("unsorted");
    expect(item!.categories).toEqual(["Unsorted"]);
    expect(item!.needsReview).toBe(true);
  });
  it("keeps conflicting countries unresolved and classification tied to each original save", () => {
    const place = labelled("place_conflict", "JP", "food");
    const classification: SourceClassification = { source: "ai", country: { code: "FR", excerpt: "France" }, category: null };
    place.evidence.push({ ...place.evidence[0]!, inspirationId: "insp_other", classification });
    expect(sourceLabels(place)).toMatchObject({ countryCode: null, conflictingCountry: true });
    expect(libraryFor([place])[0]!.location.countryId).toBe("JP");
    expect(sourceLabels({ ...place, status: "confirmed" }).country).toBe("Unsorted");
  });
  it("groups cities into countries and honors explicit country suffixes", () => {
    expect(destinationLocation(" Tokyo ")).toEqual({ countryId: "JP", country: "Japan", city: "Tokyo" });
    expect(destinationLocation("Kyoto, japan")).toEqual({ countryId: "JP", country: "Japan", city: "Kyoto" });
    expect(destinationLocation("Paris, US")).toEqual({ countryId: "US", country: "United States", city: "Paris" });
    expect(destinationLocation("Japan").city).toBeNull();
    expect(destinationLocation("Busan").countryId).toBe("KR");
  });

  it("keeps unknown, conflicting and multi-country destinations in Unsorted", () => {
    for (const destination of [
      "Springfield",
      "Paris, Texas",
      "Tokyo / Seoul",
      "Japan and Thailand",
      "Tokyo coffee tour",
    ]) {
      expect(destinationLocation(destination)).toEqual({
        countryId: "unsorted",
        country: "Unsorted",
        city: destination,
      });
    }
  });

  it("merges saves from trips in the same country without losing their original trip or source", () => {
    const kyoto = { ...tripFixture, id: "trip_kyoto", destination: "Kyoto, Japan" };
    const seoul = { ...tripFixture, id: "trip_seoul", destination: "Seoul" };
    const unknown = { ...tripFixture, id: "trip_unknown", destination: "Somewhere" };
    const trips = [tripFixture, kyoto, seoul, unknown];
    const items = buildLibrary(
      trips,
      Object.fromEntries(
        trips.map((trip, i) => [
          trip.id,
          {
            inspirations: [{ ...inspirationFixtures.ready, id: `save_${i}`, tripId: trip.id }],
            places: [],
          },
        ]),
      ),
    );
    const albums = countryAlbums(items);
    expect(albums.map((a) => [a.name, a.items.length])).toEqual([
      ["Japan", 2],
      ["South Korea", 1],
      ["Unsorted", 1],
    ]);
    expect(albums[0]!.cities).toEqual(["Tokyo", "Kyoto"]);
    expect(albums[0]!.items.map((i) => i.trip.id)).toEqual([tripFixture.id, kyoto.id]);
    expect(items[0]!.save.text).toBe(inspirationFixtures.ready.text);
    expect(items.find((i) => i.trip.id === unknown.id)!.needsReview).toBe(true);
  });

  it("puts a multi-place save into each applicable category without confirming ambiguous matches", () => {
    const input = [structuredClone(placeFixtures.ambiguousBranch), structuredClone(placeFixtures.pendingUnknownHours)];
    expect(placeCategories(input)).toEqual(["Food & drink", "Attractions"]);
    expect(input[0]!.status).toBe("ambiguous");
    expect(input[0]!.selected).toBeNull();
    const items = buildLibrary([tripFixture], {
      [tripFixture.id]: {
        inspirations: [{ ...inspirationFixtures.needsConfirmation, placeIds: input.map((p) => p.id) }],
        places: input,
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sample: true, needsReview: true, categories: ["Food & drink", "Attractions"] });
    expect(items[0]!.places[0]!.evidence).toEqual(input[0]!.evidence);
  });

  it("includes markets in Food and Shopping, ignores rejected candidates and uses the selected branch", () => {
    const market = structuredClone(placeFixtures.confirmed);
    market.selected!.details.category = "market";
    expect(placeCategories([market])).toEqual(["Food & drink", "Shopping"]);
    expect(placeCategories([{ ...market, status: "rejected" }])).toEqual(["Unsorted"]);
    market.selected!.details.category = "hotel";
    expect(placeCategories([market])).toEqual(["Stays"]);
  });

  it("searches country, city, category and original source, retaining skipped and unresolved saves", () => {
    const items = buildLibrary([tripFixture], {
      [tripFixture.id]: {
        inspirations: [
          inspirationFixtures.ready,
          inspirationFixtures.inaccessibleLink,
          { ...inspirationFixtures.processing, status: "skipped" },
        ],
        places: [placeFixtures.confirmed],
      },
    });
    for (const query of ["Japan", "tokyo", "ATTRACTIONS", "sunset"]) expect(matchesQuery(items[0]!, query)).toBe(true);
    expect(matchesQuery(items[1]!, "instagram")).toBe(true);
    expect(matchesQuery(items[0]!, "does not exist")).toBe(false);
    expect(items).toHaveLength(3);
    expect(items[2]!.save.status).toBe("skipped");
    expect(items[1]!.needsReview).toBe(true);
  });

  it("keeps empty and missing trip data safe and excludes unrelated trip records", () => {
    expect(buildLibrary([tripFixture], {})).toEqual([]);
    expect(countryAlbums([])).toEqual([]);
    expect(buildLibrary([], { other: { inspirations: [inspirationFixtures.ready], places: [] } })).toEqual([]);
  });
});
