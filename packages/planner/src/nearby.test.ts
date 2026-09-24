import { describe, it, expect } from "vitest";
import { defaultTripPreferences, type Stop } from "@reel/contracts";
import { ensureLunch, nearbySlots, fitNearby, indoorWeather, matchesIdea } from "./nearby";
import type { NearbyVenue } from "./nearby";
import type { PlannerContext, PlanResult } from "./types";
import { validatePlan } from "./validate";
const location = { lat: 35.68, lng: 139.76 };
const hours = {
  status: "known" as const,
  windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: "09:00",
    close: "20:00",
  })),
};
function ctx(): PlannerContext {
  return {
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    timezone: "Asia/Tokyo",
    preferences: {
      ...defaultTripPreferences,
      breakMinutes: 0,
      transport: "walk",
      budget: "low",
      interests: ["vegetarian", "history"],
      accommodations: [
        { name: "Stay", location, checkIn: null, checkOut: null },
      ],
    },
    places: [
      {
        placeId: "outing",
        title: "Afternoon museum",
        location,
        openingHours: hours,
        visitMinutes: 60,
        sourceInspirationIds: [],
      },
    ],
    reservations: [],
    newId: () => "inserted-lunch",
  };
}
function stop(
  id: string,
  kind: Stop["kind"],
  start: string,
  end: string,
): Stop {
  return {
    id,
    kind,
    title: id,
    placeId: kind === "place" ? "outing" : null,
    reservationId: null,
    location: kind === "place" ? location : null,
    start,
    end,
    locked: false,
    travelMinutesBefore: null,
    hoursCheck: "unknown",
    sourceInspirationIds: [],
  };
}
function plan(
  stops = [
    stop("lunch", "meal", "12:00", "13:00"),
    stop("outing", "place", "13:30", "14:30"),
  ],
): PlanResult {
  return {
    days: [{ date: "2026-10-01", stops }],
    assumptions: [],
    conflicts: [],
    unscheduledPlaceIds: [],
    validationStatus: "partially_checked",
  };
}
function venue(id = "restaurant"): NearbyVenue {
  return {
    name: "Synthetic Restaurant",
    address: "Synthetic address",
    location: { lat: 35.681, lng: 139.76 },
    types: ["restaurant"],
    facts: {
      provider: "google",
      providerPlaceId: id,
      fetchedAt: "2026-09-22T00:00:00.000Z",
      openingHours: hours,
      priceLevel: 1,
      category: "restaurant",
      attribution: "Google Maps",
    },
  };
}
function fit(
  v: NearbyVenue[],
  p = plan(),
  context = ctx(),
  used = new Set<string>(),
) {
  return fitNearby(p, context, nearbySlots(p, context)[0]!, v, used);
}
describe("contextual nearby suggestions (synthetic fixtures)", () => {
  it("anchors vegetarian lunch near the following outing, checks both legs, and keeps it unconfirmed", () => {
    const c = ctx(),
      p = plan();
    const slot = nearbySlots(p, c)[0]!;
    expect(slot.anchor).toEqual(location);
    expect(slot.query).toContain("vegetarian");
    const out = fit([venue()]);
    const lunch = out.days[0]!.stops[0]!;
    expect(lunch.suggestedVenue?.providerPlaceId).toBe("restaurant");
    expect(lunch.placeId).toBeNull();
    expect(lunch.kind).toBe("meal");
    expect(lunch.end).toBe("12:45");
    expect(out.days[0]!.stops[1]!.start).toBe("13:30");
    expect(out.conflicts.filter((c) => c.severity === "error")).toEqual([]);
  });
  it("rejects out-of-radius, over-budget, closed, unknown-hours and duplicate venues", () => {
    const base = venue();
    for (const candidate of [
      { ...base, location: { lat: 36, lng: 140 } },
      { ...base, facts: { ...base.facts, priceLevel: 4 } },
      {
        ...base,
        facts: {
          ...base.facts,
          openingHours: { status: "known" as const, windows: [] },
        },
      },
      {
        ...base,
        facts: { ...base.facts, openingHours: { status: "unknown" as const } },
      },
    ])
      expect(
        fit([candidate]).days[0]!.stops[0]!.suggestedVenue,
      ).toBeUndefined();
    expect(
      fit([base], plan(), ctx(), new Set(["restaurant"])).days[0]!.stops[0]!
        .suggestedVenue,
    ).toBeUndefined();
  });
  it("rejects a venue when the meal fits but travel to the outing does not", () => {
    const p = plan([
      stop("lunch", "meal", "12:00", "12:50"),
      stop("outing", "place", "12:50", "13:50"),
    ]);
    expect(
      fit([{ ...venue(), location: { lat: 35.687, lng: 139.76 } }], p).days[0]!
        .stops[0]!.suggestedVenue,
    ).toBeUndefined();
  });
  it("uses only matching dated local hourly weather and selects an indoor category", () => {
    const c = ctx();
    c.preferences.interests = ["nature"];
    c.weather = [
      {
        date: c.startDate,
        location,
        fetchedAt: "2026-09-22T00:00:00Z",
        hours: [
          {
            time: "12:00",
            apparentTemperature: 25,
            precipitationProbability: 90,
            weatherCode: 61,
          },
        ],
      },
    ];
    expect(indoorWeather(c, c.startDate, location, "12:00", "13:00")).toBe(
      true,
    );
    expect(indoorWeather(c, "2026-10-02", location, "12:00", "13:00")).toBe(
      false,
    );
    expect(
      indoorWeather(c, c.startDate, { lat: 1, lng: 1 }, "12:00", "13:00"),
    ).toBe(false);
    const p = plan([
      stop("idea", "suggestion", "12:00", "13:00"),
      stop("outing", "place", "13:30", "14:30"),
    ]);
    expect(nearbySlots(p, c)[0]!.query).toBe("museums indoor attractions");
    expect(
      fit([{ ...venue(), types: ["park"] }], p, c).days[0]!.stops[0]!
        .suggestedVenue,
    ).toBeUndefined();
    expect(
      fit([{ ...venue(), types: ["museum"] }], p, c).days[0]!.stops[0]!
        .suggestedVenue,
    ).toBeDefined();
  });
  it("inserts lunch only into a free midday gap and never duplicates lunch", () => {
    const p = plan([stop("outing", "place", "14:00", "15:00")]);
    const out = ensureLunch(p, ctx());
    expect(out.days[0]!.stops.map((s) => s.kind)).toEqual(["meal", "place"]);
    expect(ensureLunch(out, ctx()).days[0]!.stops).toHaveLength(2);
    expect(
      ensureLunch(plan([stop("outing", "place", "11:00", "14:00")]), ctx())
        .days[0]!.stops,
    ).toHaveLength(1);
  });
  it("preserves partial checking for unknown neighbouring suggestions and can ground destination-only ideas", () => {
    const c = ctx();
    c.places = [];
    c.preferences.accommodations = [];
    const p = plan([
      stop("lunch", "meal", "12:00", "13:00"),
      stop("idea", "suggestion", "14:00", "15:00"),
    ]);
    const slot = nearbySlots(p, c, location)[0]!;
    const out = fitNearby(p, c, slot, [venue()], new Set());
    expect(out.days[0]!.stops[0]!.suggestedVenue).toBeDefined();
    expect(out.validationStatus).toBe("partially_checked");
  });
  it("rechecks retrieved opening hours after edits", () => {
    const out = fit([venue()]);
    out.days[0]!.stops[0]!.start = "08:00";
    out.days[0]!.stops[0]!.end = "08:45";
    expect(
      validatePlan(out.days, [], ctx()).conflicts.some(
        (c) => c.code === "OUTSIDE_OPENING_HOURS",
      ),
    ).toBe(true);
  });
  it("caps searches per day with separate meal and suggestion budgets, lunch first", () => {
    const p = plan([
      stop("breakfast", "meal", "09:00", "10:00"),
      stop("idea", "suggestion", "10:30", "11:30"),
      stop("lunch", "meal", "12:00", "13:00"),
      stop("outing", "place", "13:30", "14:30"),
      stop("dinner", "meal", "18:00", "19:00"),
      stop("idea2", "suggestion", "15:00", "16:00"),
      stop("idea3", "suggestion", "16:30", "17:30"),
    ]);
    const slots = nearbySlots(p, ctx());
    expect(slots.map((s) => s.stopId)).toEqual(["lunch", "breakfast", "idea", "idea2"]);
  });
});

describe("grounding the model's own suggested activities (synthetic fixtures)", () => {
  const idea = (title = "Stroll through Yanaka Ginza", area = "Yanaka, Taito, Tokyo") =>
    ({ ...stop("idea", "suggestion", "10:00", "12:00"), title, suggestedArea: area, planningNote: "Old-town shopping street.", plannedDurationMinutes: 120 });
  const listing = (name: string, types = ["tourist_attraction"], openingHours: NearbyVenue["facts"]["openingHours"] = { status: "unknown" }): NearbyVenue => ({
    ...venue(`id-${name}`), name, types, address: "Synthetic address", location: { lat: 35.69, lng: 139.77 },
    facts: { ...venue().facts, providerPlaceId: `id-${name}`, openingHours, priceLevel: null, category: types[0]! },
  });
  const ideaPlan = () => plan([idea(), stop("outing", "place", "13:00", "14:00")]);

  it("searches for the suggested activity in its area instead of a generic query", () => {
    const slot = nearbySlots(ideaPlan(), ctx())[0]!;
    expect(slot.idea).toEqual({ title: "Stroll through Yanaka Ginza", area: "Yanaka, Taito, Tokyo" });
    expect(slot.query).toBe("Stroll through Yanaka Ginza, Yanaka, Taito, Tokyo");
    expect(slot.radiusMeters).toBeGreaterThan(3000);
  });

  it("maps the idea to the matching listing even without listed hours, keeping its title and length", () => {
    const p = ideaPlan();
    const out = fitNearby(p, ctx(), nearbySlots(p, ctx())[0]!, [listing("Yanaka Cemetery"), listing("Yanaka Ginza")], new Set());
    const stopOut = out.days[0]!.stops[0]!;
    expect(stopOut.suggestedVenue?.providerPlaceId).toBe("id-Yanaka Ginza");
    expect(stopOut).toMatchObject({ title: "Stroll through Yanaka Ginza", hoursCheck: "unknown", location: { lat: 35.69, lng: 139.77 } });
    expect(stopOut.suggestedArea).toContain("Yanaka Ginza");
    expect(stopOut.planningNote).toMatch(/^Old-town shopping street\. Matched to a Google Maps listing/);
    expect(toLength(stopOut)).toBeGreaterThan(60);
    expect(out.conflicts.filter((c) => c.severity === "error")).toEqual([]);
  });

  it("never swaps a named idea for unrelated filler, a whole city or a listing closed at that time", () => {
    const p = ideaPlan();
    const slot = nearbySlots(p, ctx())[0]!;
    const closed = { status: "known" as const, windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "18:00", close: "22:00" })) };
    for (const candidates of [[listing("Tokyo National Museum")], [listing("Yanaka", ["locality"])], [listing("Yanaka Ginza", ["tourist_attraction"], closed)]])
      expect(fitNearby(p, ctx(), slot, candidates, new Set()).days[0]!.stops[0]!.suggestedVenue).toBeUndefined();
  });

  it("matches a neighbourhood walk to the neighbourhood the area names", () => {
    expect(matchesIdea({ name: "Shimokitazawa", types: ["sublocality"] }, { title: "Evening vintage-shop walk", area: "Shimokitazawa, Setagaya" })).toBe(true);
    expect(matchesIdea({ name: "Shimokitazawa Station", types: ["train_station"] }, { title: "Evening vintage-shop walk", area: "Shimokitazawa, Setagaya" })).toBe(false);
    expect(matchesIdea({ name: "Sensō-ji", types: ["place_of_worship"] }, { title: "Visit Senso-ji at dawn", area: "Asakusa" })).toBe(true);
  });
});

const toLength = (s: Stop) => {
  const [sh, sm] = s.start.split(":").map(Number);
  const [eh, em] = s.end.split(":").map(Number);
  return eh! * 60 + em! - (sh! * 60 + sm!);
};

it("preserves a locked booking and excludes the same retrieved venue on another day", () => {
  const c = ctx();
  c.reservations = [
    {
      id: "booking",
      tripId: "trip",
      title: "Fixed outing",
      placeId: "outing",
      start: "2026-10-01T13:30",
      end: "2026-10-01T14:30",
      locked: true,
      note: null,
      createdAt: "2026-09-22T00:00:00Z",
      updatedAt: "2026-09-22T00:00:00Z",
    },
  ];
  const booking = {
    ...stop("booking", "reservation", "13:30", "14:30"),
    location,
    placeId: "outing",
    reservationId: "booking",
    locked: true,
  };
  const p = plan([stop("lunch", "meal", "12:00", "13:00"), booking]);
  const used = new Set<string>();
  const first = fit([venue()], p, c, used);
  expect(first.days[0]!.stops[1]).toMatchObject({
    start: "13:30",
    end: "14:30",
    locked: true,
    reservationId: "booking",
  });
  expect(used.has("restaurant")).toBe(true);
  expect(
    fit([venue()], p, c, used).days[0]!.stops[0]!.suggestedVenue,
  ).toBeUndefined();
});
