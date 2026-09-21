import { expect, it } from "vitest";
import { compileProposal } from "./proposal";
import { applyEdit } from "./edit";
import { itineraryCases } from "../../../evals/itinerary/cases";
const ctx = () => structuredClone(itineraryCases[0]!.input);
const meal = { kind: "meal", referenceId: null, start: "12:00", durationMinutes: 60, title: "Lunch near the museum", area: "Synthetic centre", reason: "A relaxed lunch between visits." };
const idea = { kind: "suggestion", referenceId: null, start: "14:00", durationMinutes: 120, title: "Explore the riverside", area: "Synthetic centre", reason: "An easy nearby outing for a sparse afternoon." };
it("creates a sparse-trip timeline with meals and unverified suggestions, without inventing map facts", () => {
  const context = ctx(); context.places = [];
  const plan = compileProposal({ days: [{ date: context.startDate, stops: [meal, idea] }], seasonalAdvice: "Check local conditions; keep an indoor alternative." }, context);
  expect(plan.validationStatus).toBe("partially_checked");
  expect(plan.days[0]!.stops[1]).toMatchObject({ kind: "suggestion", location: null, placeId: null, locked: false, hoursCheck: "unknown", travelMinutesBefore: null, end: "16:00" });
  expect(plan.assumptions.join()).toContain("not a forecast");
  expect(plan.unscheduledPlaceIds).toEqual([]);
});
it("supports a longer outing and preserves its chosen duration through edits", () => {
  const context = ctx();
  const plan = compileProposal({ days: [{ date: context.startDate, stops: [{ kind: "place", referenceId: "art", start: "09:00", durationMinutes: 180 }, meal, idea] }] }, context);
  expect(plan.days[0]!.stops[0]).toMatchObject({ end: "12:00", plannedDurationMinutes: 180 });
  const edited = applyEdit(plan, { type: "remove_stop", stopId: plan.days[0]!.stops[2]!.id }, context);
  expect(edited.ok).toBe(true);
  if (edited.ok) expect(edited.plan.days[0]!.stops[0]).toMatchObject({ start: "09:00", end: "12:00", plannedDurationMinutes: 180 });
});
it("accepts a shorter practical visit, and rest can be distributed instead of one mandatory break", () => {
  const context = ctx();
  const plan = compileProposal({ days: [{ date: context.startDate, stops: [
    { kind: "place", referenceId: "art", start: "09:00", durationMinutes: 30 },
    { kind: "break", referenceId: null, start: "09:30", durationMinutes: 15 },
    { kind: "place", referenceId: "food", start: "10:00", durationMinutes: 45 },
    { kind: "break", referenceId: null, start: "10:45", durationMinutes: 15 },
  ] }] }, context);
  expect(plan.validationStatus).toBe("valid");
});
it.each([
  { ...idea, referenceId: "art" },
  { ...idea, location: { lat: 1, lng: 1 } },
  { ...idea, area: undefined },
  { ...idea, durationMinutes: 0 },
  { ...idea, start: "23:00" },
])("rejects invented identities, coordinates and invalid suggestion blocks", invalid => {
  expect(() => compileProposal({ days: [{ date: "2026-10-01", stops: [invalid] }] }, ctx())).toThrow();
});
it("keeps fixed bookings protected while adding meals and suggestions", () => {
  const context = structuredClone(itineraryCases[1]!.input);
  const plan = compileProposal({ days: [{ date: context.startDate, stops: [
    { kind: "reservation", referenceId: "booking", start: "12:00" }, idea,
  ] }] }, context);
  expect(plan.days[0]!.stops[0]).toMatchObject({ start: "12:00", end: "13:00", locked: true });
  expect(() => compileProposal({ days: [{ date: context.startDate, stops: [idea] }] }, context)).toThrow();
});

it("keeps lunch at its proposed time when an earlier activity is removed", () => {
  const context = ctx();
  const plan = compileProposal({ days: [{ date: context.startDate, stops: [
    { kind: "place", referenceId: "art", start: "09:00" }, meal, idea,
  ] }] }, context);
  const edited = applyEdit(plan, { type: "remove_stop", stopId: plan.days[0]!.stops[0]!.id }, context);
  expect(edited.ok).toBe(true);
  if (edited.ok) expect(edited.plan.days[0]!.stops[0]).toMatchObject({ kind: "meal", start: "12:00", end: "13:00" });
});
