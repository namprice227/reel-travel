import type { Day, LatLng, Stop } from "@reel/contracts";
import { earliestOpenStart } from "./hours";
import { retimeDay } from "./retime";
import { breakStop, placeStop, reservationStop } from "./stops";
import { datePart, datesBetween, toMinutes } from "./time";
import { travelAssumption, travelMinutes } from "./travel";
import { defaultStopId, type PlannablePlace, type PlannerContext, type PlanResult } from "./types";
import { validatePlan } from "./validate";

/** Place stops per day (bookings and breaks not counted). */
export const PACE_CAPACITY = { relaxed: 3, balanced: 4, packed: 6 } as const;
const BREAK_NOT_BEFORE = 12 * 60;
const PREFERRED_MAX_WAIT_MINUTES = 90;

/**
 * Deterministic greedy heuristic: keep bookings fixed and fill feasible gaps, preferring short
 * waits, must-visits, low travel and provider-backed budget/category matches. No external I/O.
 */
export function generatePlan(ctx: PlannerContext): PlanResult {
  const newId = ctx.newId ?? defaultStopId;
  const prefs = ctx.preferences;
  const placesById = new Map(ctx.places.map((p) => [p.placeId, p]));
  const booked = new Set(ctx.reservations.flatMap((r) => (r.placeId ? [r.placeId] : [])));
  const mustVisit = new Set(prefs.mustVisitPlaceIds);
  const queue = ctx.places.filter((p) => !booked.has(p.placeId));
  const capacity = PACE_CAPACITY[prefs.pace];

  const days: Day[] = datesBetween(ctx.startDate, ctx.endDate).map((date) => {
    const bookings = ctx.reservations
      .filter((r) => datePart(r.start) === date)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((r) => reservationStop(r, r.placeId ? placesById.get(r.placeId) : undefined, newId()));
    const stops: Stop[] = [];
    let cursor = toMinutes(prefs.dayStart);
    let here: LatLng | null = prefs.accommodation?.location ?? null;
    let placed = 0;
    let breakDone = prefs.breakMinutes === 0;

    for (;;) {
      const nextBooking = bookings[0];
      const limit = nextBooking ? toMinutes(nextBooking.start) : toMinutes(prefs.dayEnd);
      const moreToDo = (placed < capacity && queue.length > 0) || nextBooking !== undefined;

      if (!breakDone && placed > 0 && moreToDo && cursor >= BREAK_NOT_BEFORE && cursor + prefs.breakMinutes <= limit) {
        stops.push(breakStop(newId(), cursor, prefs.breakMinutes));
        cursor += prefs.breakMinutes;
        breakDone = true;
        continue;
      }

      const pick = placed < capacity ? pickNext(queue, mustVisit, { date, cursor, here, limit, nextBooking, ctx }) : null;
      if (pick) {
        queue.splice(queue.indexOf(pick.place), 1);
        stops.push(placeStop(pick.place, newId(), date, pick.start));
        cursor = pick.start + pick.place.visitMinutes;
        here = pick.place.location;
        placed += 1;
        continue;
      }

      if (nextBooking) {
        bookings.shift();
        stops.push(nextBooking);
        cursor = Math.max(cursor, toMinutes(nextBooking.end));
        here = nextBooking.location ?? here;
        continue;
      }
      break;
    }

    return retimeDay({ date, stops }, ctx);
  });

  const unscheduledPlaceIds = queue.map((p) => p.placeId);
  return { days, unscheduledPlaceIds, ...validatePlan(days, unscheduledPlaceIds, ctx), assumptions: planAssumptions(ctx) };
}

export function planAssumptions(ctx: PlannerContext): string[] {
  return [
    travelAssumption(ctx.preferences.transport),
    "Visit lengths come from the place provider, or 60 minutes when unknown.",
    "Opening hours are checked only where the provider supplied them; unknown hours are flagged.",
    "Budget is a soft preference for provider price levels, not a spending cap; unknown prices are not treated as free.",
    "Interests match provider category words; unrecognised interests and missing categories do not affect ranking.",
  ];
}

function pickNext(
  queue: PlannablePlace[],
  mustVisit: Set<string>,
  s: { date: string; cursor: number; here: LatLng | null; limit: number; nextBooking: Stop | undefined; ctx: PlannerContext },
): { place: PlannablePlace; start: number } | null {
  const mode = s.ctx.preferences.transport;
  const candidates: { place: PlannablePlace; start: number; wait: number; score: number }[] = [];
  for (const place of queue) {
    const travel = travelMinutes(s.here, place.location, mode);
    const arrival = s.cursor + travel;
    const start = earliestOpenStart(place.openingHours, s.date, arrival, place.visitMinutes);
    if (start === null) continue;
    const onward = s.nextBooking ? travelMinutes(place.location, s.nextBooking.location, mode) : 0;
    if (start + place.visitMinutes + onward > s.limit) continue;
    const wait = start - arrival;
    candidates.push({ place, start, wait, score: travel + wait + preferencePenalty(place, s.ctx) });
  }
  const withoutLongWait = candidates.filter((candidate) => candidate.wait <= PREFERRED_MAX_WAIT_MINUTES);
  const pool = withoutLongWait.length ? withoutLongWait : candidates;
  pool.sort((a, b) => Number(mustVisit.has(b.place.placeId)) - Number(mustVisit.has(a.place.placeId))
    || a.score - b.score || a.start - b.start || a.place.placeId.localeCompare(b.place.placeId));
  return pool[0] ?? null;
}

/** Minutes-equivalent penalties, deliberately soft: feasibility and must-visits take precedence. */
function preferencePenalty(place: PlannablePlace, ctx: PlannerContext): number {
  const { budget, interests } = ctx.preferences;
  const preferredMax = budget === "low" ? 1 : budget === "medium" ? 2 : 4;
  const pricePenalty = budget && place.priceLevel != null ? Math.max(0, place.priceLevel - preferredMax) * 30 : 0;
  const words = (value: string) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const categoryWords = new Set(words(place.category ?? ""));
  const matches = interests.some((interest) => words(interest).some((word) => categoryWords.has(word)));
  return pricePenalty - (matches ? 20 : 0);
}
