"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { ItineraryMap } from "@/features/itinerary/ItineraryMap";
import { placeInfoFromShared } from "@/features/itinerary/place-info";
import { TimelineView } from "@/features/itinerary/TimelineView";
import { MagazineView } from "@/features/magazine/MagazineView";
import { validationStatus } from "@/lib/format";
import { formatDateSpan } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// F6 viewer page (UI: Member 2). Public; reads only the shared.get projection. No notes or edit controls.

const VIEWS = [
  { view: "magazine", label: "Magazine", icon: "magazine" },
  { view: "timeline", label: "Timeline", icon: "timeline" },
  { view: "map", label: "Map", icon: "map" },
] as const;

export function SharedTripPage({ token }: { token: string }) {
  const shared = useApi("shared.get", { params: { token } });
  const [view, setView] = useState<(typeof VIEWS)[number]["view"]>("magazine");
  const [dayIndex, setDayIndex] = useState(0);

  if (shared.error?.code === "SHARE_REVOKED") {
    return <Empty title="This link was revoked">Ask the trip owner for a new link.</Empty>;
  }
  if (shared.error?.code === "NOT_FOUND") return <Empty title="Link not found" />;
  if (shared.error) return <ErrorBanner error={shared.error} />;
  if (!shared.data) return <Loading />;

  const { trip, itinerary, places } = shared.data.view;
  const info = placeInfoFromShared(places);
  const status = itinerary ? validationStatus[itinerary.validationStatus] : null;

  return (
    <div className="itinerary-page shared-page shared-view">
      <div className="row between">
        <span className="pill pill-info"><Icon name="view" size={15} /> View only</span>
        <Link href="/" className="link-arrow">Start your own trip <Icon name="arrowRight" size={16} /></Link>
      </div>
      <header className="itin-header">
        <div className="itin-title">
          <h1>{trip.title}</h1>
          <p className="itin-sub">{formatDateSpan(trip.startDate, trip.endDate)} · {trip.timezone}</p>
          {itinerary && status && (
            <p className="itin-status">
              <span className={`status-dot is-${status.tone}`} />
              <em>Version {itinerary.version} · {status.label}</em>
              {itinerary.validationStatus === "partially_checked" && (
                <><span className="itin-status-divider" aria-hidden="true" /><Icon name="info" size={18} /> Some opening hours are unknown.</>
              )}
            </p>
          )}
        </div>
        <CoverArt seed={trip.destination} className="itin-cover" caption={trip.destination} />
      </header>

      {!itinerary ? (
        <Empty title="No itinerary yet" />
      ) : (
        <>
          <nav className="tabs itin-tabs" aria-label="Itinerary views">
            {VIEWS.map((v) => (
              <button key={v.view} className={view === v.view ? "active" : undefined} aria-pressed={view === v.view} onClick={() => setView(v.view)}>
                <Icon name={v.icon} size={18} /> {v.label}
              </button>
            ))}
          </nav>
          {view === "magazine" && (
            <MagazineView trip={trip} itinerary={itinerary} places={info} dayIndex={dayIndex} onSelectDay={setDayIndex} onOpenMap={() => setView("map")} />
          )}
          {view === "timeline" && <TimelineView itinerary={itinerary} places={info} dayIndex={dayIndex} onSelectDay={setDayIndex} />}
          {view === "map" && <ItineraryMap itinerary={itinerary} places={info} dayIndex={dayIndex} onSelectDay={setDayIndex} />}
        </>
      )}
      <p className="fineprint">Read-only view shared by the trip owner · Travel times are estimates · Illustrative artwork</p>
    </div>
  );
}
