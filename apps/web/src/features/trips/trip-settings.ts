// Trip settings open as a dialog over any trip page (`?settings=<section>`); there is no separate settings page.

export const SETTINGS_SECTIONS = [
  { id: "preferences", label: "Preferences" },
  { id: "bookings", label: "Fixed bookings" },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export const settingsSection = (value: string | null): SettingsSection | null =>
  value === "details" ? "preferences" : SETTINGS_SECTIONS.find((section) => section.id === value)?.id ?? null;

/** Link that opens trip settings from outside the trip area (trip cards, checklist). */
export const tripSettingsHref = (tripId: string, section: SettingsSection = "preferences") =>
  `/my-trip/${tripId}/itinerary?settings=${section}`;
