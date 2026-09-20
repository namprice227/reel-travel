"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { formatDateSpan, tripDays, tripGroup, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { CreateTripDrawer } from "./CreateTrip";

// My trips at /my-trip (design "Sky 3 · 01 My trips"): the trip happening now, then what's coming up.
// Past trips live on /my-trip/all ("See all trips"). /my-trip/new opens the create panel over this page.

export function TripsPage({ creating = false }: { creating?: boolean }) {
  const trips = useApi("trips.list", {});
  const list = trips.data?.trips ?? [];
  const current = list.filter((t) => tripGroup(t) === "current").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const coming = list.filter((t) => ["upcoming", "draft"].includes(tripGroup(t))).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="fit-page trips-page">
      <header className="trips-head">
        <div>
          <p className="kicker trips-kicker">Plan</p>
          <h1>My trips</h1>
        </div>
        <Link className="btn btn-primary btn-create" href="/my-trip/new"><Icon name="plus" size={22} /> Create trip</Link>
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
              <Link href="/my-trip/all" className="link-arrow">See all trips · {list.length} <Icon name="arrowRight" size={16} /></Link>
            </div>
            <ul className="coming-grid" aria-label="Upcoming trips">
              {coming.map((trip) => <ComingCard key={trip.id} trip={trip} />)}
              <li>
                <Link href="/my-trip/new" className="plan-another">
                  <span className="plan-another-icon"><Icon name="plus" size={24} /></span>
                  <strong>Plan another trip</strong>
                  <span>Pick a place and dates, then add your saves</span>
                </Link>
              </li>
            </ul>
          </section>
        </div>
      )}

      {creating && <CreateTripDrawer />}
    </div>
  );
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
