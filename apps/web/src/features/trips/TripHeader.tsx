"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { tripDateLabel, tripLength, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// One header for every page of a trip (design "Sky 3 · 05 Trip header"): back link, trip name and dates,
// four sections and Share. Every section uses the same compact bar, so moving between Itinerary, Map,
// Places and Details never changes the height of the workspace below it.

const SECTIONS: Array<{ segment: string; label: string; icon: IconName; also?: string[] }> = [
  { segment: "itinerary", label: "Itinerary", icon: "magazine", also: ["timeline"] },
  { segment: "map", label: "Map", icon: "map" },
  { segment: "places", label: "Places", icon: "pin" },
  { segment: "setup", label: "Details", icon: "calendar" },
];

export function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
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
    </div>
  );

  return (
    <div className="trip-header is-compact">
      <ErrorBanner error={error} />
      <div className="trip-header-bar">
        <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={16} /> My trips</Link>
        <span className="trip-header-title">
          <strong>{trip?.title ?? " "}</strong>
          {trip && (
            <small>
              {tripDateLabel(trip)}{tripLength(trip) ? ` · ${tripLength(trip)} days` : ""} · {trip.destination}
              <span className="trip-header-status">{tripStatusLabel(trip)}</span>
            </small>
          )}
        </span>
        {tabs}
        {actions}
      </div>
    </div>
  );
}
