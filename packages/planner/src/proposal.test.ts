import { expect, it } from "vitest";
import { compileProposal, ProposalError } from "./proposal";
import { itineraryCases } from "../../../evals/itinerary/cases";
import type { ItineraryProposal } from "@reel/contracts";
const context = (id = "normal") => structuredClone(itineraryCases.find(c => c.id === id)!.input);
const proposal = (): ItineraryProposal => ({ days: [{ date: "2026-10-01", stops: [
  { kind: "place", referenceId: "art", start: "09:00" },
  { kind: "break", referenceId: null, start: "10:00" },
  { kind: "place", referenceId: "food", start: "10:30" },
] }] });
it("hydrates only authoritative identities, durations and computed travel", () => {
  const result = compileProposal(proposal(), context());
  expect(result.validationStatus).toBe("valid");
  expect(result.days[0]!.stops[0]).toMatchObject({ title: "Synthetic art", end: "10:00", hoursCheck: "open", locked: false });
  expect(result.unscheduledPlaceIds).toEqual([]);
});
it("starts each proposed day where the traveler slept the night before", () => {
  const ctx = context();
  const secondLocation = { lat: 36, lng: 140 };
  ctx.endDate = "2026-10-02";
  ctx.places[1]!.location = secondLocation;
  ctx.preferences.accommodations = [
    { name: "First stay", location: ctx.places[0]!.location, checkIn: "2026-10-01", checkOut: "2026-10-01" },
    { name: "Second stay", location: secondLocation, checkIn: "2026-10-02", checkOut: "2026-10-02" },
  ];
  const result = compileProposal({ days: [
    { date: "2026-10-01", stops: [{ kind: "place", referenceId: "art", start: "09:00" }] },
    { date: "2026-10-02", stops: [{ kind: "place", referenceId: "food", start: "13:00" }] },
  ] }, ctx);
  // Day two changes hotel, so its first leg is from the first stay to the second stay's neighbourhood.
  const [dayOne, dayTwo] = result.days.map(day => day.stops[0]!.travelMinutesBefore);
  expect(dayOne).toBe(0);
  expect(dayTwo).toBeGreaterThan(0);
});
it.each([
  ["invented ID", (p: ItineraryProposal) => { p.days[0]!.stops[0]!.referenceId = "invented"; }],
  ["duplicate place", (p: ItineraryProposal) => { p.days[0]!.stops[2]!.referenceId = "art"; }],
  ["overlap", (p: ItineraryProposal) => { p.days[0]!.stops[2]!.start = "09:30"; }],
  ["before start", (p: ItineraryProposal) => { p.days[0]!.stops[0]!.start = "08:00"; }],
  ["after end", (p: ItineraryProposal) => { p.days[0]!.stops[2]!.start = "17:30"; }],
  ["midnight", (p: ItineraryProposal) => { p.days[0]!.stops[2]!.start = "23:30"; }],
  ["outside dates", (p: ItineraryProposal) => { p.days[0]!.date = "2026-10-02"; }],
] as const)("rejects %s", (_, mutate) => {
  const p = proposal(); mutate(p); expect(() => compileProposal(p, context())).toThrow(ProposalError);
});
it("rejects missing dates and unexpected model facts", () => {
  expect(() => compileProposal({ days: [] }, context())).toThrow(ProposalError);
  const p = proposal(); Object.assign(p.days[0]!.stops[0]!, { title: "Fabricated name" });
  expect(() => compileProposal(p, context())).toThrow(ProposalError);
});
it("keeps unknown hours and travel partially checked", () => {
  const p = proposal(); p.days[0]!.stops = [p.days[0]!.stops[0]!];
  const result = compileProposal(p, context("unknown"));
  expect(result.validationStatus).toBe("partially_checked");
  expect(result.conflicts.map(c => c.code)).toEqual(expect.arrayContaining(["HOURS_UNKNOWN", "TRAVEL_UNKNOWN"]));
});
it("rejects closed hours and insufficient travel but treats pace as guidance", () => {
  const p = proposal(), ctx = context();
  ctx.places[0]!.openingHours = { status: "known", windows: [] };
  expect(() => compileProposal(p, ctx)).toThrow(ProposalError);
  const far = context(); far.places[0]!.location = { lat: 36, lng: 140 };
  expect(() => compileProposal(p, far)).toThrow(ProposalError);
  const many = context(); many.preferences.pace = "relaxed";
  for (let i = 0; i < 2; i++) { const id = `extra${i}`; many.places.push({ ...many.places[0]!, placeId: id });
    p.days[0]!.stops.push({ kind: "place", referenceId: id, start: `${12 + i}:00` }); }
  expect(compileProposal(p, many).days[0]!.stops.filter(s => s.kind === "place")).toHaveLength(4);
});
it("keeps booking times immutable and requires every booking once", () => {
  const p = proposal(), ctx = context("booking");
  p.days[0]!.stops[2] = { kind: "reservation", referenceId: "booking", start: "12:00" };
  expect(compileProposal(p, ctx).days[0]!.stops[2]).toMatchObject({ locked: true, start: "12:00", end: "13:00" });
  p.days[0]!.stops[2]!.start = "12:30";
  expect(() => compileProposal(p, ctx)).toThrow(ProposalError);
  p.days[0]!.stops.pop();
  expect(() => compileProposal(p, ctx)).toThrow(ProposalError);
});
it("computes omissions independently instead of trusting model claims", () => {
  const p = proposal(); p.days[0]!.stops = [p.days[0]!.stops[0]!];
  const result = compileProposal(p, context());
  expect(result.unscheduledPlaceIds).toEqual(["food"]);
  expect(result.conflicts.some(c => c.code === "PLACE_UNSCHEDULED")).toBe(true);
});
it("rejects unreachable unlocked bookings instead of downgrading them to a warning", () => {
  const ctx = context("booking"); ctx.reservations[0]!.locked = false;
  const p = proposal(); p.days[0]!.stops = [
    { kind: "place", referenceId: "art", start: "11:30" },
    { kind: "reservation", referenceId: "booking", start: "12:00" },
    { kind: "break", referenceId: null, start: "13:00" },
  ];
  expect(() => compileProposal(p, ctx)).toThrow(ProposalError);
});
it("distinguishes unknown, duplicate and booked IDs for targeted repair", () => {
  const duplicate = proposal(); duplicate.days[0]!.stops[2]!.referenceId = "art";
  try { compileProposal(duplicate, context()); throw Error("expected rejection"); }
  catch (error) { expect(error).toBeInstanceOf(ProposalError); expect((error as ProposalError).issues.join()).toContain('PLACE_DUPLICATE (art): "Synthetic art" appears twice: 2026-10-01 at 09:00 and 2026-10-01 at 10:30'); }
  const unknown = proposal(); unknown.days[0]!.stops[0]!.referenceId = "invented";
  try { compileProposal(unknown, context()); throw Error("expected rejection"); }
  catch (error) { expect((error as ProposalError).issues.join()).toContain("PLACE_UNKNOWN (invented)"); }
  try { compileProposal(proposal(), context("booking")); throw Error("expected rejection"); }
  catch (error) { expect((error as ProposalError).issues.join()).toContain("PLACE_BOOKED (food)"); }
});
