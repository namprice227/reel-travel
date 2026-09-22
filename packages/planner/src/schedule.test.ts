import { expect, it } from "vitest";
import { ItineraryProposal, PlanQuality } from "@reel/contracts";
import { itineraryCases } from "../../../evals/itinerary/cases";
import { scheduleProposal } from "./schedule";
import { assessQuality } from "./quality";
import { toMinutes } from "./time";
import { travelMinutes } from "./travel";

// Every location/name/booking in these fixtures is synthetic; no network calls.
const context = () => structuredClone(itineraryCases[0]!.input);
const empty = (ctx = context()) => ({ days: [{ date: ctx.startDate, stops: [] }] });
const saved = (id: string, minutes = 60) => ({ kind: "place" as const, referenceId: id, start: "23:00", durationMinutes: minutes });

it("recovers every eligible saved ID from an empty model proposal before adding filler", () => {
  const ctx = context();
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.unscheduledPlaceIds).toEqual([]);
  expect(plan.days[0]!.stops.filter(s => s.kind === "place").map(s => s.placeId).sort()).toEqual(["art", "food"]);
  expect(plan.quality).toMatchObject({ score: 100, savedPlacesScheduled: 2, savedPlacesTotal: 2 });
  expect(PlanQuality.safeParse(plan.quality).success).toBe(true);
});
it("calculates times from hours and travel instead of accepting impossible model timestamps", () => {
  const ctx = context(); ctx.places[1]!.location = { ...ctx.places[1]!.location, lng: ctx.places[1]!.location.lng + .02 };
  const plan = scheduleProposal({ days: [{ date: ctx.startDate, stops: [saved("art"), saved("food")] }] }, ctx);
  expect(plan.days[0]!.stops.every(s => s.start >= ctx.preferences.dayStart && s.end <= ctx.preferences.dayEnd)).toBe(true);
  expect(plan.conflicts.some(c => c.severity === "error")).toBe(false);
  expect(plan.unscheduledPlaceIds).toEqual([]);
});
it("rejects invented identities, duplicate IDs and model-authored saved-place facts", () => {
  const ctx = context();
  for (const stops of [[saved("invented")], [saved("art"), saved("art")], [{ ...saved("art"), title: "Fake name" }]])
    expect(() => scheduleProposal({ days: [{ date: ctx.startDate, stops }] }, ctx)).toThrow();
});
it("preserves booking date/start/end and represents its place only once", () => {
  const ctx = structuredClone(itineraryCases[1]!.input);
  const plan = scheduleProposal({ days: [{ date: ctx.startDate, stops: [{ kind: "reservation", referenceId: "booking", start: "12:00" }] }] }, ctx);
  expect(plan.days[0]!.stops.find(s => s.reservationId)).toMatchObject({ start: "12:00", end: "13:00", locked: true });
  expect(plan.days[0]!.stops.filter(s => s.placeId === "food")).toHaveLength(1);
  expect(plan.quality?.savedPlacesScheduled).toBe(2);
});
it("keeps a useful partial plan and explains a closed saved place without failing", () => {
  const ctx = context(); ctx.places[0]!.openingHours = { status: "known", windows: [] };
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.unscheduledPlaceIds).toEqual(["art"]);
  const issue = plan.quality!.issues.find(i => i.code === "OMITTED_PLACE")!;
  expect(issue.message).toContain("known opening windows");
  expect(issue.alternatives.join()).toContain("choose another date");
  expect(plan.days[0]!.stops.some(s => s.placeId === "food")).toBe(true);
});
it("reclaims optional lunch for a substantial visit that cannot fit around it and explains the trade-off", () => {
  const ctx = context(); ctx.places = [ctx.places[0]!]; ctx.places[0]!.visitMinutes = 240; ctx.preferences.dayEnd = "14:00";
  const plan = scheduleProposal({ days: [{ date: ctx.startDate, stops: [saved("art", 240)] }] }, ctx);
  expect(plan.unscheduledPlaceIds).toEqual([]);
  expect(plan.days[0]!.stops.find(s => s.placeId === "art")?.plannedDurationMinutes).toBe(240);
  expect(plan.quality).toMatchObject({ repairApplied: true });
  expect(plan.quality!.issues.some(i => i.code === "MEAL_WINDOW")).toBe(true);
});
it("repairs rushed duration when typical visiting time fits, without requiring another model call", () => {
  const ctx = context();
  const plan = scheduleProposal({ days: [{ date: ctx.startDate, stops: [saved("art", 15), saved("food")] }] }, ctx);
  expect(plan.days[0]!.stops.find(s => s.placeId === "art")?.plannedDurationMinutes).toBe(60);
  expect(plan.quality!.repairApplied).toBe(true);
});
it("fits lunch before a fixed afternoon outing even without a nearby provider", () => {
  const ctx = structuredClone(itineraryCases[1]!.input);
  ctx.places = [ctx.places[0]!];
  const booking = ctx.reservations[0]!; booking.placeId = null; booking.title = "Synthetic afternoon tour";
  booking.start = `${ctx.startDate}T13:30`; booking.end = `${ctx.startDate}T17:00`;
  const plan = scheduleProposal({ days: [{ date: ctx.startDate, stops: [{ kind: "reservation", referenceId: booking.id, start: "13:30" }] }] }, ctx);
  const lunch = plan.days[0]!.stops.find(s => s.kind === "meal")!;
  expect(lunch).toBeDefined(); expect(lunch.start >= "11:30").toBe(true); expect(lunch.end < "13:30").toBe(true);
  expect(lunch.location).toBeNull(); expect(lunch.hoursCheck).toBe("unknown");
});
it("reserves return travel to the dated accommodation before accepting a long outing", () => {
  const ctx = context(); ctx.places = [ctx.places[0]!]; ctx.preferences.transport = "walk"; ctx.preferences.dayEnd = "12:00";
  ctx.places[0]!.location = { ...ctx.places[0]!.location, lng: ctx.places[0]!.location.lng + .025 }; ctx.places[0]!.visitMinutes = 120;
  const outbound = travelMinutes(ctx.preferences.accommodations[0]!.location, ctx.places[0]!.location, "walk")!;
  expect(outbound + 120).toBeLessThanOrEqual(180);
  expect(outbound * 2 + 120).toBeGreaterThan(180);
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.unscheduledPlaceIds).toEqual(["art"]);
  expect(plan.quality!.issues[0]!.alternatives.join()).toContain("extend");
});
it("uses a matching dated forecast to move an outdoor visit into a dry afternoon", () => {
  const ctx = context(); ctx.places = [ctx.places[0]!]; ctx.places[0]!.category = "garden";
  ctx.weather = [{ date: ctx.startDate, location: ctx.places[0]!.location, fetchedAt: "2026-09-23T00:00:00Z",
    hours: [9, 10, 11, 12, 13, 14, 15].map(h => ({ time: `${h.toString().padStart(2, "0")}:00`, precipitationProbability: h < 13 ? 90 : 0, apparentTemperature: 24, weatherCode: h < 13 ? 63 : 0 })) }];
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.days[0]!.stops.find(s => s.placeId === "art")!.start >= "13:00").toBe(true);
  expect(plan.quality!.issues.some(i => i.code === "WEATHER")).toBe(false);
  ctx.weather[0]!.date = "2026-10-02";
  const withoutForecast = scheduleProposal(empty(), ctx);
  expect(withoutForecast.days[0]!.stops.find(s => s.placeId === "art")!.start).toBe("09:00");
});
it("keeps preferences soft and does not fill every available gap", () => {
  const ctx = context(); ctx.places[0]!.priceLevel = 4;
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.unscheduledPlaceIds).toEqual([]);
  expect(plan.quality!.issues.some(i => i.code === "PREFERENCES")).toBe(true);
  expect(plan.days[0]!.stops.some(s => s.kind === "suggestion")).toBe(false);
});
it("exposes a low usefulness score independently of schedule validity", () => {
  const ctx = context(); const plan = scheduleProposal(empty(), ctx);
  const sparse = assessQuality({ ...plan, days: [{ date: ctx.startDate, stops: [] }], unscheduledPlaceIds: ["art", "food"] }, ctx);
  expect(sparse.quality!.score).toBeLessThan(50);
  expect(sparse.validationStatus).toBe(plan.validationStatus); // scoring never changes hard validity
});
it("leaves unknown travel unchecked instead of fabricating a location", () => {
  const ctx = context(); ctx.preferences.accommodations = [];
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.validationStatus).toBe("partially_checked");
  expect(plan.conflicts.some(c => c.code === "TRAVEL_UNKNOWN")).toBe(true);
});
it("does not force a relaxed trip to exactly three visits per day", () => {
  const ctx = context(); ctx.preferences.pace = "relaxed";
  ctx.places = Array.from({ length: 5 }, (_, i) => ({ ...ctx.places[0]!, placeId: `synthetic-${i}`, visitMinutes: 30 }));
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.unscheduledPlaceIds).toEqual([]);
  expect(plan.days[0]!.stops.filter(s => s.kind === "place")).toHaveLength(5);
});
it("gives an actionable explanation for incompatible bookings without moving them", () => {
  const ctx = structuredClone(itineraryCases[1]!.input);
  ctx.reservations.push({ ...ctx.reservations[0]!, id: "second", placeId: null, start: `${ctx.startDate}T12:30`, end: `${ctx.startDate}T13:30` });
  const proposal = { days: [{ date: ctx.startDate, stops: ctx.reservations.map(r => ({ kind: "reservation", referenceId: r.id, start: r.start.slice(11) })) }] };
  expect(() => scheduleProposal(proposal, ctx)).toThrowError(expect.objectContaining({ issues: expect.arrayContaining([expect.stringContaining("Trip setup")]) }));
});
it("never overlaps a rest break with the next saved visit's travel", () => {
  const ctx = context(); ctx.places[1]!.location = { ...ctx.places[1]!.location, lng: ctx.places[1]!.location.lng + .01 };
  const proposal: ItineraryProposal = { days: [{ date: ctx.startDate, stops: [saved("art"), { kind: "break", referenceId: null, start: "10:00", durationMinutes: 30 }, saved("food")] }] };
  const plan = scheduleProposal(proposal, ctx);
  expect(plan.conflicts.some(c => c.severity === "error")).toBe(false);
  for (let i = 1; i < plan.days[0]!.stops.length; i++) {
    const prev = plan.days[0]!.stops[i - 1]!; const next = plan.days[0]!.stops[i]!;
    expect(toMinutes(next.start)).toBeGreaterThanOrEqual(toMinutes(prev.end) + (next.travelMinutesBefore ?? 0));
  }
});
it("flags a destination-only trip with no outings while allowing deliberate free afternoons", () => {
  const ctx = context(); ctx.places = []; ctx.preferences.mustVisitPlaceIds = [];
  const plan = scheduleProposal(empty(), ctx);
  expect(plan.quality!.score).toBeLessThan(85);
  expect(plan.quality!.issues.some(i => i.message.includes("no outing"))).toBe(true);
  expect(plan.validationStatus).not.toBe("has_conflicts");
});
