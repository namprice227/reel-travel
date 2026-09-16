"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { ErrorBanner, Loading } from "@/components/ui";
import { formatDateSpan, tripGroup, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { CreateTripDrawer } from "./CreateTrip";

// F3 trip list at /my-trip (UI: Member 1). Endpoint: trips.list. Arrangement follows the "mytrip" reference:
// a headline with a prominent Create trip button, then cover cards three to a row (more trips scroll sideways).
// /my-trip/new opens the create panel over this page.

const GROUP_LABEL: Record<TripGroup, string> = { upcoming: "Upcoming", draft: "Draft", past: "Past" };
const GROUP_ORDER: Record<TripGroup, number> = { upcoming: 0, draft: 1, past: 2 };

export function TripsPage({ creating = false }: { creating?: boolean }) {
  const trips = useApi("trips.list", {});
  const list = [...(trips.data?.trips ?? [])].sort(
    (a, b) => GROUP_ORDER[tripGroup(a)] - GROUP_ORDER[tripGroup(b)] || a.startDate.localeCompare(b.startDate),
  );

  return (
    <div className="fit-page trips-page">
      <header className="trips-head">
        <div>
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
          <p>Create a trip, then save links, notes or screenshots of places you want to see.</p>
        </div>
      ) : (
        <ul className="trip-row fit-fill" aria-label="Your trips">
          {list.map((trip) => <TripCard key={trip.id} trip={trip} />)}
        </ul>
      )}

      {creating && <CreateTripDrawer />}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  return (
    <li className="card trip-card">
      <Link href={`${base}/itinerary`} className="trip-card-cover" tabIndex={-1} aria-hidden="true">
        <CoverArt seed={trip.destination} showLabel={false} caption="Illustrative cover" />
        <span className="pill pill-info trip-card-tag">{GROUP_LABEL[tripGroup(trip)]}</span>
      </Link>
      <div className="trip-card-body">
        <h2><Link href={`${base}/itinerary`}>{trip.title}</Link></h2>
        <ul className="trip-facts">
          <li><Icon name="pin" size={18} /> {trip.destination}</li>
          <li><Icon name="calendar" size={18} /> {formatDateSpan(trip.startDate, trip.endDate)}</li>
          <li><Icon name="clock" size={18} /> {trip.timezone}</li>
        </ul>
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
    </li>
  );
}
