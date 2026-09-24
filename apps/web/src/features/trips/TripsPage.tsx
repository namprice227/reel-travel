"use client";

import { isDatedTrip, MAX_TRIP_DAYS, type DatedTrip, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Badge, ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { daysBetween, formatDateSpan, startKey, todayIso, tripDateLabel, tripDays, tripGroup, tripLength, tripStatusLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { COUNTRIES, type Country } from "./CreateTripPage";
import { TripsToolbar } from "./TripsToolbar";
import { tripSettingsHref } from "./trip-settings";
import { TripCoverArt } from "./TripCoverArt";

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
  const current = list.filter((t): t is DatedTrip => isDatedTrip(t) && tripGroup(t) === "current").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const coming = list.filter((t) => ["upcoming", "draft"].includes(tripGroup(t))).sort((a, b) => startKey(a).localeCompare(startKey(b)));
  const shown = coming.filter((t) => filter === "all" || tripGroup(t) === filter);

  async function retry() {
    setRetrying(true);
    try { await trips.reload(); } finally { setRetrying(false); }
  }

  return (
    <div className="fit-page trips-page">
      <TripsToolbar active="overview" count={trips.data?.trips.length} showCreate={!trips.data || list.length > 0} />
      {trips.error && <div className="trips-error"><ErrorBanner error={trips.error} /><button className="btn btn-outline" type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? "Trying again…" : "Try again"}</button></div>}
      {trips.loading && !trips.data ? (
        <div className="trips-loading" role="status">
          <span className="sr-only">Loading your trips…</span>
          <div className="trips-skeleton trips-skeleton-hero" aria-hidden="true" />
          <div className="trips-skeleton-grid" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="trips-skeleton" />)}</div>
        </div>
      ) : !trips.data ? null : list.length === 0 ? (
        <FirstTripStart />
      ) : (
        <div className="trips-body panel-scroll fit-fill">
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

/**
 * What someone sees before they have any trip (design "/my-trip · D1").
 *
 * The only thing an empty account can do here is make a trip, so the empty state is the form
 * rather than a card that sends them to one. Both escapes stay visible: the full form for a
 * country that isn't on the grid, and Home for someone who would rather start from a reel.
 *
 * `destination` is the country, not one of its cities. The screen asks for one decision, and a
 * city the traveler never picked would be a guess sitting in their trip; they choose one in Trip
 * details, and the planner only needs it when there are places to plan.
 *
 * Dates are here because `trips.create` still requires them. The design defers them
 * (docs/design/new-user-flow.md); once a trip may exist without dates, the "When" fields and
 * `days`/`tooLong`/`ready` are the only parts that change.
 */
function FirstTripStart() {
  const router = useRouter();
  const [country, setCountry] = useState<Country>(COUNTRIES[0]!);
  const [title, setTitle] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const days = startDate && endDate && endDate >= startDate ? tripDays(startDate, endDate) : 0;
  const tooLong = days > MAX_TRIP_DAYS;
  const suggested = `${country.name} trip`;
  const ready = days > 0 && !tooLong;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await api("trips.create", {
        body: { title: title.trim() || suggested, destination: country.name, timezone: country.timezone, startDate, endDate },
      });
      router.push(tripSettingsHref(trip.id, "preferences"));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  return (
    <form className="trips-first first-start" onSubmit={submit}>
      <div className="first-start-head">
        <h2>Where are you going?</h2>
        <p>A trip is where your reels land. Pick a country and you have one — the city and everything else come later.</p>
      </div>

      <ul className="country-grid" aria-label="Country">
        {COUNTRIES.map((c) => (
          <li key={c.name}>
            <button type="button" className={`country-card${c.name === country.name ? " is-on" : ""}`} aria-pressed={c.name === country.name} onClick={() => setCountry(c)}>
              <strong>{c.name}</strong>
              <span>{c.cities.join(", ")}</span>
              {c.name === country.name && <Icon name="checkCircle" size={20} className="country-check" />}
            </button>
          </li>
        ))}
      </ul>

      <div className="first-start-row">
        <label htmlFor="first-start-title">
          Call it
          <input id="first-start-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} maxLength={120} />
        </label>
        <label htmlFor="first-start-start">
          From
          <input id="first-start-start" type="date" required min={todayIso()} value={startDate} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label htmlFor="first-start-end">
          To
          <input id="first-start-end" type="date" required min={startDate || todayIso()} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy || !ready}>
          {busy ? "Creating…" : "Create trip"} <Icon name="arrowRight" size={18} />
        </button>
      </div>

      {tooLong && <p className="banner banner-warning small" role="status">{days} days is longer than {MAX_TRIP_DAYS}. Shorten the dates, or plan a second trip.</p>}
      <ErrorBanner error={error} />

      <div className="first-start-foot">
        <p>Somewhere else, or you want the full setup? <Link href="/my-trip/new">Open the full form</Link>.</p>
        <Link className="first-start-reel" href="/home"><Icon name="link" size={16} /> Start from a reel instead <Icon name="arrowRight" size={16} /></Link>
      </div>
    </form>
  );
}

function NowCard({ trip }: { trip: DatedTrip }) {
  const base = `/my-trip/${trip.id}`;
  const label = tripStatusLabel(trip);
  const day = Number(label.match(/^Day (\d+)/)?.[1] ?? 1);
  const days = tripDays(trip.startDate, trip.endDate);
  const stays = trip.preferences.accommodations;
  const hotel = stays.length > 1 ? `${stays[0]!.name} + ${stays.length - 1} more` : stays[0]?.name;
  const hasItinerary = trip.currentItineraryVersion !== null;
  return (
    <article className="card now-card" aria-label={`Happening now: ${trip.title}`}>
      <div className="trips-now-visual">
        <TripCoverArt trip={trip} className="now-card-cover" showLabel={false} />
        <span className="trips-cover-location"><Icon name="pin" size={16} />{trip.destination}</span>
      </div>
      <div className="now-card-body">
        <div className="now-card-top"><p className="kicker"><span className="status-dot is-success" aria-hidden="true" /> Happening now</p><span className="trips-day-label">{label}</span></div>
        <h2><Link href={`${base}/itinerary?day=${day}`}>{trip.title}</Link></h2>
        <ul className="trip-facts">
          <li><Icon name="calendar" size={17} /><span>{formatDateSpan(trip.startDate, trip.endDate)}</span></li>
          <li><Icon name="bed" size={17} /><span>{hotel ?? <Link href={tripSettingsHref(trip.id, "preferences")}>Add your stay</Link>}</span></li>
        </ul>
        <div className="trips-day-track" aria-hidden="true">{Array.from({ length: days }, (_, i) => <span key={i} className={i < day ? "is-elapsed" : ""} />)}</div>
        <div className="now-card-actions">
          <Link className="btn btn-primary" href={`${base}/itinerary?day=${day}`}>{hasItinerary ? "Open today’s plan" : "Plan this trip"} <Icon name="arrowRight" size={18} /></Link>
          {hasItinerary && <Link className="btn btn-ghost" href={`${base}/map?day=${day}`}><Icon name="map" size={18} /> View map</Link>}
          <Link className="trips-details-link" href={tripSettingsHref(trip.id)} aria-label={`Trip details for ${trip.title}`}><Icon name="edit" size={16} /> <span>Trip details</span></Link>
        </div>
      </div>
    </article>
  );
}

function ComingCard({ trip }: { trip: Trip }) {
  const base = `/my-trip/${trip.id}`;
  const draft = tripGroup(trip) === "draft";
  const days = tripLength(trip);
  const daysUntil = trip.startDate ? daysBetween(todayIso(new Date(), trip.timezone ?? undefined), trip.startDate) : null;
  const countdown = daysUntil === null ? "Add dates" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
  return (
    <li className="card trip-card">
      <div className="trip-card-cover">
        <TripCoverArt trip={trip} showLabel={false} />
        <span className="trip-card-tag"><Icon name="pin" size={13} />{trip.destination}</span>
        {days && <span className="trips-duration">{days} {days === 1 ? "day" : "days"}</span>}
      </div>
      <div className="trip-card-body">
        <div className="trips-card-status"><Badge tone={draft ? "neutral" : "info"}>{draft ? "In planning" : "Itinerary saved"}</Badge><span>{countdown}</span></div>
        <h3><Link href={`${base}/itinerary`}>{trip.title}</Link></h3>
        <p className="trips-card-dates"><Icon name="calendar" size={15} />{tripDateLabel(trip)}</p>
        <div className="trips-card-footer"><Link className="trips-card-action" href={`${base}/itinerary`}>{draft ? "Continue planning" : "View itinerary"}<Icon name="arrowRight" size={17} /></Link><Link className="trips-card-settings" href={tripSettingsHref(trip.id)} aria-label={`Trip details for ${trip.title}`}><Icon name="edit" size={17} /></Link></div>
      </div>
    </li>
  );
}
