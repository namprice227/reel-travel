"use client";

import { useState } from "react";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { ItineraryMap } from "@/features/itinerary/ItineraryMap";
import { TimelineView } from "@/features/itinerary/TimelineView";
import { MagazineView } from "@/features/magazine/MagazineView";
import { formatRange } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// F6 viewer page (UI: Member 1). Public; reads only the shared.get projection.

const VIEWS = ["magazine", "timeline", "map"] as const;

export function SharedTripPage({ token }: { token: string }) {
  const shared = useApi("shared.get", { params: { token } });
  const [view, setView] = useState<(typeof VIEWS)[number]>("magazine");

  if (shared.error?.code === "SHARE_REVOKED") {
    return <Empty title="This link was revoked">Ask the trip owner for a new link.</Empty>;
  }
  if (shared.error?.code === "NOT_FOUND") return <Empty title="Link not found" />;
  if (shared.error) return <ErrorBanner error={shared.error} />;
  if (!shared.data) return <Loading />;

  const { trip, itinerary } = shared.data.view;
  return (
    <div className="stack">
      <div className="banner banner-info small">Read-only view shared by the trip owner.</div>
      <div>
        <h1>{trip.title}</h1>
        <p className="muted">
          {trip.destination} · {formatRange(trip.startDate, trip.endDate)}
        </p>
      </div>
      {!itinerary ? (
        <Empty title="No itinerary yet" />
      ) : (
        <>
          <div className="tabs">
            {VIEWS.map((v) => (
              <button key={v} className={view === v ? "active" : undefined} onClick={() => setView(v)}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {view === "magazine" && <MagazineView trip={trip} itinerary={itinerary} />}
          {view === "timeline" && <TimelineView itinerary={itinerary} />}
          {view === "map" && <ItineraryMap itinerary={itinerary} />}
        </>
      )}
    </div>
  );
}
