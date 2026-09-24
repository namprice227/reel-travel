import { createDiscovery } from "@reel/ai/itinerary-discovery";
import {
  ensureLunch,
  nearbySlots,
  fitNearby,
  type PlannerContext,
  type PlanResult,
} from "@reel/planner";
import { stayOn, type LatLng } from "@reel/contracts";
import { config } from "./config";

/** Optional retrieval never turns a usable draft into a failed generation. No calls in fake/offline mode. */
export async function prepareDiscovery(ctx: PlannerContext) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (
    config.placesProvider !== "google" ||
    !key ||
    process.env.ITINERARY_NEARBY_ENABLED === "false"
  )
    return { ctx, enrich: async (plan: PlanResult) => plan };
  const provider = createDiscovery({
    apiKey: key,
    weatherApiKey: process.env.OPEN_METEO_API_KEY,
  });
  let center: LatLng | undefined = ctx.places[0]?.location;
  if (
    !center &&
    !ctx.preferences.accommodations.some((s) => s.location) &&
    ctx.destination
  )
    center = await provider.center(ctx.destination).catch(() => undefined);
  const locations = new Map<string, LatLng>();
  const dailyLocations = new Map<string, string>();
  for (
    let t = Date.parse(ctx.startDate + "T00:00:00Z");
    t <= Date.parse(ctx.endDate + "T00:00:00Z") && locations.size < 7;
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    const location =
      stayOn(ctx.preferences.accommodations, date)?.location ?? center;
    if (location) {
      const key = `${location.lat},${location.lng}`;
      locations.set(key, location);
      dailyLocations.set(date, key);
    }
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: ctx.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const withinForecast =
    Date.parse(ctx.startDate) <= Date.parse(today) + 15 * 86400000 &&
    ctx.endDate >= today;
  const weather =
    withinForecast && process.env.ITINERARY_WEATHER_PROVIDER !== "none"
      ? (
          await Promise.all(
            [...locations.values()].map((location) =>
              provider.weather(location, ctx.timezone ?? "UTC").catch(() => []),
            ),
          )
        )
          .flat()
          .filter(
            (w) =>
              w.date >= ctx.startDate &&
              w.date <= ctx.endDate &&
              dailyLocations.get(w.date) ===
                `${w.location.lat},${w.location.lng}`,
          )
      : [];
  const prepared = { ...ctx, weather };
  return {
    ctx: prepared,
    async enrich(original: PlanResult): Promise<PlanResult> {
      let plan = ensureLunch(original, prepared);
      // Bounded paid work: up to two meal and two suggested-activity searches per day, at most 20 per generation.
      const slots = nearbySlots(plan, prepared, center).slice(0, 20);
      const results = await Promise.all(
        slots.map((slot) => provider.nearby(slot).catch(() => [])),
      );
      const used = new Set(
        ctx.places
          .map((p) => p.providerPlaceId)
          .filter((id): id is string => !!id),
      );
      for (let i = 0; i < slots.length; i++)
        plan = fitNearby(plan, prepared, slots[i]!, results[i]!, used);
      const fitted = plan.days
        .flatMap((d) => d.stops)
        .filter((s) => s.suggestedVenue).length;
      plan.assumptions.push(
        `Nearby discovery: ${fitted} provider-listed venue${fitted === 1 ? "" : "s"} fitted to time windows and regular hours. Travel is estimated where locations are known; missing locations remain unchecked. Other ideas remain provisional. Special hours, dietary suitability, prices and seating require checking.`,
      );
      plan.assumptions.push(
        weather.length
          ? `Weather outlook: Open-Meteo forecast retrieved ${weather[0]!.fetchedAt}; available dates ${[...new Set(weather.map((w) => w.date))].sort().join(", ")} near the planning locations. Rain and temperature guide indoor options; forecasts can change. Other dates or areas use seasonal guidance only.`
          : "Weather outlook: No dated forecast available for this trip. Seasonal guidance is general climate advice, not a prediction; check the forecast closer to departure.",
      );
      return plan;
    },
  };
}
