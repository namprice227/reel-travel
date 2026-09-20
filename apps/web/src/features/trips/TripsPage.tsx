"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner } from "@/components/ui";
import { formatDateSpan, tripDays, tripGroup, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

type PlanFilter = "all" | "draft" | "upcoming";
const FILTERS: { id: PlanFilter; label: string }[] = [
  { id: "all", label: "All plans" },
  { id: "draft", label: "In planning" },
  { id: "upcoming", label: "With itinerary" },
];

export function TripsPage() {
  const trips = useApi("trips.list", {});
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [retrying, setRetrying] = useState(false);
  const list = trips.data?.trips ?? [];
  const current = list.filter((t) => tripGroup(t) === "current").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const coming = list.filter((t) => ["upcoming", "draft"].includes(tripGroup(t))).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const shown = coming.filter((t) => filter === "all" || tripGroup(t) === filter);

  async function retry() {
    setRetrying(true);
    try { await trips.reload(); } finally { setRetrying(false); }
  }

  return (
    <div className="fit-page trips-page">
      <header className="trips-head">
        <div>
          <p className="kicker trips-eyebrow">Your travel journal</p>
          <h1>My trips<span className="trips-title-dot">.</span></h1>
          <p className="trips-sub">A little inspiration. A plan to make it happen.</p>
        </div>
        <div className="trips-head-actions">
          <Link className="btn btn-ghost btn-all-trips" href="/my-trip/all">All trips {trips.data && <span className="count-pill">{list.length}</span>}<Icon name="arrowRight" size={16} /></Link>
          <Link className="btn btn-primary btn-create" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
        </div>
      </header>
      {trips.error && <div className="trips-error"><ErrorBanner error={trips.error} /><button className="btn btn-outline" type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? "Trying again…" : "Try again"}</button></div>}
      {trips.loading && !trips.data ? (
        <div className="trips-loading" role="status">
          <span className="sr-only">Loading your trips…</span>
          <div className="trips-skeleton trips-skeleton-hero" aria-hidden="true" />
          <div className="trips-skeleton-grid" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="trips-skeleton" />)}</div>
        </div>
      ) : !trips.data ? null : list.length === 0 ? (
        <div className="trips-welcome">
          <span className="trips-welcome-icon"><Icon name="trips" size={32} /></span>
          <p className="kicker">It starts with somewhere</p>
          <h2>Your next chapter is out there.</h2>
          <p>Give your saved places a destination. Create a trip, gather your inspiration, and turn confirmed places into a day-by-day plan.</p>
          <Link className="btn btn-primary" href="/my-trip/new">Plan your first trip <Icon name="arrowRight" size={18} /></Link>
          <ol className="trips-welcome-steps"><li>Save inspiration</li><li>Confirm places</li><li>Make it a trip</li></ol>
        </div>
      ) : (
        <div className="trips-body panel-scroll fit-fill">
          {current.length > 0 && <section className="trips-current" aria-label="Happening now">
            {current.map((trip) => <NowCard key={trip.id} trip={trip} />)}
          </section>}
          <section className="trips-section" aria-labelledby="coming-up-title">
            <div className="trips-section-head">
              <div><h2 id="coming-up-title">On the horizon <span className="trips-section-count">{coming.length}</span></h2><p>The places you’re looking forward to.</p></div>
              {coming.length > 0 && <div className="trips-plan-filters" role="group" aria-label="Filter future trips">
                {FILTERS.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
              </div>}
            </div>
            {coming.length === 0 ? (
              <div className="trips-next"><span className="trips-next-icon"><Icon name="trips" size={24} /></span><div><h3>Where to next?</h3><p>Your next adventure starts with a saved idea.</p></div><Link className="btn btn-outline" href="/my-trip/new">Create a trip <Icon name="plus" size={16} /></Link></div>
            ) : shown.length === 0 ? (
              <div className="trips-filter-empty" role="status"><p>{filter === "draft" ? "No trips in planning right now." : "No future trips have an itinerary yet."}</p><button type="button" className="btn btn-outline" onClick={() => setFilter("all")}>Show all plans</button></div>
            ) : (
              <ul className="coming-grid" aria-label="Future trips">
                {shown.map((trip) => <ComingCard key={trip.id} trip={trip} />)}
              </ul>
            )}
          </section>
          <footer className="trips-footnote"><Icon name="library" size={16} /><span>Good trips start with the places you save.</span><Link href="/inspiration-library">Find your inspiration <Icon name="arrowRight" size={14} /></Link></footer>
        </div>
      )}
    </div>
  );
}

function NowCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const label = tripStatusLabel(trip);
  const day = Number(label.match(/^Day (\d+)/)?.[1] ?? 1);
  const days = tripDays(trip.startDate, trip.endDate);
  const hotel = trip.preferences.accommodation?.name;
  const hasItinerary = trip.currentItineraryVersion !== null;
  return (
    <article className="card now-card" aria-label={`Happening now: ${trip.title}`}>
      <div className="trips-now-visual">
        <CoverArt seed={trip.destination} className="now-card-cover" caption="Illustrative cover" showLabel={false} />
        <span className="trips-cover-location"><Icon name="pin" size={16} />{trip.destination}</span>
      </div>
      <div className="now-card-body">
        <div className="now-card-top"><p className="kicker"><span className="status-dot is-success" aria-hidden="true" /> Happening now</p><span className="trips-day-label">{label}</span></div>
        <h2><Link href={`${base}/itinerary?day=${day}`}>{trip.title}</Link></h2>
        <ul className="trip-facts">
          <li><Icon name="calendar" size={17} /><span>{formatDateSpan(trip.startDate, trip.endDate)}</span></li>
          <li><Icon name="bed" size={17} /><span>{hotel ?? <Link href={`${base}/setup`}>Add your stay</Link>}</span></li>
        </ul>
        <div className="trips-day-track" aria-hidden="true">{Array.from({ length: days }, (_, i) => <span key={i} className={i < day ? "is-elapsed" : ""} />)}</div>
        <div className="now-card-actions">
          <Link className="btn btn-primary" href={`${base}/itinerary?day=${day}`}>{hasItinerary ? "Open today’s plan" : "Plan this trip"} <Icon name="arrowRight" size={18} /></Link>
          {hasItinerary && <Link className="btn btn-ghost" href={`${base}/map?day=${day}`}><Icon name="map" size={18} /> View map</Link>}
          <Link className="trips-details-link" href={`${base}/setup`} aria-label={`Trip details for ${trip.title}`}><Icon name="settings" size={16} /> <span>Trip details</span></Link>
        </div>
      </div>
    </article>
  );
}

function ComingCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const draft = tripGroup(trip) === "draft";
  const days = tripDays(trip.startDate, trip.endDate);
  return (
    <li className="card trip-card">
      <div className="trip-card-cover">
        <CoverArt seed={trip.destination} showLabel={false} caption="Illustrative cover" />
        <span className="trip-card-tag"><Icon name="pin" size={13} />{trip.destination}</span>
        <span className="trips-duration">{days} {days === 1 ? "day" : "days"}</span>
      </div>
      <div className="trip-card-body">
        <div className="trips-card-status"><Badge tone={draft ? "neutral" : "info"}>{draft ? "In planning" : "Itinerary saved"}</Badge><span>{tripStatusLabel(trip).replace(/^Draft · starts /, "").replace(/^in /, "In ").replace(/^tomorrow$/, "Tomorrow")}</span></div>
        <h3><Link href={`${base}/itinerary`}>{trip.title}</Link></h3>
        <p className="trips-card-dates"><Icon name="calendar" size={15} />{formatDateSpan(trip.startDate, trip.endDate)}</p>
        <div className="trips-card-footer"><Link className="trips-card-action" href={`${base}/itinerary`}>{draft ? "Continue planning" : "View itinerary"}<Icon name="arrowRight" size={17} /></Link><Link className="trips-card-settings" href={`${base}/setup`} aria-label={`Trip details for ${trip.title}`}><Icon name="settings" size={17} /></Link></div>
      </div>
    </li>
  );
}
