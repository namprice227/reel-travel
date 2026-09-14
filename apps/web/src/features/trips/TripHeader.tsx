"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorBanner } from "@/components/ui";
import { formatRange } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const TABS = [
  { segment: "inbox", label: "1. Inbox" },
  { segment: "places", label: "2. Places" },
  { segment: "setup", label: "3. Setup" },
  { segment: "itinerary", label: "4. Itinerary" },
  { segment: "share", label: "5. Share" },
];

export function TripHeader({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const { data, error } = useApi("trips.get", { params: { tripId } });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <ErrorBanner error={error} />
      <div>
        <h1>{data?.trip.title ?? " "}</h1>
        {data && (
          <p className="muted">
            {data.trip.destination} · {formatRange(data.trip.startDate, data.trip.endDate)} · {data.trip.timezone}
          </p>
        )}
      </div>
      <nav className="tabs">
        {TABS.map((tab) => {
          const href = `/trips/${tripId}/${tab.segment}`;
          return (
            <Link key={tab.segment} href={href} className={pathname === href ? "active" : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
