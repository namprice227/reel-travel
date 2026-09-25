import { ItineraryProposal, type Day, type Stop } from "@reel/contracts";
import { dayEndLocation, dayStartLocation } from "./stay-fit";
import { planAssumptions } from "./generate";
import { checkHours, earliestOpenStart } from "./hours";
import { ensureLunch, indoorWeather, recheck } from "./nearby";
import { ProposalError } from "./proposal";
import { assessQuality, betterPlan, isDining, isOutdoor } from "./quality";
import { breakStop, placeStop, reservationStop } from "./stops";
import { datePart, datesBetween, timePart, toLocalTime, toMinutes } from "./time";
import { travelMinutes } from "./travel";
import { defaultStopId, type PlannerContext, type PlanResult } from "./types";

type Item = ItineraryProposal["days"][number]["stops"][number];

/** Identity/date/booking errors still require model repair; flexible timestamps are only hints. */
function readProposal(raw: unknown, ctx: PlannerContext): ItineraryProposal {
  const parsed = ItineraryProposal.safeParse(raw);
  if (!parsed.success) throw new ProposalError(["SCHEMA: Invalid itinerary JSON."]);
  const proposal = parsed.data;
  if (JSON.stringify(proposal.days.map(d => d.date)) !== JSON.stringify(datesBetween(ctx.startDate, ctx.endDate)))
    throw new ProposalError(["DATES: Include every trip date exactly once in order."]);
  const used = new Map<string, string>(); const bookings = new Set<string>(); const issues: string[] = [];
  for (const day of proposal.days) day.stops = day.stops.filter(item => {
    if (!["meal", "suggestion"].includes(item.kind) && (item.title || item.area || item.reason)) issues.push("FACTS: Saved-place and booking facts must come from the trip, not model text.");
    if (item.kind === "place") {
      if (!ctx.places.some(p => p.placeId === item.referenceId)) issues.push(`PLACE_UNKNOWN: Use only confirmed place IDs (${item.referenceId}).`);
      // A repeated visit needs no model repair: keep the first and leave the later slot free.
      if (used.has(item.referenceId!)) return false;
      if (ctx.reservations.some(r => r.placeId === item.referenceId)) issues.push(`PLACE_BOOKED: ${item.referenceId} is already represented by its booking.`);
      used.set(item.referenceId!, `${day.date} at ${item.start}`);
    } else if (item.kind === "reservation") {
      const booking = ctx.reservations.find(r => r.id === item.referenceId);
      if (!booking || bookings.has(booking.id)) issues.push("BOOKING_ID: Include each supplied booking once.");
      if (booking && (datePart(booking.start) !== day.date || timePart(booking.start) !== item.start)) issues.push("BOOKING_TIME: Booking dates and times cannot move.");
      bookings.add(item.referenceId!);
    } else if (item.referenceId !== null) issues.push("SUGGESTION: Flexible blocks must have no saved-place ID.");
    else if (["meal", "suggestion"].includes(item.kind) && (!item.title || !item.area || !item.reason || !item.durationMinutes))
      issues.push("SUGGESTION: Meals and suggestions need a title, area, reason, duration and no saved-place ID.");
    return true;
  });
  if (ctx.reservations.some(r => !bookings.has(r.id))) issues.push("BOOKING_MISSING: Include every supplied booking exactly once.");
  if (issues.length) throw new ProposalError(issues.slice(0, 20));
  return proposal;
}

interface Fit { index: number; start: number; score: number }
/** Search gaps, reserving both travel legs, including across provisional unlocated blocks. */
function fit(day: Day, stop: Stop, duration: number, ctx: PlannerContext, window?: [number, number]): Fit | null {
  if (day.stops.length >= 24) return null;
  const startStay = dayStartLocation(ctx.preferences.accommodations, day.date);
  const endStay = dayEndLocation(ctx.preferences.accommodations, day.date);
  const place = ctx.places.find(p => p.placeId === stop.placeId);
  let best: Fit | null = null;
  for (let index = 0; index <= day.stops.length; index++) {
    const before = day.stops[index - 1]; const after = day.stops[index];
    const previousLocation = day.stops.slice(0, index).reverse().find(s => s.location)?.location ?? startStay;
    const nextLocation = day.stops.slice(index).find(s => s.location)?.location ?? endStay;
    // Unknown meal/idea locations remain null in saved data; buffers are estimates, never verified routing.
    const inbound = travelMinutes(previousLocation, stop.location, ctx.preferences.transport);
    const outbound = travelMinutes(stop.location, nextLocation, ctx.preferences.transport);
    const bridge = travelMinutes(previousLocation, nextLocation, ctx.preferences.transport) ?? 15;
    const gapFrom = before ? toMinutes(before.end) : toMinutes(ctx.preferences.dayStart);
    const gapTo = after ? toMinutes(after.start) : toMinutes(ctx.preferences.dayEnd);
    if (!stop.location && gapFrom + duration + bridge + (stop.kind === "break" ? 0 : 30) > gapTo) continue;
    const from = Math.max(window?.[0] ?? 0, (before ? toMinutes(before.end) : toMinutes(ctx.preferences.dayStart)) + (stop.kind === "break" ? 0 : inbound ?? 15));
    const until = Math.min(window?.[1] ?? 1440, (after ? toMinutes(after.start) : toMinutes(ctx.preferences.dayEnd)) - (stop.kind === "break" ? bridge : outbound ?? 15));
    const starts = [from];
    // A matching hourly forecast can influence actual timing, without claiming a forecast for another area/date.
    if (place && isOutdoor(place.category)) for (let minute = Math.ceil(from / 60) * 60; minute + duration <= until; minute += 60) starts.push(minute);
    for (const earliest of starts) {
      const start = place ? earliestOpenStart(place.openingHours, day.date, earliest, duration) : earliest;
      if (start === null || start + duration > until || start + duration >= 1440) continue;
      const badWeather = place && isOutdoor(place.category) && indoorWeather(ctx, day.date, place.location, toLocalTime(start), toLocalTime(start + duration));
      const score = (inbound ?? 15) + (outbound ?? 15) + (start - from) * .2 + (badWeather ? 180 : 0) + index * .01;
      if (!best || score < best.score) best = { index, start, score };
    }
  }
  return best;
}
function insert(day: Day, stop: Stop, duration: number, at: Fit, ctx: PlannerContext) {
  const place = ctx.places.find(p => p.placeId === stop.placeId);
  day.stops.splice(at.index, 0, { ...stop, start: toLocalTime(at.start), end: toLocalTime(at.start + duration),
    ...(duration >= 15 && stop.kind !== "reservation" ? { plannedDurationMinutes: duration } : {}),
    hoursCheck: place ? checkHours(place.openingHours, day.date, at.start, at.start + duration) : stop.hoursCheck });
}
function idea(item: Item, ctx: PlannerContext): Stop {
  return { id: (ctx.newId ?? defaultStopId)(), kind: item.kind, placeId: null, reservationId: null,
    title: item.title ?? "Break", start: item.start, end: item.start, location: null, locked: false,
    travelMinutesBefore: null, hoursCheck: "unknown", sourceInspirationIds: [],
    suggestedArea: item.area, planningNote: item.reason, plannedDurationMinutes: item.durationMinutes ?? 30 };
}

function build(proposal: ItineraryProposal, ctx: PlannerContext, repair: boolean): PlanResult {
  const newId = ctx.newId ?? defaultStopId;
  const days: Day[] = proposal.days.map(d => ({ date: d.date, stops: ctx.reservations.filter(r => datePart(r.start) === d.date)
    .sort((a, b) => a.start.localeCompare(b.start)).map(r => reservationStop(r, ctx.places.find(p => p.placeId === r.placeId), newId())) }));
  let plan: PlanResult = { days, unscheduledPlaceIds: [], conflicts: [], validationStatus: "valid", assumptions: planAssumptions(ctx) };
  plan = recheck(plan, ctx);
  const blocked = plan.conflicts.filter(c => c.severity === "error" || c.code === "LOCKED_RESERVATION_UNREACHABLE");
  for (const day of days) for (const stop of day.stops) {
    if (stop.start < ctx.preferences.dayStart || stop.end > ctx.preferences.dayEnd)
      throw new ProposalError([`BOOKING_WINDOW: "${stop.title}" is outside your daily availability. Extend your daily times in Trip setup or change the booking; its saved time has not been moved.`]);
  }
  if (blocked.length) throw new ProposalError(blocked.map(c => `${c.code}: ${c.message} Keep the bookings unchanged in this draft; change a booking or daily availability in Trip setup before generating again.`));
  // Reserve lunch before fitting activities; a coverage-first repair can reclaim it for a long outing.
  if (!repair) for (const day of days) {
    const dining = ctx.places.some(p => /restaurant|food|dining/i.test(p.category ?? "") && !ctx.reservations.some(r => r.placeId === p.placeId));
    if (dining || day.stops.some(s => isDining(s, ctx) && s.start < "14:30" && s.end > "11:30")) continue;
    if (ctx.preferences.dayStart > "12:00" || ctx.preferences.dayEnd < "14:00") continue;
    const lunch = idea({ kind: "meal", referenceId: null, start: "12:00", durationMinutes: 60, title: "Lunch near the afternoon outing", area: ctx.destination?.slice(0, 160) ?? "Near the day's visits", reason: "Provisional lunch; venue, opening hours and travel need checking." }, ctx);
    const at = fit(day, lunch, 60, ctx, [12 * 60, 14 * 60]);
    if (at) insert(day, lunch, 60, at, ctx);
  }
  const proposed = new Map(proposal.days.flatMap((d, di) => d.stops.flatMap((s, si) => s.kind === "place" ? [[s.referenceId!, { item: s, day: di, order: si }] as const] : [])));
  const queue = ctx.places.filter(p => !ctx.reservations.some(r => r.placeId === p.placeId)).sort((a, b) =>
    Number(ctx.preferences.mustVisitPlaceIds.includes(b.placeId)) - Number(ctx.preferences.mustVisitPlaceIds.includes(a.placeId))
    || (proposed.get(a.placeId)?.day ?? 99) - (proposed.get(b.placeId)?.day ?? 99)
    || (proposed.get(a.placeId)?.order ?? 99) - (proposed.get(b.placeId)?.order ?? 99)
    || a.placeId.localeCompare(b.placeId));
  const unscheduled: string[] = [];
  for (const place of queue) {
    const suggestion = proposed.get(place.placeId);
    const proposedDuration = suggestion?.item.durationMinutes ?? place.visitMinutes;
    const duration = repair ? Math.max(proposedDuration, place.visitMinutes) : proposedDuration;
    const stop = placeStop({ ...place, visitMinutes: duration }, newId(), days[0]!.date, 0);
    const options = days.flatMap((day, index) => {
      const dining = /restaurant|food|dining/i.test(place.category ?? "");
      const mealWindow: [number, number] | undefined = dining && ctx.preferences.dayStart <= "12:00" && ctx.preferences.dayEnd >= "14:00" ? [11 * 60 + 30, 14 * 60 + 30] : undefined;
      const at = (mealWindow ? fit(day, stop, duration, ctx, mealWindow) : null) ?? fit(day, stop, duration, ctx);
      return at ? [{ day, at, score: at.score + (suggestion && index !== suggestion.day ? 45 : 0) }] : [];
    }).sort((a, b) => a.score - b.score);
    const best = options[0];
    if (best) insert(best.day, stop, duration, best.at, ctx); else unscheduled.push(place.placeId);
  }
  plan = ensureLunch(recheck({ ...plan, days, unscheduledPlaceIds: unscheduled }, ctx), ctx);
  // Rest and extra ideas use only genuine remaining space. They cannot replace saved visits.
  for (const proposedDay of proposal.days) {
    const day = plan.days.find(d => d.date === proposedDay.date)!;
    for (const item of proposedDay.stops.filter(s => s.kind === "break" || s.kind === "meal" || s.kind === "suggestion")) {
      const duration = item.durationMinutes ?? ctx.preferences.breakMinutes;
      if (duration <= 0) continue;
      if (item.kind === "suggestion" && (day.stops.filter(s => s.kind === "suggestion").length >= 2
        || ctx.places.some(p => p.title.trim().toLowerCase() === item.title?.trim().toLowerCase()))) continue;
      let window: [number, number] | undefined;
      if (item.kind === "meal") {
        // Treat approximate model meal times as a meal-period hint, never an exact start.
        window = /breakfast/i.test(item.title ?? "") ? [6 * 60, 11 * 60] : /dinner/i.test(item.title ?? "") ? [17 * 60, 23 * 60] : [11 * 60 + 30, 14 * 60 + 30];
        if (day.stops.some(s => isDining(s, ctx) && toMinutes(s.start) < window![1] && toMinutes(s.end) > window![0])) continue;
      }
      const stop = item.kind === "break" ? breakStop(newId(), 0, duration) : idea(item, ctx);
      const at = fit(day, stop, duration, ctx, window);
      if (at) insert(day, stop, duration, at, ctx);
    }
  }
  plan = recheck(plan, ctx);
  const errors = plan.conflicts.filter(c => c.severity === "error" || c.code === "LOCKED_RESERVATION_UNREACHABLE");
  if (errors.length) throw new ProposalError(errors.map(c => `${c.code}: ${c.message}`));
  plan.assumptions.push("Flexible times are calculated by the server using opening windows and estimated travel, including return to the day's accommodation when known. Unknown travel uses provisional buffers and remains unchecked. Saved visits take priority over extra ideas; this heuristic is not an optimal-route guarantee.");
  if (proposal.seasonalAdvice) plan.assumptions.push(`Seasonal guidance (general advice, not a forecast): ${proposal.seasonalAdvice}`);
  return assessQuality(plan, ctx, repair);
}

/** Two bounded deterministic candidates; the second targets coverage/durations without changing bookings. */
export function scheduleProposal(raw: unknown, ctx: PlannerContext): PlanResult {
  const proposal = readProposal(raw, ctx);
  const first = build(proposal, ctx, false);
  if (!first.quality!.issues.some(i => ["OMITTED_PLACE", "RUSHED_VISIT", "MEAL_WINDOW", "EXCESS_TRAVEL", "WEATHER"].includes(i.code))) return first;
  try {
    const repaired = build(proposal, ctx, true);
    return betterPlan(repaired, first, ctx) ? repaired : first;
  } catch (error) {
    if (error instanceof ProposalError) return first;
    throw error;
  }
}
