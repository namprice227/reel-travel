"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner } from "@/components/ui";
import { daysBetween, formatDateSpan, todayIso, tripDays, tripGroup, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { GettingStarted } from "./GettingStarted";
import { TripsToolbar } from "./TripsToolbar";

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
      <TripsToolbar active="overview" count={trips.data?.trips.length} />
      {trips.error && <div className="trips-error"><ErrorBanner error={trips.error} /><button className="btn btn-outline" type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? "Trying again…" : "Try again"}</button></div>}
      {trips.loading && !trips.data ? (
        <div className="trips-loading" role="status">
          <span className="sr-only">Loading your trips…</span>
          <div className="trips-skeleton trips-skeleton-hero" aria-hidden="true" />
          <div className="trips-skeleton-grid" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="trips-skeleton" />)}</div>
        </div>
      ) : !trips.data ? null : list.length === 0 ? (
        <>
          <FirstTrip />
          <GettingStarted trips={list} loading={trips.loading} />
        </>
      ) : (
        <div className="trips-body panel-scroll fit-fill">
          <GettingStarted trips={list} loading={trips.loading} />
          {current.length > 0 && <section className="trips-current" aria-label="Happening now">
            {current.map((trip) => <NowCard key={trip.id} trip={trip} />)}
          </section>}
          <section className="trips-section" aria-labelledby="coming-up-title">
            <div className="trips-section-head">
              <h2 id="coming-up-title">Upcoming <span className="trips-section-count">{coming.length}</span></h2>
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
        </div>
      )}
    </div>
  );
}

/** What someone sees before they have any trip (design "New user · C1"). */
function FirstTrip() {
  return (
    <div className="trips-first">
      <article className="card first-trip-card">
        <CoverArt seed="first trip" className="first-trip-cover" caption="Illustrative cover" showLabel={false} photo={false} />
        <div className="first-trip-body">
          <h2>Your first trip starts here</h2>
          <p>Give it a place and some dates. Then paste the reels, screenshots and notes you&apos;ve collected, and we&apos;ll turn them into days.</p>
          <div className="first-trip-actions">
            <Link className="btn btn-primary" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
          </div>
          <details className="first-trip-how">
            <summary>How it works</summary>
            <ol>
              <li><strong>Save</strong><span>Paste links, screenshots or notes into the trip.</span></li>
              <li><strong>Confirm</strong><span>We look each place up; you pick the right one.</span></li>
              <li><strong>Plan</strong><span>Confirmed places become days you can edit.</span></li>
            </ol>
            <p className="fineprint">Addresses and opening hours come from the map provider. Anything it can&apos;t supply stays marked unknown.</p>
          </details>
        </div>
      </article>
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
          <Link className="trips-details-link" href={`${base}/setup`} aria-label={`Trip details for ${trip.title}`}><Icon name="edit" size={16} /> <span>Trip details</span></Link>
        </div>
      </div>
    </article>
  );
}

function ComingCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const draft = tripGroup(trip) === "draft";
  const days = tripDays(trip.startDate, trip.endDate);
  const daysUntil = daysBetween(todayIso(new Date(), trip.timezone), trip.startDate);
  const countdown = daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
  return (
    <li className="card trip-card">
      <div className="trip-card-cover">
        <CoverArt seed={trip.destination} showLabel={false} caption="Illustrative cover" />
        <span className="trip-card-tag"><Icon name="pin" size={13} />{trip.destination}</span>
        <span className="trips-duration">{days} {days === 1 ? "day" : "days"}</span>
      </div>
      <div className="trip-card-body">
        <div className="trips-card-status"><Badge tone={draft ? "neutral" : "info"}>{draft ? "In planning" : "Itinerary saved"}</Badge><span>{countdown}</span></div>
        <h3><Link href={`${base}/itinerary`}>{trip.title}</Link></h3>
        <p className="trips-card-dates"><Icon name="calendar" size={15} />{formatDateSpan(trip.startDate, trip.endDate)}</p>
        <div className="trips-card-footer"><Link className="trips-card-action" href={`${base}/itinerary`}>{draft ? "Continue planning" : "View itinerary"}<Icon name="arrowRight" size={17} /></Link><Link className="trips-card-settings" href={`${base}/setup`} aria-label={`Trip details for ${trip.title}`}><Icon name="edit" size={17} /></Link></div>
      </div>
    </li>
  );
}
