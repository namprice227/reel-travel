import { defaultTripPreferences, type Reservation } from "@reel/contracts";
import { describe, expect, it } from "vitest";
import { applyEdit, generatePlan, planFingerprint, type PlannablePlace, type PlannerContext } from "./index";

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

describe("generatePlan", () => {
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
  it("changes when a booking changes", () => {
    const ctx = context();
    const before = planFingerprint(ctx);
    const after = planFingerprint({ ...ctx, reservations: [{ ...dinner, start: "2026-10-01T20:00" }] });
    expect(after).not.toBe(before);
    expect(planFingerprint(ctx)).toBe(before);
  });
});
