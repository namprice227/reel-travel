import { stayOn, type LatLng, type SuggestedVenue } from "@reel/contracts";
import { checkHours, earliestOpenStart } from "./hours";
import { distanceKm, travelMinutes } from "./travel";
import { toLocalTime, toMinutes } from "./time";
import { validatePlan } from "./validate";
import { defaultStopId, type PlannerContext, type PlanResult } from "./types";

export interface NearbyVenue {
  name: string;
  location: LatLng;
  address: string;
  facts: SuggestedVenue;
  types: string[];
}
export interface NearbySlot {
  date: string;
  stopId: string;
  anchor: LatLng;
  kind: "meal" | "suggestion";
  start: string;
  end: string;
  radiusMeters: number;
  query: string;
  preferIndoor: boolean;
}
const indoorTypes = new Set([
  "museum",
  "art_gallery",
  "aquarium",
  "shopping_mall",
  "library",
  "movie_theater",
  "restaurant",
  "cafe",
]);
const outdoorTypes = new Set([
  "park",
  "national_park",
  "hiking_area",
  "beach",
  "garden",
  "botanical_garden",
  "zoo",
]);

/** Forecast must cover the slot's date, hours and nearby area; no forecast means unknown, not good weather. */
export function indoorWeather(
  ctx: PlannerContext,
  date: string,
  anchor: LatLng,
  start: string,
  end: string,
): boolean {
  const day = ctx.weather?.find(
    (w) => w.date === date && distanceKm(w.location, anchor) <= 25,
  );
  return !!day?.hours.some(
    (h) =>
      h.time.slice(0, 2) >= start.slice(0, 2) &&
      h.time < end &&
      ((h.precipitationProbability ?? 0) >= 60 ||
        (h.apparentTemperature != null &&
          (h.apparentTemperature >= 32 || h.apparentTemperature <= 0)) ||
        (h.weatherCode != null && h.weatherCode >= 51)),
  );
}

/** Insert a provisional lunch only into genuine free time, never displace a saved visit or booking. */
export function ensureLunch(plan: PlanResult, ctx: PlannerContext): PlanResult {
  const result = structuredClone(plan);
  for (const day of result.days) {
    if (
      toMinutes(ctx.preferences.dayStart) > 13 * 60 ||
      toMinutes(ctx.preferences.dayEnd) < 13 * 60
    )
      continue;
    const meal = day.stops.some((s) => {
      const overlaps =
        toMinutes(s.start) < 14 * 60 && toMinutes(s.end) > 11 * 60;
      const category =
        ctx.places.find((p) => p.placeId === s.placeId)?.category ?? "";
      return (
        overlaps &&
        (s.kind === "meal" ||
          /restaurant|cafe|food|lunch|dining/i.test(category) ||
          (s.kind === "reservation" &&
            /lunch|dining|restaurant/i.test(s.title)))
      );
    });
    if (meal) continue;
    // A break may be rest for accessibility reasons, so do not replace it with lunch.
    const gaps = day.stops.map((s, i) => ({
      index: i,
      from: i
        ? toMinutes(day.stops[i - 1]!.end)
        : toMinutes(ctx.preferences.dayStart),
      to: toMinutes(s.start),
    }));
    gaps.push({
      index: day.stops.length,
      from: day.stops.length
        ? toMinutes(day.stops.at(-1)!.end)
        : toMinutes(ctx.preferences.dayStart),
      to: toMinutes(ctx.preferences.dayEnd),
    });
    const gap = gaps
      .map((g) => ({
        ...g,
        // Reserve the known journey toward the afternoon outing, even while lunch is unlocated.
        start: Math.max(11 * 60 + 30, g.from + 10 + (travelMinutes(
          day.stops.slice(0, g.index).reverse().find(s => s.location)?.location ?? stayOn(ctx.preferences.accommodations, day.date)?.location ?? null,
          day.stops.slice(g.index).find(s => s.location)?.location ?? stayOn(ctx.preferences.accommodations, day.date)?.location ?? null,
          ctx.preferences.transport,
        ) ?? 15)),
        end: Math.min(14 * 60, g.to - 10),
      }))
      .filter((g) => g.end - g.start >= 60)
      .sort(
        (a, b) => Math.abs(a.start - 12 * 60) - Math.abs(b.start - 12 * 60),
      )[0];
    if (!gap || day.stops.length >= 24) continue;
    day.stops.splice(gap.index, 0, {
      id: (ctx.newId ?? defaultStopId)(),
      kind: "meal",
      title: "Lunch near the afternoon outing",
      placeId: null,
      reservationId: null,
      location: null,
      start: toLocalTime(gap.start),
      end: toLocalTime(Math.min(gap.end, gap.start + 90)),
      locked: false,
      travelMinutesBefore: null,
      hoursCheck: "unknown",
      sourceInspirationIds: [],
      plannedDurationMinutes: Math.min(90, gap.end - gap.start),
      suggestedArea: ctx.destination?.slice(0, 160) ?? "Nearby",
      planningNote:
        "Provisional lunch window; a venue must fit the travel and opening-hour checks.",
    });
  }
  const checked = recheck(result, ctx);
  return checked.conflicts.some((c) => c.severity === "error") ? plan : checked;
}

/** Search near the next outing, then previous visit, then that day's stay; never use an AI-invented coordinate. */
export function nearbySlots(
  plan: PlanResult,
  ctx: PlannerContext,
  destinationCenter?: LatLng,
): NearbySlot[] {
  return plan.days.flatMap((day) => {
    const slots = day.stops.flatMap((stop, index): NearbySlot[] => {
      if (!["meal", "suggestion"].includes(stop.kind) || stop.suggestedVenue)
        return [];
      const next = day.stops.slice(index + 1).find((s) => s.location)?.location;
      const previous = day.stops
        .slice(0, index)
        .reverse()
        .find((s) => s.location)?.location;
      const anchor =
        next ??
        previous ??
        stayOn(ctx.preferences.accommodations, day.date)?.location ??
        destinationCenter;
      if (!anchor) return [];
      const preferIndoor = indoorWeather(
        ctx,
        day.date,
        anchor,
        stop.start,
        stop.end,
      );
      const interests = ctx.preferences.interests.join(" ").toLowerCase();
      const food =
        interests
          .match(
            /vegetarian|vegan|halal|seafood|ramen|sushi|italian|japanese|indian|thai|korean|chinese|local food/g,
          )
          ?.slice(0, 2)
          .join(" ") ?? "";
      let query: string;
      if (stop.kind === "meal") query = `${food} restaurants`.trim();
      else if (/art|gallery/.test(interests)) query = "art galleries";
      else if (/history|culture|museum/.test(interests)) query = "museums";
      else if (/shopping/.test(interests)) query = "shopping malls";
      else if (/nature|garden|park|outdoor/.test(interests) && !preferIndoor)
        query = "parks gardens";
      else
        query = preferIndoor
          ? "museums indoor attractions"
          : "visitor attractions";
      return [
        {
          date: day.date,
          stopId: stop.id,
          anchor,
          kind: stop.kind as NearbySlot["kind"],
          start: stop.start,
          end: stop.end,
          radiusMeters:
            stop.kind === "meal"
              ? 1000
              : ctx.preferences.transport === "walk"
                ? 1500
                : 3000,
          query,
          preferIndoor,
        },
      ];
    });
    // Bound paid work to two searches/day, prioritizing lunch over optional filler.
    return slots
      .sort(
        (a, b) =>
          Number(b.kind === "meal" && b.start >= "11:00" && b.start < "14:00") -
            Number(
              a.kind === "meal" && a.start >= "11:00" && a.start < "14:00",
            ) ||
          Number(b.kind === "suggestion") - Number(a.kind === "suggestion"),
      )
      .slice(0, 2);
  });
}

export function recheck(plan: PlanResult, ctx: PlannerContext): PlanResult {
  const days = plan.days.map((day) => {
    let here =
      stayOn(ctx.preferences.accommodations, day.date)?.location ?? null;
    return {
      ...day,
      stops: day.stops.map((s) => {
        const travel =
          s.kind === "break"
            ? 0
            : travelMinutes(here, s.location, ctx.preferences.transport);
        if (s.kind !== "break") here = s.location;
        return { ...s, travelMinutesBefore: travel };
      }),
    };
  });
  return {
    ...plan,
    days,
    ...validatePlan(days, plan.unscheduledPlaceIds, ctx),
  };
}

/** A candidate must fit both sides of the real slot. Existing blocks and bookings never move. */
export function fitNearby(
  plan: PlanResult,
  ctx: PlannerContext,
  slot: NearbySlot,
  venues: NearbyVenue[],
  excluded: Set<string>,
): PlanResult {
  const day = plan.days.find((d) => d.date === slot.date)!;
  const index = day.stops.findIndex((s) => s.id === slot.stopId);
  if (index < 0) return plan;
  const current = day.stops[index]!;
  const before = day.stops
    .slice(0, index)
    .filter((s) => s.kind !== "break")
    .at(-1);
  const after = day.stops.slice(index + 1).find((s) => s.kind !== "break");
  // Do not ground a slot beside an unlocated booking. Generic neighbours may stay provisional with explicit unknown travel.
  if (
    (before &&
      !before.location &&
      before.kind !== "meal" &&
      before.kind !== "suggestion") ||
    (after &&
      !after.location &&
      after.kind !== "meal" &&
      after.kind !== "suggestion")
  )
    return plan;
  const origin =
    before?.location ??
    stayOn(ctx.preferences.accommodations, day.date)?.location ??
    null;
  const previousEnd = index
    ? toMinutes(day.stops[index - 1]!.end)
    : toMinutes(ctx.preferences.dayStart);
  const nextStart =
    index + 1 < day.stops.length
      ? toMinutes(day.stops[index + 1]!.start)
      : toMinutes(ctx.preferences.dayEnd);
  const duration = Math.min(
    toMinutes(current.end) - toMinutes(current.start),
    current.kind === "meal"
      ? ctx.preferences.pace === "relaxed"
        ? 60
        : 45
      : 60,
  );
  const cap =
    ctx.preferences.budget === "low"
      ? 1
      : ctx.preferences.budget === "medium"
        ? 2
        : 4;
  const ranked = venues
    .filter(
      (v) =>
        !excluded.has(v.facts.providerPlaceId) &&
        distanceKm(slot.anchor, v.location) * 1000 <= slot.radiusMeters &&
        (v.facts.priceLevel === null || v.facts.priceLevel <= cap) &&
        (slot.kind !== "meal" ||
          v.types.some(
            (t) =>
              t === "restaurant" || t.endsWith("_restaurant") || t === "cafe",
          )) &&
        (!slot.preferIndoor ||
          (!v.types.some((t) => outdoorTypes.has(t)) &&
            v.types.some(
              (t) => indoorTypes.has(t) || t.endsWith("_restaurant"),
            ))),
    )
    .sort(
      (a, b) =>
        Number(a.facts.priceLevel === null) -
          Number(b.facts.priceLevel === null) ||
        distanceKm(slot.anchor, a.location) -
          distanceKm(slot.anchor, b.location),
    );
  for (const venue of ranked) {
    const inbound = travelMinutes(
      origin,
      venue.location,
      ctx.preferences.transport,
    );
    const outbound = travelMinutes(venue.location,
      after ? after.location : stayOn(ctx.preferences.accommodations, day.date)?.location ?? null,
      ctx.preferences.transport);
    // Provisional neighbours retain unknown travel; later grounding revalidates the entire day.
    const earliest = Math.max(
      toMinutes(current.start),
      previousEnd + (inbound ?? 0) + (inbound === null ? 10 : 5),
    );
    const start = earliestOpenStart(
      venue.facts.openingHours,
      day.date,
      earliest,
      duration,
    );
    if (
      duration <= 0 ||
      start === null ||
      checkHours(
        venue.facts.openingHours,
        day.date,
        start,
        start + duration,
      ) !== "open"
    )
      continue;
    if (
      start + duration > toMinutes(current.end) ||
      start + duration + (outbound ?? 0) + 5 > nextStart
    )
      continue;
    const candidate = structuredClone(plan);
    candidate.days.find((d) => d.date === slot.date)!.stops[index] = {
      ...current,
      title: venue.name,
      location: venue.location,
      start: toLocalTime(start),
      end: toLocalTime(start + duration),
      plannedDurationMinutes: duration,
      hoursCheck: "open",
      suggestedArea: venue.address.slice(0, 160),
      suggestedVenue: venue.facts,
      planningNote:
        `Provider-listed option near ${after ? "the next outing" : "the day’s area"}, fitted to this time window; known travel legs estimated, missing locations remain unchecked. ${slot.preferIndoor ? "Indoor-type option preferred for the forecast. " : ""}${venue.facts.priceLevel === null ? "Price unavailable. " : ""}Check special hours, seating and dietary requirements; not a booking.`.slice(
          0,
          500,
        ),
    };
    const checked = recheck(candidate, ctx);
    if (
      checked.conflicts.some(
        (c) =>
          c.severity === "error" || c.code === "LOCKED_RESERVATION_UNREACHABLE",
      )
    )
      continue;
    excluded.add(venue.facts.providerPlaceId);
    return checked;
  }
  return plan;
}
