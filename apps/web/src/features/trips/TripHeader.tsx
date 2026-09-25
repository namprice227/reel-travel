"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { tripDateLabel, tripLength, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { settingsSection, type SettingsSection } from "./trip-settings";
import { TripSettingsDialog } from "./TripSettingsDialog";

// One header for every page of a trip (design "Sky 3 · 05 Trip header"): back link, trip name and dates,
// three sections, Share and the settings gear. Every section uses the same compact bar, so moving between
// Itinerary, Map and Places never changes the height of the workspace below it. Settings open as a dialog
// (`?settings=<section>`) over whichever section is showing.

const SECTIONS: Array<{ segment: string; label: string; icon: IconName; also?: string[] }> = [
  { segment: "itinerary", label: "Itinerary", icon: "magazine", also: ["timeline"] },
  { segment: "map", label: "Map", icon: "map" },
  { segment: "places", label: "Places", icon: "pin" },
];

export function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const settings = settingsSection(params.get("settings"));
  const setSettings = (section: SettingsSection | null) => {
    const query = new URLSearchParams(params.toString());
    if (section) query.set("settings", section); else query.delete("settings");
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const segment = pathname.split("/")[3] ?? "itinerary";
  const { data, error } = useApi("trips.get", { params: { tripId } });
  const trip = data?.trip;
  const day = params.get("day");
  const stop = params.get("stop");
  const context = new URLSearchParams();
  if (day) context.set("day", day);
  if (stop) context.set("stop", stop);
  const dayQuery = context.size ? `?${context}` : "";

  const tabs = (
    <nav className="trip-tabs" aria-label="Trip sections">
      {SECTIONS.map((section) => {
        const active = segment === section.segment || section.also?.includes(segment);
        const query = section.segment === "itinerary" || section.segment === "map" ? dayQuery : "";
        return (
          <Link
            key={section.segment}
            href={`/my-trip/${tripId}/${section.segment}${query}`}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={section.icon} size={17} /> {section.label}
          </Link>
        );
      })}
    </nav>
  );
  const actions = (
    <div className="trip-header-actions">
      <Link className="btn btn-small" href={`/my-trip/${tripId}/share`}><Icon name="share" size={16} /> Share</Link>
      <Link className="btn btn-small" href={`/inspiration-library?trip=${tripId}`}><Icon name="library" size={16} /> Saves</Link>
      <button type="button" className="icon-btn trip-settings-btn" aria-label="Trip settings" title="Trip settings" aria-haspopup="dialog" aria-expanded={settings !== null} onClick={() => setSettings("preferences")}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );

  return (
    <div className="trip-header is-compact">
      <ErrorBanner error={error} />
      <div className="trip-header-bar">
        <Link href="/my-trip" className="back-link" aria-label="Back to my trips"><Icon name="arrowLeft" size={16} /></Link>
        <span className="trip-header-title">
          <strong>{trip?.title ?? " "}</strong>
          {trip && (
            <small>
              {tripDateLabel(trip)}{tripLength(trip) ? ` · ${tripLength(trip)} days` : ""} · {trip.destination}
              {Boolean(trip.currentItineraryVersion) && <span className="trip-header-status">{tripStatusLabel(trip)}</span>}
            </small>
          )}
        </span>
        {tabs}
        {actions}
      </div>
      {settings && <TripSettingsDialog tripId={tripId} section={settings} onSectionChange={setSettings} onClose={() => setSettings(null)} />}
    </div>
  );
}
