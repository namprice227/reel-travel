import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as fx from "../fixtures/index";
import {
  ApiErrorBody,
  CandidatePlace,
  endpoints,
  Inspiration,
  Itinerary,
  Reservation,
  Share,
  SharedTripView,
  Trip,
  User,
  type EndpointDefinition,
} from "./index";

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
      expect({ id, errors: def.errors.filter((e) => e === "UNAUTHENTICATED" || e === "VALIDATION_FAILED") }).toEqual({
        id,
        errors: [],
      });
    }
  });
});
