import type { PlanQuality, Stop } from "@reel/contracts";
import { earliestOpenStart } from "./hours";
import { indoorWeather } from "./nearby";
import { toMinutes } from "./time";
import type { PlannerContext, PlanResult } from "./types";

export const isDining = (stop: Stop, ctx: PlannerContext) => stop.kind === "meal"
  || /restaurant|food|dining|lunch|dinner/i.test(ctx.places.find(p => p.placeId === stop.placeId)?.category ?? "")
  || (stop.kind === "reservation" && /lunch|dinner|restaurant|dining/i.test(stop.title));
export const isOutdoor = (category: string | null | undefined) => /park|garden|beach|hiking|outdoor|zoo/.test(category ?? "");

/** Transparent diagnostics, not a learned quality estimate or a new validity gate. */
export function assessQuality(plan: PlanResult, ctx: PlannerContext, repairApplied = false): PlanResult {
  const issues: PlanQuality["issues"] = [];
  const scheduled = new Set(plan.days.flatMap(d => d.stops.flatMap(s => s.placeId ? [s.placeId] : [])));
  const savedPlacesScheduled = ctx.places.filter(p => scheduled.has(p.placeId)).length;
  for (const place of ctx.places.filter(p => !scheduled.has(p.placeId))) {
    const open = plan.days.some(d => {
      const start = earliestOpenStart(place.openingHours, d.date, toMinutes(ctx.preferences.dayStart), place.visitMinutes);
      return start !== null && start + place.visitMinutes <= toMinutes(ctx.preferences.dayEnd);
    });
    const priority = ctx.preferences.mustVisitPlaceIds.includes(place.placeId) ? "Priority place " : "";
    issues.push({ code: "OMITTED_PLACE", date: null, placeIds: [place.placeId],
      message: `${priority}"${place.title}" was not scheduled. ${open ? "Its visit and estimated travel did not fit the selected schedule around other stops and bookings." : "Its supplied visit duration does not fit the known opening windows and your daily availability on these dates."}`,
      alternatives: open
        ? [`Keep this plan and save "${place.title}" for another trip.`, `To include "${place.title}", replace a flexible outing or extend your dates/daily availability, then regenerate. Bookings stay fixed.`]
        : [`Check the opening hours for "${place.title}" or choose another date; keep the other visits meanwhile.`],
    });
  }
  for (const day of plan.days) {
    if (toMinutes(ctx.preferences.dayStart) <= 12 * 60 && toMinutes(ctx.preferences.dayEnd) >= 14 * 60
      && !day.stops.some(s => isDining(s, ctx) && toMinutes(s.start) < 14 * 60 + 30 && toMinutes(s.end) > 11 * 60 + 30)) {
      const outing = day.stops.find(s => toMinutes(s.start) < 14 * 60 && toMinutes(s.end) > 12 * 60);
      issues.push({ code: "MEAL_WINDOW", date: day.date, placeIds: [],
        message: `No separate lunch window fits around ${outing ? `"${outing.title}"` : "this day's activities"}.`,
        alternatives: ["Keep the outing and arrange a meal during it if the venue permits, or choose a later lunch.", "Move a flexible visit to another day or shorten it after checking the visit duration, then regenerate." ] });
    }
    const travel = day.stops.reduce((n, s) => n + (s.travelMinutesBefore ?? 0), 0);
    if (travel > Math.max(90, (toMinutes(ctx.preferences.dayEnd) - toMinutes(ctx.preferences.dayStart)) * .3))
      issues.push({ code: "EXCESS_TRAVEL", date: day.date, placeIds: [], message: `${travel} minutes of known estimated travel on this day; unknown legs are additional.`, alternatives: ["Keep the day trip and move a smaller flexible visit to another day, or choose a nearer outing."] });
    for (const stop of day.stops) {
      const place = ctx.places.find(p => p.placeId === stop.placeId);
      if (place && stop.kind === "place" && toMinutes(stop.end) - toMinutes(stop.start) < place.visitMinutes * .75)
        issues.push({ code: "RUSHED_VISIT", date: day.date, placeIds: [place.placeId], message: `"${place.title}" has substantially less time than its supplied typical visit estimate.`, alternatives: ["Allow its typical visit duration and move an optional stop if needed."] });
      if (place && isOutdoor(place.category) && indoorWeather(ctx, day.date, place.location, stop.start, stop.end))
        issues.push({ code: "WEATHER", date: day.date, placeIds: [place.placeId], message: `"${place.title}" overlaps a nearby dated forecast of rain or uncomfortable temperatures.`, alternatives: ["Keep the visit with weather preparation, or swap with an indoor activity in a better forecast window. Check the forecast again before departure."] });
    }
    const filler = day.stops.filter(s => s.kind === "suggestion");
    if (filler.length > 2) issues.push({ code: "FILLER", date: day.date, placeIds: [], message: "Several unconfirmed activities fill this day.", alternatives: ["Keep only the suggestions you like and leave the remaining time free."] });
  }
  const cap = ctx.preferences.budget === "low" ? 1 : ctx.preferences.budget === "medium" ? 2 : 4;
  const expensive = ctx.places.filter(p => scheduled.has(p.placeId) && p.priceLevel != null && p.priceLevel > cap);
  if (expensive.length) issues.push({ code: "PREFERENCES", date: null, placeIds: expensive.map(p => p.placeId), message: "Some saved visits have a provider price level above your budget preference; your chosen places were kept.", alternatives: ["Keep these priority visits and budget for them, or remove optional expensive places before regenerating."] });
  const interests = ctx.preferences.interests.map(s => s.toLowerCase()).filter(Boolean);
  const known = ctx.places.filter(p => scheduled.has(p.placeId) && p.category);
  if (interests.length && known.length && !known.some(p => interests.some(i => `${p.category} ${p.title}`.toLowerCase().includes(i))))
    issues.push({ code: "PREFERENCES", date: null, placeIds: [], message: "No clear text match between your interests and the known categories of scheduled places. This is only a coarse match, not a judgment of your choices.", alternatives: ["Keep your saved choices, or add a place matching your interests and regenerate."] });
  const noOutings = !ctx.places.length && !ctx.reservations.length
    && !plan.days.some(d => d.stops.some(s => s.kind === "suggestion"));
  if (noOutings) issues.push({ code: "FILLER", date: null, placeIds: [],
    message: "This trip contains only meals, breaks or free time; no outing has been suggested yet.",
    alternatives: ["Keep it as a free-time trip, or add one nearby activity matching your interests and weather. Verify suggested venues before relying on them."] });
  const coverage = ctx.places.length ? savedPlacesScheduled / ctx.places.length : 1;
  const penalty: Record<PlanQuality["issues"][number]["code"], number> = { OMITTED_PLACE: 0, MEAL_WINDOW: 8, EXCESS_TRAVEL: 8, RUSHED_VISIT: 8, PREFERENCES: 4, FILLER: 4, WEATHER: 8 };
  const score = Math.min(noOutings ? 70 : 100, Math.max(0, Math.round(100 - (1 - coverage) * 60 - issues.reduce((n, i) => n + penalty[i.code], 0) / Math.max(1, plan.days.length))));
  return { ...plan, quality: { score, savedPlacesScheduled, savedPlacesTotal: ctx.places.length, repairApplied, issues } };
}

/** Coverage wins over cosmetic scores. Repairs cannot improve scores by dropping priorities. */
export function betterPlan(candidate: PlanResult, current: PlanResult, ctx: PlannerContext): boolean {
  const priority = (p: PlanResult) => new Set(p.days.flatMap(d => d.stops.flatMap(s => s.placeId && ctx.preferences.mustVisitPlaceIds.includes(s.placeId) ? [s.placeId] : []))).size;
  return priority(candidate) !== priority(current) ? priority(candidate) > priority(current)
    : candidate.quality!.savedPlacesScheduled !== current.quality!.savedPlacesScheduled
      ? candidate.quality!.savedPlacesScheduled > current.quality!.savedPlacesScheduled
      : candidate.quality!.score > current.quality!.score;
}
