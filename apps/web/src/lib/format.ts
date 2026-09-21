import type { InspirationStatus, OpeningHours, PlaceStatus, ValidationStatus } from "@reel/contracts";
import type { Tone } from "@/components/ui";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-01" -> "Thu 1 Oct". Dates are calendar dates, so format in UTC to avoid shifting. */
export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const formatRange = (start: string, end: string) => `${formatDay(start)} – ${formatDay(end)}`;

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function describeHours(hours: OpeningHours): string {
  if (hours.status === "unknown") return "Hours unknown";
  if (hours.windows.length === 0) return "Closed every day";
  const byDay = DAY_NAMES.map((_, day) =>
    hours.windows
      .filter((w) => w.day === day)
      .map((w) => `${w.open}–${w.close}`)
      .join(", "),
  );
  const distinct = [...new Set(byDay.filter(Boolean))];
  if (distinct.length === 1) {
    const closed = DAY_NAMES.filter((_, day) => !byDay[day]);
    return closed.length ? `${distinct[0]}, closed ${closed.join(", ")}` : `${distinct[0]} daily`;
  }
  return DAY_NAMES.map((name, day) => `${name} ${byDay[day] || "closed"}`).join(" · ");
}

export const inspirationStatus: Record<InspirationStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  processing: { label: "Finding places…", tone: "info" },
  needs_confirmation: { label: "Review places", tone: "warning" },
  ready: { label: "Done", tone: "success" },
  needs_input: { label: "Needs details", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export const placeStatus: Record<PlaceStatus, { label: string; tone: Tone }> = {
  unverified: { label: "Unverified", tone: "warning" },
  pending: { label: "Confirm match", tone: "warning" },
  ambiguous: { label: "Choose branch", tone: "warning" },
  not_found: { label: "No match", tone: "danger" },
  confirmed: { label: "Confirmed", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const validationStatus: Record<ValidationStatus, { label: string; tone: Tone }> = {
  valid: { label: "All checks passed", tone: "success" },
  partially_checked: { label: "Partially checked", tone: "warning" },
  has_conflicts: { label: "Has conflicts", tone: "danger" },
};
