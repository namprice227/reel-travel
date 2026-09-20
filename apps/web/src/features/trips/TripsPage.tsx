"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { formatDateSpan, tripDays, tripGroup, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// My trips at /my-trip (design "Sky 3 · 01 My trips"): the trip happening now, then what's coming up.
// Past trips live on /my-trip/all ("See all trips"). /my-trip/new opens the create panel over this page.

export function TripsPage() {
  const trips = useApi("trips.list", {});
  const list = trips.data?.trips ?? [];
  const current = list.filter((t) => tripGroup(t) === "current").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const coming = list.filter((t) => ["upcoming", "draft"].includes(tripGroup(t))).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="fit-page trips-page">
      <header className="trips-head">
        <div>
          <h1>My trips</h1>
          <p className="trips-sub">{summarise(current.length, coming.length, list.length)}</p>
        </div>
        <div className="trips-head-actions">
          <Link className="btn btn-outline btn-all-trips" href="/my-trip/all"><Icon name="timeline" size={18} /> All trips <span className="count-pill">{list.length}</span></Link>
          <Link className="btn btn-primary btn-create" href="/my-trip/new"><Icon name="plus" size={22} /> Create trip</Link>
        </div>
      </header>

      <ErrorBanner error={trips.error} />
      {trips.loading && !trips.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="empty trips-empty">
          <strong>No trips yet</strong>
          <p>Create a trip, then paste links, text or screenshots of places you want to see.</p>
          <Link className="btn btn-primary" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
        </div>
      ) : (
        <div className="trips-body panel-scroll fit-fill">
          {current.map((trip) => <NowCard key={trip.id} trip={trip} />)}

          <section className="trips-section" aria-labelledby="coming-up-title">
            <div className="trips-section-head">
              <h2 id="coming-up-title">Coming up</h2>
              {coming.length > 0 && <span className="muted small">{coming.length} {coming.length === 1 ? "trip" : "trips"} ahead</span>}
            </div>
            {coming.length === 0 ? (
              <p className="trips-none">Nothing planned yet. <Link href="/my-trip/new">Create a trip</Link> to start saving places to it.</p>
            ) : (
              <ul className="coming-grid" aria-label="Upcoming trips">
                {coming.map((trip) => <ComingCard key={trip.id} trip={trip} />)}
              </ul>
            )}
          </section>
        </div>
      )}

    </div>
  );
}

/** "A trip in progress · 3 coming up" — the line under the page title. */
function summarise(current: number, coming: number, total: number): string {
  if (total === 0) return "Nothing planned yet.";
  const parts = [];
  if (current) parts.push(current === 1 ? "A trip in progress" : `${current} trips in progress`);
  if (coming) parts.push(`${coming} coming up`);
  if (parts.length === 0) return `${total} ${total === 1 ? "trip" : "trips"}, all in the past.`;
  return `${parts.join(" · ")}.`;
}

function NowCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const label = tripStatusLabel(trip);
  const day = Number(label.match(/^Day (\d+)/)?.[1] ?? 1);
  const hotel = trip.preferences.accommodation?.name;
  return (
    <article className="card now-card" aria-label={`Happening now: ${trip.title}`}>
      <CoverArt seed={trip.destination} className="now-card-cover" caption="Illustrative cover" showLabel={false} />
      <div className="now-card-body">
        <div className="now-card-top">
          <p className="kicker">Happening now</p>
          <Badge tone="success"><span className="status-dot is-success" aria-hidden="true" />{label}</Badge>
        </div>
        <h2><Link href={`${base}/itinerary?day=${day}`}>{trip.title}</Link></h2>
        <ul className="trip-facts">
          <li><Icon name="calendar" size={18} /> {formatDateSpan(trip.startDate, trip.endDate)}</li>
          <li><Icon name="bed" size={18} /> {hotel ?? <span className="muted">No hotel added</span>}</li>
        </ul>
        <div className="now-card-actions">
          <Link className="btn btn-primary" href={`${base}/itinerary?day=${day}`}>Open today <Icon name="arrowRight" size={18} /></Link>
          <Link className="btn btn-outline" href={`${base}/map?day=${day}`}><Icon name="map" size={18} /> Map</Link>
        </div>
      </div>
    </article>
  );
}

function ComingCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const draft = tripGroup(trip) === "draft";
  const hotel = trip.preferences.accommodation?.name;
  return (
    <li className="card trip-card">
      <Link href={`${base}/itinerary`} className="trip-card-cover" tabIndex={-1} aria-hidden="true">
        <CoverArt seed={trip.destination} showLabel={false} caption="Illustrative cover" />
        <span className={`trip-card-tag${draft ? "" : " is-countdown"}`}>{tripStatusLabel(trip)}</span>
      </Link>
      <div className="trip-card-body">
        <h3><Link href={`${base}/itinerary`}>{trip.title}</Link></h3>
        <ul className="trip-facts">
          <li><Icon name="calendar" size={18} /> {formatDateSpan(trip.startDate, trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days</li>
          <li><Icon name="pin" size={18} /> {trip.destination}</li>
          <li><Icon name="bed" size={18} /> {hotel ?? <span className="muted">No hotel yet</span>}</li>
        </ul>
        <Link className={`btn ${draft ? "btn-outline" : "btn-primary"} btn-block`} href={`${base}/itinerary`}>
          {draft ? "Finish planning" : "View itinerary"} <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </li>
  );
}
