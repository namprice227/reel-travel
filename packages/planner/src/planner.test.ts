import { defaultTripPreferences, type Reservation } from "@reel/contracts";
import { describe, expect, it } from "vitest";
import { applyEdit, generatePlan, planFingerprint, retimeDay, validatePlan, type PlannablePlace, type PlannerContext } from "./index";
import { breakStop, placeStop, reservationStop } from "./stops";

const daily = (open: string, close: string) => ({
  status: "known" as const,
  windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close })),
});

const place = (placeId: string, overrides: Partial<PlannablePlace> = {}): PlannablePlace => ({
  placeId,
  title: placeId,
  location: { lat: 35.68, lng: 139.76 },
  openingHours: daily("09:00", "21:00"),
  visitMinutes: 60,
  sourceInspirationIds: [`insp_${placeId}`],
  ...overrides,
});

const dinner: Reservation = {
  id: "res_dinner",
  tripId: "trip_1",
  title: "Dinner (locked)",
  placeId: null,
  start: "2026-10-01T19:30",
  end: "2026-10-01T21:00",
  locked: true,
  note: null,
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

function context(overrides: Partial<PlannerContext> = {}): PlannerContext {
  let n = 0;
  return {
    startDate: "2026-10-01", // Thursday
    endDate: "2026-10-02",
    preferences: { ...defaultTripPreferences },
    places: [],
    reservations: [dinner],
    newId: () => `stop_${++n}`,
    ...overrides,
  };
}

const stopsOn = (plan: { days: { date: string; stops: { id: string; placeId: string | null; start: string; end: string; kind: string }[] }[] }, date: string) =>
  plan.days.find((d) => d.date === date)!.stops;

describe("unknown travel", () => {
  it("does not certify adjacent unlocated bookings as reachable", () => {
    const ctx = context({ reservations: [
      { ...dinner, id: "one", start: "2026-10-01T10:00", end: "2026-10-01T11:00" },
      { ...dinner, id: "two", start: "2026-10-01T11:00", end: "2026-10-01T12:00" },
    ] });
    const plan = generatePlan(ctx);
    expect(plan.days[0]!.stops.map(s => s.travelMinutesBefore)).toEqual([null, null]);
    expect(plan.validationStatus).toBe("partially_checked");
    expect(plan.conflicts.filter(c => c.code === "TRAVEL_UNKNOWN")).toHaveLength(2);
    expect(plan.days[0]!.stops.map(s => s.start)).toEqual(["10:00", "11:00"]);
  });

  it("forgets the previous known location after an unlocated booking, including through a break", () => {
    const known = place("known");
    const ctx = context({ places: [known], reservations: [],
      preferences: { ...defaultTripPreferences, accommodation: { name: "Synthetic", location: known.location } } });
    const current = generatePlan(ctx);
    expect(current.validationStatus).toBe("valid");
    // Use the real re-timing path: a new unlocated booking occupies the middle of a generated day.
    ctx.reservations = [{ ...dinner, start: "2026-10-01T09:00", end: "2026-10-01T10:00" }];
    const plan = generatePlan(ctx);
    const after = plan.days[0]!.stops.find(s => s.placeId === known.placeId)!;
    expect(after.travelMinutesBefore).toBeNull();
    expect(plan.validationStatus).toBe("partially_checked");
    const day = retimeDay({ date: ctx.startDate, stops: [
      reservationStop(ctx.reservations[0]!, undefined, "booking"),
      breakStop("pause", 600, 30), placeStop(known, "visit", ctx.startDate, 630),
    ] }, ctx);
    expect(day.stops.map(s => s.travelMinutesBefore)).toEqual([null, 0, null]);
    expect(validatePlan([day], [], ctx).conflicts.filter(c => c.code === "TRAVEL_UNKNOWN")).toHaveLength(2);
  });

  it("keeps breaks stationary and known colocated travel at zero", () => {
    const a = place("a", { visitMinutes: 180 });
    const ctx = context({ reservations: [], places: [a, place("b")],
      preferences: { ...defaultTripPreferences, accommodation: { name: "Synthetic", location: a.location }, breakMinutes: 30 } });
    const plan = generatePlan(ctx);
    expect(plan.days[0]!.stops.some(s => s.kind === "break")).toBe(true);
    expect(plan.days[0]!.stops.every(s => s.travelMinutesBefore === 0)).toBe(true);
    expect(plan.conflicts.some(c => c.code === "TRAVEL_UNKNOWN")).toBe(false);
  });

  it("flags the first leg without accommodation, and still rejects overlapping fixed times", () => {
    const ctx = context({ places: [place("known")], reservations: [] });
    expect(generatePlan(ctx).days[0]!.stops[0]!.travelMinutesBefore).toBeNull();
    ctx.places = [];
    ctx.reservations = [
      { ...dinner, id: "one", start: "2026-10-01T10:00", end: "2026-10-01T12:00" },
      { ...dinner, id: "two", start: "2026-10-01T11:00", end: "2026-10-01T13:00" },
    ];
    const plan = generatePlan(ctx);
    expect(plan.validationStatus).toBe("has_conflicts");
    expect(plan.conflicts.some(c => c.code === "LOCKED_RESERVATION_UNREACHABLE")).toBe(true);
    expect(plan.conflicts.some(c => c.code === "TRAVEL_UNKNOWN")).toBe(true);
  });
});

describe("generatePlan", () => {
  it("visits an open place before waiting for a nearby late-opening place", () => {
    const ctx = context({
      reservations: [], endDate: "2026-10-01",
      preferences: { ...defaultTripPreferences, breakMinutes: 0, accommodation: { name: "Synthetic hotel", location: { lat: 35.68, lng: 139.76 } } },
      places: [place("late", { openingHours: daily("10:20", "21:00") }),
        place("open", { location: { lat: 35.681, lng: 139.761 } })],
    });
    const plan = generatePlan(ctx);
    expect(plan.days[0]!.stops.map((s) => s.placeId)).toEqual(["open", "late"]);
    expect(plan.unscheduledPlaceIds).toEqual([]);
    expect(plan.validationStatus).toBe("valid");
  });

  it("uses interests and known price levels as soft preferences, keeping must-visits first", () => {
    const ctx = context({ reservations: [], places: [
      place("a-expensive", { category: "museum", priceLevel: 4 }),
      place("b-park", { category: "park", priceLevel: 0 }),
      place("c-museum", { category: "art_museum", priceLevel: 1 }),
    ], preferences: { ...defaultTripPreferences, budget: "low", interests: ["ART"] } });
    expect(generatePlan(ctx).days[0]!.stops[0]!.placeId).toBe("c-museum");
    ctx.preferences.mustVisitPlaceIds = ["a-expensive"];
    expect(generatePlan(ctx).days[0]!.stops[0]!.placeId).toBe("a-expensive");
  });

  it("keeps places with missing preference facts and reports price limitations", () => {
    const plan = generatePlan(context({ reservations: [], places: [place("unknown")],
      preferences: { ...defaultTripPreferences, budget: "low", interests: ["museum"] } }));
    expect(plan.unscheduledPlaceIds).toEqual([]);
    expect(plan.assumptions.join(" ")).toContain("unknown prices are not treated as free");
  });

  it("flags travel from accommodation that makes the first booking unreachable", () => {
    const ctx = context({ places: [place("booking-place")],
      preferences: { ...defaultTripPreferences, transport: "walk", accommodation: { name: "Synthetic hotel", location: { lat: 35.7, lng: 139.8 } } },
      reservations: [{ ...dinner, placeId: "booking-place", start: "2026-10-01T09:00", end: "2026-10-01T10:00" }],
    });
    const plan = generatePlan(ctx);
    expect(plan.conflicts).toContainEqual(expect.objectContaining({ code: "LOCKED_RESERVATION_UNREACHABLE", severity: "error" }));
    expect(plan.days[0]!.stops[0]).toMatchObject({ start: "09:00", end: "10:00" });
  });

  it("schedules places around a locked dinner and flags unknown hours", () => {
    const ctx = context({
      places: [
        place("temple", { location: { lat: 35.7148, lng: 139.7967 }, openingHours: daily("06:00", "17:00") }),
        place("museum", { location: { lat: 35.6491, lng: 139.7898 }, visitMinutes: 120 }),
        place("shrine", { location: { lat: 35.6764, lng: 139.6993 }, openingHours: { status: "unknown" } }),
      ],
    });
    const plan = generatePlan(ctx);

    const day1 = stopsOn(plan, "2026-10-01");
    const booking = day1.find((s) => s.kind === "reservation")!;
    expect(booking).toMatchObject({ start: "19:30", end: "21:00" });
    for (const stop of day1.filter((s) => s.kind === "place")) expect(stop.end <= "19:30").toBe(true);

    expect(plan.unscheduledPlaceIds).toEqual([]);
    expect(plan.conflicts.filter((c) => c.severity === "error")).toEqual([]);
    expect(plan.conflicts.map((c) => c.code)).toContain("HOURS_UNKNOWN");
    expect(plan.validationStatus).toBe("partially_checked");
  });

  it("leaves places that are never open unscheduled and explains it", () => {
    const plan = generatePlan(context({ places: [place("closed", { openingHours: { status: "known", windows: [] } })] }));
    expect(plan.unscheduledPlaceIds).toEqual(["closed"]);
    expect(plan.conflicts.map((c) => c.code)).toContain("PLACE_UNSCHEDULED");
  });

  it("reports overlapping locked bookings as conflicts", () => {
    const late = { ...dinner, id: "res_late", title: "Show (locked)", start: "2026-10-01T20:00", end: "2026-10-01T22:00" };
    const plan = generatePlan(context({ reservations: [dinner, late] }));
    expect(plan.validationStatus).toBe("has_conflicts");
    expect(plan.conflicts.map((c) => c.code)).toContain("LOCKED_RESERVATION_UNREACHABLE");
  });
});

describe("applyEdit", () => {
  it("cannot add a place already represented by a booking", () => {
    const ctx = context({ places: [place("booked")], reservations: [{ ...dinner, placeId: "booked" }] });
    expect(() => applyEdit(generatePlan(ctx), { type: "add_place", placeId: "booked", date: "2026-10-02", index: 0 }, ctx))
      .toThrow("already in the itinerary");
  });

  it("rejects an edit that would silently shorten a visit at midnight", () => {
    const ctx = context({ endDate: "2026-10-01", reservations: [],
      preferences: { ...defaultTripPreferences, dayStart: "22:00", dayEnd: "23:59", breakMinutes: 0 },
      places: [place("a", { openingHours: { status: "unknown" } }), place("b", { openingHours: { status: "unknown" } })],
    });
    const plan = generatePlan(ctx);
    expect(plan.unscheduledPlaceIds).toEqual(["b"]);
    const before = structuredClone(plan);
    expect(applyEdit(plan, { type: "add_place", placeId: "b", date: "2026-10-01", index: 1 }, ctx))
      .toMatchObject({ ok: false, conflicts: [{ code: "VISIT_DURATION_TRUNCATED" }] });
    expect(plan).toEqual(before);
  });

  it("replaces a stop without mutating the saved plan, making the old place unscheduled", () => {
    const ctx = context({ endDate: "2026-10-01", reservations: [],
      preferences: { ...defaultTripPreferences, dayEnd: "10:00", breakMinutes: 0 }, places: [place("a"), place("b")] });
    const plan = generatePlan(ctx);
    const before = structuredClone(plan);
    const first = plan.days[0]!.stops[0]!;
    const result = applyEdit(plan, { type: "replace_stop", stopId: first.id, placeId: "b" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.days[0]!.stops[0]!.id).not.toBe(first.id);
    expect(result.plan.unscheduledPlaceIds).toEqual(["a"]);
    expect(plan).toEqual(before);
  });

  it("moves a stop to another day, keeping its id and re-timing it", () => {
    const ctx = context({ reservations: [], places: [place("a"), place("b")] });
    const plan = generatePlan(ctx);
    const b = stopsOn(plan, "2026-10-01").find((s) => s.placeId === "b")!;

    const result = applyEdit(plan, { type: "move_stop", stopId: b.id, toDate: "2026-10-02", toIndex: 0 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stopsOn(result.plan, "2026-10-01").some((s) => s.id === b.id)).toBe(false);
    expect(stopsOn(result.plan, "2026-10-02")[0]).toMatchObject({ id: b.id, start: "09:00", end: "10:00" });
  });

  it("rejects an edit that makes the locked dinner unreachable", () => {
    const ctx = context({ places: [place("long-tour", { visitMinutes: 660, openingHours: { status: "unknown" } })] });
    const plan = generatePlan(ctx);
    const tour = stopsOn(plan, "2026-10-02").find((s) => s.placeId === "long-tour")!;

    const result = applyEdit(plan, { type: "move_stop", stopId: tour.id, toDate: "2026-10-01", toIndex: 0 }, ctx);
    expect(result).toMatchObject({ ok: false, conflicts: [{ code: "LOCKED_RESERVATION_UNREACHABLE" }] });
  });

  it("rejects moving the booking itself", () => {
    const ctx = context();
    const plan = generatePlan(ctx);
    const booking = stopsOn(plan, "2026-10-01").find((s) => s.kind === "reservation")!;

    const result = applyEdit(plan, { type: "move_stop", stopId: booking.id, toDate: "2026-10-02", toIndex: 0 }, ctx);
    expect(result).toMatchObject({ ok: false, conflicts: [{ code: "LOCKED_RESERVATION_CHANGED" }] });
  });
});

describe("planFingerprint", () => {
  it("tracks timezone, provider preferences and displayed booking titles", () => {
    const ctx = context({ timezone: "Asia/Tokyo", places: [place("a", { category: "park", priceLevel: 1 })] });
    const before = planFingerprint(ctx);
    expect(planFingerprint({ ...ctx, timezone: "Asia/Singapore" })).not.toBe(before);
    expect(planFingerprint({ ...ctx, places: [place("a", { category: "museum", priceLevel: 1 })] })).not.toBe(before);
    expect(planFingerprint({ ...ctx, places: [place("a", { category: "park", priceLevel: 4 })] })).not.toBe(before);
    expect(planFingerprint({ ...ctx, reservations: [{ ...dinner, title: "New booking title" }] })).not.toBe(before);
    expect(planFingerprint({ ...ctx, reservations: [{ ...dinner, note: "private note" }] })).toBe(before);
  });
  it("changes when a booking changes", () => {
    const ctx = context();
    const before = planFingerprint(ctx);
    const after = planFingerprint({ ...ctx, reservations: [{ ...dinner, start: "2026-10-01T20:00" }] });
    expect(after).not.toBe(before);
    expect(planFingerprint(ctx)).toBe(before);
  });
});
