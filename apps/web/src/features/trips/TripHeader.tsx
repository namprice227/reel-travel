"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorBanner } from "@/components/ui";
import { formatRange } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const TABS = [
  { segment: "inbox", label: "Inspiration" },
  { segment: "places", label: "Places" },
  { segment: "setup", label: "Trip details" },
  { segment: "itinerary", label: "Itinerary" },
  { segment: "share", label: "Share" },
];

export function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const { data, error } = useApi("trips.get", { params: { tripId } });

  return (
    <header className="trip-header stack">
      <ErrorBanner error={error} />
      <Link href="/trips" className="back-link">← My trips</Link>
      <div className="trip-title-row">
        <h1>{data?.trip.title ?? " "}</h1>
        {data && (
          <p className="muted">
            {data.trip.destination} · {formatRange(data.trip.startDate, data.trip.endDate)} · {data.trip.timezone}
          </p>
        )}
      </div>
      <nav className="tabs trip-tabs" aria-label="Trip sections">
        {TABS.map((tab) => {
          const href = `/trips/${tripId}/${tab.segment}`;
          return (
            <Link key={tab.segment} href={href} className={pathname === href ? "active" : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
