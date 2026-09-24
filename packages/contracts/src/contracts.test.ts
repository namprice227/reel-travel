import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as fx from "../fixtures/index";
import {
  ApiErrorBody,
  CandidatePlace,
  CopyPlacesInput,
  countryCodeFromName,
  endpoints,
  Inspiration,
  Itinerary,
  LocalDateTime,
  PlaceDetails,
  ProviderReview,
  Reservation,
  Share,
  SharedTripView,
  Trip,
  UpdateTripInput,
  User,
  type EndpointDefinition,
} from "./index";

describe("explicit country names", () => {
  it("normalizes names, aliases and codes without inferring from cities", () => {
    expect(countryCodeFromName("Japan")).toBe("JP");
    expect(countryCodeFromName("South Korea")).toBe("KR");
    expect(countryCodeFromName("th")).toBe("TH");
    expect(countryCodeFromName("Tokyo")).toBeNull();
  });
});

describe("trip updates", () => {
  it("leaves out preferences that were not sent, so saved stays survive a pace change", () => {
    const parsed = UpdateTripInput.parse({ preferences: { pace: "relaxed", transport: "car", dayStart: "10:00" } });
    expect(parsed.preferences).toEqual({ pace: "relaxed", transport: "car", dayStart: "10:00" });
    expect(parsed.preferences).not.toHaveProperty("accommodations");
  });

  it("still accepts stays when they are sent", () => {
    const parsed = UpdateTripInput.parse({ preferences: { accommodations: [{ name: "Synthetic Hotel", location: null }] } });
    expect(parsed.preferences?.accommodations).toEqual([{ name: "Synthetic Hotel", location: null, checkIn: null, checkOut: null }]);
  });
});

describe("saved place copy input", () => {
  it("accepts account-library places and rejects an empty selection", () => {
    expect(CopyPlacesInput.safeParse({ accountPlaceIds: ["accountplace_example"] }).success).toBe(true);
    expect(CopyPlacesInput.safeParse({}).success).toBe(false);
  });
});

describe("booking calendar dates", () => {
  it.each(["2026-02-29T12:00", "2026-04-31T12:00", "2026-13-01T12:00", "2026-10-01T24:00"])(
    "rejects %s", (value) => expect(LocalDateTime.safeParse(value).success).toBe(false),
  );
  it.each(["2028-02-29T12:00", "2026-10-01T00:00", "2026-10-01T23:59"])(
    "accepts %s", (value) => expect(LocalDateTime.safeParse(value).success).toBe(true),
  );
});

describe("provider content safety", () => {
  it.each(["http://example.test", "javascript:alert(1)", "data:text/html,test"])("rejects unsafe provider URL %s", (url) => {
    const details = fx.placeFixtures.confirmed.selected!.details;
    expect(PlaceDetails.safeParse({ ...details, websiteUrl: url }).success).toBe(false);
    expect(ProviderReview.safeParse({ text: "Synthetic", authorName: "Tester", authorPhotoUrl: url }).success).toBe(false);
  });

  it("bounds provider-authored strings", () => {
    expect(ProviderReview.safeParse({ text: "x".repeat(4_001), authorName: "Tester" }).success).toBe(false);
    expect(PlaceDetails.safeParse({ ...fx.placeFixtures.confirmed.selected!.details, summary: "x".repeat(2_001) }).success).toBe(false);
  });
});

type Case = [name: string, schema: z.ZodType, value: unknown];
const group = (prefix: string, schema: z.ZodType, values: Record<string, unknown>): Case[] =>
  Object.entries(values).map(([key, value]) => [`${prefix}.${key}`, schema, value]);

describe("fixtures match the contracts", () => {
  const cases: Case[] = [
    ["user", User, fx.userFixture],
    ["trip", Trip, fx.tripFixture],
    ["reservation", Reservation, fx.reservationFixture],
    ["sharedView", SharedTripView, fx.sharedViewFixture],
    ...group("inspiration", Inspiration, fx.inspirationFixtures),
    ...group("place", CandidatePlace, fx.placeFixtures),
    ...group("itinerary", Itinerary, fx.itineraryFixtures),
    ...group("share", Share, fx.shareFixtures),
    ...group("error", ApiErrorBody, fx.errorFixtures),
  ];

  it.each(cases)("%s", (_name, schema, value) => {
    expect(schema.safeParse(value).error?.issues ?? []).toEqual([]);
  });
});

describe("endpoint registry", () => {
  const entries = Object.entries(endpoints) as Array<[string, EndpointDefinition]>;

  it("has one endpoint per method and path", () => {
    const keys = entries.map(([, def]) => `${def.method} ${def.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares params that match the path placeholders", () => {
    for (const [id, def] of entries) {
      const fromPath = [...def.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]).sort();
      const fromSchema = def.params instanceof z.ZodObject ? Object.keys(def.params.shape).sort() : [];
      expect({ id, params: fromSchema }).toEqual({ id, params: fromPath });
    }
  });

  it("only uses form-data with object bodies", () => {
    for (const [, def] of entries) {
      if (def.bodyKind === "form-data") expect(def.body).toBeInstanceOf(z.ZodObject);
    }
  });

  it("does not list errors that the router adds implicitly", () => {
    for (const [id, def] of entries) {
      expect({ id, errors: def.errors.filter((e) => (e === "UNAUTHENTICATED" && def.access === "user") || e === "VALIDATION_FAILED") }).toEqual({
        id,
        errors: [],
      });
    }
  });
});
