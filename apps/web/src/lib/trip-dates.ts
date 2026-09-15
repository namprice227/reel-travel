import type { Trip } from "@reel/contracts";

// Calendar-date helpers for trip cards and headers. Dates are calendar dates, so format in UTC.

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export const tripDays = (start: string, end: string) => Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000) + 1;

/** "2026-10-01","2026-10-04" -> "1 – 4 October"; spans months/years when needed. */
export function formatDateSpan(start: string, end: string): string {
  const a = toUtc(start);
  const b = toUtc(end);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    const full = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${full(a)} – ${full(b)}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
  return a.getTime() === b.getTime() ? `${a.getUTCDate()} ${month(a)}` : `${a.getUTCDate()} – ${b.getUTCDate()} ${month(b)}`;
}

/** "2026-10-01" -> "1 Oct". */
export const formatShortDate = (date: string) => toUtc(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export type TripGroup = "upcoming" | "draft" | "past";

/** Draft until an itinerary exists; past once the last day is before today (local calendar). */
export function tripGroup(trip: Pick<Trip, "endDate" | "currentItineraryVersion">, today = new Date()): TripGroup {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (trip.endDate < iso) return "past";
  return trip.currentItineraryVersion ? "upcoming" : "draft";
}
