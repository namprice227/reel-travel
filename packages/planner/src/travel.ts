import type { LatLng, TripPreferences } from "@reel/contracts";

type Mode = TripPreferences["transport"];

const SPEEDS: Record<Mode, { kmh: number; overheadMinutes: number }> = {
  walk: { kmh: 4.5, overheadMinutes: 0 },
  transit: { kmh: 20, overheadMinutes: 10 },
  car: { kmh: 25, overheadMinutes: 5 },
};

/** Straight-line distances understate real routes. */
const DETOUR_FACTOR = 1.3;

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Estimate, rounded up to 5 minutes. Missing endpoints cannot establish a travel time. */
export function travelMinutes(from: LatLng | null, to: LatLng | null, mode: Mode): number | null {
  if (!from || !to) return null;
  const km = distanceKm(from, to);
  if (km < 0.05) return 0;
  const speed = mode === "transit" && km < 1 ? SPEEDS.walk : SPEEDS[mode];
  const minutes = ((km * DETOUR_FACTOR) / speed.kmh) * 60 + speed.overheadMinutes;
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

export function travelAssumption(mode: Mode): string {
  return `Travel times are estimates from straight-line distance ×${DETOUR_FACTOR} at ${SPEEDS[mode].kmh} km/h (${mode}), not live routes.`;
}
