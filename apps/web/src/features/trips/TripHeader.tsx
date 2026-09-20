"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { ErrorBanner } from "@/components/ui";
import { formatDateSpan, tripDays, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// One header for every page of a trip (design "Sky 3 · 05 Trip header"): back link, trip name and dates,
// four sections and Share. Itinerary and Map get the compact bar so the workspace keeps its height;
// Places, Details and Share get the cover banner.

const SECTIONS: Array<{ segment: string; label: string; icon: IconName; also?: string[] }> = [
  { segment: "itinerary", label: "Itinerary", icon: "magazine", also: ["timeline"] },
  { segment: "map", label: "Map", icon: "map" },
  { segment: "places", label: "Places", icon: "pin" },
  { segment: "setup", label: "Details", icon: "calendar" },
];
const COMPACT = new Set(["itinerary", "timeline", "map", "place"]);

export function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const segment = pathname.split("/")[3] ?? "itinerary";
  const { data, error } = useApi("trips.get", { params: { tripId } });
  const trip = data?.trip;
  const compact = COMPACT.has(segment);
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

  if (compact) {
    return (
      <div className="trip-header is-compact">
        <ErrorBanner error={error} />
        <div className="trip-header-bar">
          <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={16} /> My trips</Link>
          <span className="trip-header-title">
            <strong>{trip?.title ?? " "}</strong>
            {trip && <small>{formatDateSpan(trip.startDate, trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days</small>}
          </span>
          {tabs}
          {actions}
        </div>
      </div>
    );
  }

  return (
    <header className="trip-header">
      <ErrorBanner error={error} />
      <div className="trip-cover">
        {trip && <CoverArt seed={trip.destination} showLabel={false} />}
        <div className="trip-cover-shade" aria-hidden="true" />
        <div className="trip-cover-text">
          <div>
            <Link href="/my-trip" className="back-link on-cover"><Icon name="arrowLeft" size={16} /> My trips</Link>
            <h1>{trip?.title ?? " "}</h1>
            {trip && (
              <p>
                {formatDateSpan(trip.startDate, trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days · {trip.destination}
                <span className="trip-cover-status">{tripStatusLabel(trip)}</span>
              </p>
            )}
          </div>
          {actions}
        </div>
      </div>
      {tabs}
    </header>
  );
}
