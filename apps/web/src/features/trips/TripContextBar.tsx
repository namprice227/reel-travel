"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { ErrorBanner } from "@/components/ui";
import { tripDays } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

const SECTIONS: Array<{ segment: string; label: string; icon: IconName; also?: string[] }> = [
  { segment: "itinerary", label: "Itinerary", icon: "magazine", also: ["timeline", "map"] },
  { segment: "places", label: "Places", icon: "pin" },
  { segment: "setup", label: "Trip details", icon: "calendar" },
  { segment: "share", label: "Share", icon: "share" },
];

/** Itinerary views render their own header with these links, so the bar is hidden there. */
const OWN_HEADER = new Set(["itinerary", "timeline", "map"]);

/** Slim trip context bar for trip pages that don't have the itinerary header (details, places, share). */
export function TripContextBar({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[3] ?? "itinerary";
  const hidden = OWN_HEADER.has(segment);
  const { data, error } = useApi("trips.get", hidden ? null : { params: { tripId } });
  if (hidden) return null;
  const trip = data?.trip;

  return (
    <div className="trip-context">
      <ErrorBanner error={error} />
      <div className="trip-context-bar">
        <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={18} /> My trips</Link>
        <span className="trip-context-divider" aria-hidden="true" />
        <span className="trip-context-trip">
          <CoverArt seed={trip?.destination ?? tripId} className="trip-context-thumb" showLabel={false} />
          <span>{trip ? <>{trip.title} <span className="muted">· {tripDays(trip.startDate, trip.endDate)} days</span></> : " "}</span>
        </span>
        <TripSectionLinks tripId={tripId} segment={segment} />
      </div>
    </div>
  );
}

/** Links between a trip's sections; shared with the itinerary header. */
export function TripSectionLinks({ tripId, segment, className = "trip-sections" }: { tripId: string; segment: string; className?: string }) {
  return (
    <nav className={className} aria-label="Trip sections">
      {SECTIONS.map((section) => {
        const active = segment === section.segment || section.also?.includes(segment);
        return (
          <Link
            key={section.segment}
            href={`/my-trip/${tripId}/${section.segment}`}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={section.icon} size={17} /> {section.label}
          </Link>
        );
      })}
      <Link href={`/inspiration-library?trip=${tripId}`}>
        <Icon name="library" size={17} /> Saves
      </Link>
    </nav>
  );
}
