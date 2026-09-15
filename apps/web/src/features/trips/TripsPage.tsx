"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { formatDateSpan, tripGroup, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// F3 trip list at /my-trip (UI: Member 1). Endpoint: trips.list. Arrangement follows the "mytrip" reference.

const FILTERS: Array<{ value: TripGroup | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "draft", label: "Drafts" },
  { value: "past", label: "Past" },
];

const GROUP_LABEL: Record<TripGroup, string> = { upcoming: "Upcoming", draft: "Draft", past: "Past" };

export function TripsPage() {
  const trips = useApi("trips.list", {});
  const [filter, setFilter] = useState<TripGroup | "all">("all");
  const list = trips.data?.trips ?? [];
  const shown = filter === "all" ? list : list.filter((t) => tripGroup(t) === filter);

  return (
    <div className="trips-page">
      <header className="page-heading trips-heading">
        <div>
          <p className="kicker">My trips</p>
          <h1>Where will your saves take you?</h1>
          <p>Pick up a trip or start somewhere new.</p>
        </div>
        <Link className="btn btn-primary btn-large" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
      </header>

      <ErrorBanner error={trips.error} />
      {trips.loading && !trips.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="No trips yet">Create one to start saving inspiration.</Empty>
      ) : (
        <>
          <div className="tabs trip-filters" role="tablist" aria-label="Filter trips">
            {FILTERS.map((f) => {
              const count = f.value === "all" ? list.length : list.filter((t) => tripGroup(t) === f.value).length;
              return (
                <button key={f.value} role="tab" aria-selected={filter === f.value} className={filter === f.value ? "active" : undefined} onClick={() => setFilter(f.value)}>
                  {f.label} <span className="count">{count}</span>
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <Empty title={`No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} trips`} />
          ) : (
            <div className="trip-grid">
              {shown.map((trip) => <TripCard key={trip.id} trip={trip} />)}
            </div>
          )}
        </>
      )}

      <section className="trips-start">
        <div className="card trips-start-card">
          <div className="trips-start-copy">
            <h2>Start with a place you saved</h2>
            <p className="muted">Turn your travel links, text and screenshots into confirmed places, then build a simple itinerary.</p>
          </div>
          <ol className="start-steps">
            <li><Icon name="link" size={22} /><strong>Save</strong><small>Add links, text or screenshots</small></li>
            <li aria-hidden="true" className="start-chevron"><Icon name="chevronRight" /></li>
            <li><Icon name="pin" size={22} /><strong>Confirm</strong><small>We&apos;ll turn them into places</small></li>
            <li aria-hidden="true" className="start-chevron"><Icon name="chevronRight" /></li>
            <li><Icon name="calendar" size={22} /><strong>Plan</strong><small>Arrange them into an itinerary</small></li>
          </ol>
        </div>
        <Link href="/my-trip/new" className="create-trip-tile">
          <span className="create-plus"><Icon name="plus" size={28} /></span>
          <span><strong>Create a new trip</strong><small>A blank canvas for your next adventure.</small></span>
        </Link>
      </section>
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const group = tripGroup(trip);
  const base = `/my-trip/${trip.id}`;
  return (
    <article className="card trip-card">
      <Link href={`${base}/itinerary`} className="trip-card-cover" tabIndex={-1} aria-hidden="true">
        <CoverArt seed={trip.destination} />
        <span className="pill pill-info trip-card-tag">{GROUP_LABEL[group]}</span>
      </Link>
      <div className="trip-card-body">
        <h2><Link href={`${base}/itinerary`}>{trip.title}</Link></h2>
        <ul className="trip-facts">
          <li><Icon name="pin" size={18} /> {trip.destination}</li>
          <li><Icon name="calendar" size={18} /> {formatDateSpan(trip.startDate, trip.endDate)}</li>
          <li><Icon name="clock" size={18} /> {trip.timezone}</li>
        </ul>
        <p className="small muted trip-card-status">
          {trip.currentItineraryVersion ? <><span className="status-dot is-success" />Itinerary version {trip.currentItineraryVersion}</> : <><span className="status-dot" />No itinerary yet</>}
        </p>
        <div className="trip-card-actions">
          <Link className="btn btn-primary" href={trip.currentItineraryVersion ? `${base}/itinerary` : `${base}/setup`}>Open trip</Link>
          <details className="menu">
            <summary className="icon-btn" aria-label={`More actions for ${trip.title}`}><Icon name="more" /></summary>
            <div className="menu-list">
              <Link href={`${base}/setup`}><Icon name="calendar" size={16} /> Trip details</Link>
              <Link href={`${base}/places`}><Icon name="pin" size={16} /> Places</Link>
              <Link href={`/inspiration-library?trip=${trip.id}`}><Icon name="library" size={16} /> Saves</Link>
              <Link href={`${base}/share`}><Icon name="share" size={16} /> Share</Link>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}
