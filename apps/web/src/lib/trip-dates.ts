import type { Trip } from "@reel/contracts";

// Calendar-date helpers for trip cards and headers. Dates are calendar dates, so format in UTC.

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const DAY_MS = 86_400_000;

export const tripDays = (start: string, end: string) => Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / DAY_MS) + 1;

/** Today's local calendar date as "YYYY-MM-DD". */
export function todayIso(today = new Date(), timezone?: string): string {
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(today);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/** "2026-10-31", 1 -> "2026-11-01". */
export const addDays = (date: string, days: number) => new Date(toUtc(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to` (both calendar dates); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);

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

export type TripGroup = "current" | "upcoming" | "draft" | "past";

type TripTiming = Pick<Trip, "startDate" | "endDate" | "currentItineraryVersion"> & Partial<Pick<Trip, "timezone">>;

/** Current while today falls within its dates; past once the last day is over; otherwise draft until an itinerary exists. Undated trips are drafts. */
export function tripGroup(trip: TripTiming, today = new Date()): TripGroup {
  if (!trip.startDate || !trip.endDate) return "draft";
  const iso = todayIso(today, trip.timezone ?? undefined);
  if (trip.endDate < iso) return "past";
  if (trip.startDate <= iso) return "current";
  return trip.currentItineraryVersion ? "upcoming" : "draft";
}

/** Sort key for trip lists: undated drafts come after every dated trip. */
export const startKey = (trip: Pick<Trip, "startDate">) => trip.startDate ?? "9999-12-31";

/** "1 – 4 October", or "Dates not set" for a draft trip created from a source. */
export const tripDateLabel = (trip: Pick<Trip, "startDate" | "endDate">) =>
  trip.startDate && trip.endDate ? formatDateSpan(trip.startDate, trip.endDate) : "Dates not set";

/** Days in the trip; for an undated draft, the source's stated length when known. */
export const tripLength = (trip: Pick<Trip, "startDate" | "endDate"> & Partial<Pick<Trip, "draft">>) =>
  trip.startDate && trip.endDate ? tripDays(trip.startDate, trip.endDate) : trip.draft?.tripDays ?? null;

/** Short status line: "Day 2 of 4", "In 22 days", "Tomorrow", "Draft", "Past". */
export function tripStatusLabel(trip: TripTiming, today = new Date()): string {
  if (!trip.startDate || !trip.endDate) return "Draft · add dates";
  const group = tripGroup(trip, today);
  const iso = todayIso(today, trip.timezone ?? undefined);
  if (group === "past") return "Past";
  if (group === "current") return `Day ${daysBetween(trip.startDate, iso) + 1} of ${tripDays(trip.startDate, trip.endDate)}`;
  const days = daysBetween(iso, trip.startDate);
  const when = days === 1 ? "Tomorrow" : `In ${days} days`;
  return group === "draft" ? `Draft · starts ${when.toLowerCase()}` : when;
}
