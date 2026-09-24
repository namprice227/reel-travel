"use client";

import { isDatedTrip, type AccountPlace, type AccountReel, type DatedTrip, type Day, type Itinerary, type Stop, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { AccountReelComposer, HOME_PASTE_INPUT_ID } from "./AccountReelComposer";
import { HomeReelShelf, openHomeShelf, status as reelStatus } from "./HomeReelShelf";
import { uploadUrl } from "@/lib/api-client";
import { addDays, formatDateSpan, startKey, tripDateLabel, tripDays, tripGroup, tripLength, tripStatusLabel, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// Signed-in Home: paste bar over a photo hero, then the next trip, anything to check, trips and recent saves.
// Links save to the account shelf before any trip exists. Every count comes from saved data; hours come from the
// itinerary's own checks, never from a caption.

const GROUP_ORDER: Record<TripGroup, number> = { current: 0, upcoming: 1, draft: 1, past: 2 };
const GROUP_TAG: Record<TripGroup, string> = { current: "Now", upcoming: "Upcoming", draft: "Draft", past: "Past" };
const MAX_DAY_CARDS = 4;

// Covers reuse the app's own artwork (see public/images). A destination photo is illustrative, never the traveler's.
const COVER_PHOTOS: Array<{ match: RegExp; className: string; position: string }> = [
  { match: /japan|tokyo|kyoto|osaka|nara|hokkaido|fukuoka|hiroshima/i, className: "hb-photo-countries", position: "0%" },
  { match: /korea|seoul|busan|jeju/i, className: "hb-photo-countries", position: "50%" },
  { match: /thailand|bangkok|chiang|phuket|krabi/i, className: "hb-photo-countries", position: "100%" },
  { match: /greece|santorini|athens|mykonos/i, className: "hb-photo-postcards", position: "0%" },
];

const needsCheck = (stop: Stop) => stop.hoursCheck === "unknown" || stop.hoursCheck === "closed";
const plannedStops = (day: Day) => day.stops.filter((stop) => stop.kind !== "break");
const itineraryHref = (trip: Trip) => `/my-trip/${trip.id}/itinerary`;
const weekdayDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function orderTrips(trips: Trip[]) {
  return [...trips].sort((a, b) =>
    GROUP_ORDER[tripGroup(a)] - GROUP_ORDER[tripGroup(b)]
    || (tripGroup(a) === "past" ? startKey(b).localeCompare(startKey(a)) : startKey(a).localeCompare(startKey(b))));
}

export function HomePage() {
  const trips = useApi("trips.list", {});
  const shelf = useApi("accountReels.list", {}, {
    pollMs: (data) => data.reels.some((reel) => reel.status === "queued" || reel.status === "processing") ? 1500 : false,
  });

  const ordered = orderTrips(trips.data?.trips ?? []);
  // The day-by-day hero needs dates; a draft from a video waits in the trip list until it has them.
  const next = ordered.find((trip): trip is DatedTrip => isDatedTrip(trip) && tripGroup(trip) !== "past") ?? null;
  const plan = useApi("itinerary.get", next?.currentItineraryVersion ? { params: { tripId: next.id } } : null);
  const itinerary = plan.data?.itinerary ?? null;

  const reels = shelf.data?.reels ?? [];
  const places = shelf.data?.places ?? [];
  // An itinerary reel finishes as a draft trip; show it in the trip list as soon as the shelf reports it.
  const tripList = trips.data?.trips;
  const missingDraft = Boolean(tripList) && reels.some((reel) => reel.tripId && !tripList!.some((trip) => trip.id === reel.tripId));
  const reloadTrips = trips.reload;
  useEffect(() => { if (missingDraft) void reloadTrips(); }, [missingDraft, reloadTrips]);
  const reloadShelf = async () => { await Promise.all([shelf.reload(), trips.reload()]); };
  const unmatched = reels.filter((reel) => reel.status === "needs_input" || reel.status === "failed");
  const toCheck = next && itinerary
    ? itinerary.days.flatMap((day, index) => day.stops.filter(needsCheck).map((stop) => ({ stop, dayNumber: index + 1 })))
    : [];

  return (
    <div className="home-board">
      <section className="hb-hero-wrap" aria-labelledby="home-title">
        <div className="hb-hero">
          <div className="hb-hero-copy">
            <h1 id="home-title">From saved to scheduled.</h1>
            <p>Add what you saved — every place, on the right day.</p>
          </div>
        </div>
        <AccountReelComposer onSaved={shelf.reload} />
      </section>

      <section aria-labelledby="home-next-title">
        <div className="hb-section-head">
          <h2 id="home-next-title">{!next ? "Your trips" : tripGroup(next) === "current" ? "Happening now" : "Upcoming trip"}</h2>
        </div>
        <ErrorBanner error={trips.error ?? plan.error} />
        {!trips.data && !trips.error ? <Loading label="Loading your trips…" />
          : next ? <NextTrip trip={next} itinerary={itinerary} planLoading={plan.loading} />
          : <div className="hb-empty">
              <Icon name="trips" size={26} />
              <strong>{ordered.length ? "No upcoming trips" : "No trips yet"}</strong>
              <p>Save places above, then make a trip when you’re ready.</p>
              <Link href="/my-trip/new" className="btn btn-outline btn-small"><Icon name="plus" size={16} /> Create a trip</Link>
            </div>}
      </section>

      {(toCheck.length > 0 || unmatched.length > 0) && (
        <section aria-labelledby="home-check-title">
          <div className="hb-section-head">
            <div className="hb-title-count">
              <h2 id="home-check-title">Pending check</h2>
              <span className="hb-count-warn">{toCheck.length + unmatched.length}</span>
            </div>
            {next && toCheck.length > 0
              ? <Link href={itineraryHref(next)} className="hb-see-all">Review all →</Link>
              : <button type="button" className="hb-see-all" onClick={openHomeShelf}>Review all →</button>}
          </div>
          <div className="hb-check-grid">
            {next && toCheck.slice(0, unmatched.length ? 2 : 3).map(({ stop, dayNumber }) => (
              <Link key={stop.id} href={itineraryHref(next)} className="hb-check-card">
                <TripCover trip={next} className="hb-check-thumb" />
                <span className="hb-check-copy">
                  <strong>{stop.title}</strong>
                  <small><Icon name="clock" size={12} /> {stop.hoursCheck === "closed" ? "May be closed then" : "Hours unknown"} · Day {dayNumber}</small>
                </span>
                <Icon name="chevronRight" size={15} className="hb-check-arrow" />
              </Link>
            ))}
            {unmatched.length > 0 && (
              <button type="button" className="hb-check-card" onClick={openHomeShelf}>
                <span className="hb-check-thumb hb-art hb-art-skyline" aria-hidden="true" />
                <span className="hb-check-copy">
                  <strong>{unmatched.length} {unmatched.length === 1 ? "save" : "saves"} unmatched</strong>
                  <small><Icon name="pin" size={12} /> No place found · Add details</small>
                </span>
                <Icon name="chevronRight" size={15} className="hb-check-arrow" />
              </button>
            )}
          </div>
        </section>
      )}

      {ordered.length > 0 && (
        <section aria-labelledby="home-trips-title">
          <div className="hb-section-head">
            <h2 id="home-trips-title">Your trips</h2>
            <Link href="/my-trip" className="hb-see-all">See all →</Link>
          </div>
          <div className="hb-trip-grid">
            {ordered.slice(0, 3).map((trip) => <TripCard key={trip.id} trip={trip} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="home-saves-title">
        <div className="hb-section-head">
          <h2 id="home-saves-title">From your saves</h2>
          <Link href="/inspiration-library" className="hb-see-all">Open library →</Link>
        </div>
        <ErrorBanner error={shelf.error} />
        <div className="hb-save-grid">
          {reels.slice(0, 3).map((reel, index) => <SaveTile key={reel.id} reel={reel} places={places} index={index} />)}
          <button type="button" className="hb-save-add" onClick={() => document.getElementById(HOME_PASTE_INPUT_ID)?.focus()}>
            <Icon name="plus" size={22} />
            <span>Add a save</span>
          </button>
        </div>
        {reels.length > 0 && <HomeReelShelf reels={reels} places={places} trips={tripList} onReload={reloadShelf} />}
      </section>
    </div>
  );
}

/** Uploaded cover first; otherwise an illustrative destination photo, or the watercolor art. */
function TripCover({ trip, className = "", children }: { trip: Trip; className?: string; children?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const photo = COVER_PHOTOS.find((entry) => entry.match.test(`${trip.destination} ${trip.title}`));
  const src = trip.coverAssetId && !failed ? uploadUrl(trip.coverAssetId) : null;
  const kind = src ? "is-upload" : photo ? "is-photo" : "is-art";
  return (
    <span className={`hb-cover ${kind} ${className}`}>
      {src
        // eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated upload
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : photo
          ? <span className={`hb-photo ${photo.className}`} style={{ backgroundPosition: `${photo.position} center` }} aria-hidden="true" />
          : <span className="hb-art hb-art-mountains" aria-hidden="true" />}
      {children}
    </span>
  );
}

function NextTrip({ trip, itinerary, planLoading }: { trip: DatedTrip; itinerary: Itinerary | null; planLoading: boolean }) {
  const total = tripDays(trip.startDate, trip.endDate);
  const days = Array.from({ length: total }, (_, index) => {
    const date = addDays(trip.startDate, index);
    const planned = itinerary?.days.find((day) => day.date === date);
    const stops = planned ? plannedStops(planned) : [];
    const checks = stops.filter(needsCheck).length;
    const state = stops.length === 0 ? "empty" : checks ? "warn" : "done";
    const label = stops.length === 0 ? (itinerary ? "Nothing planned" : "Not planned yet")
      : `${stops.length} ${stops.length === 1 ? "stop" : "stops"}${checks ? ` · ${checks} to check` : " planned"}`;
    return { date, state, label };
  });
  const stops = itinerary?.days.flatMap(plannedStops) ?? [];
  const checkCount = stops.filter(needsCheck).length;
  const checked = stops.length - checkCount;
  const current = tripGroup(trip) === "current";

  return (
    <article className="hb-next">
      <TripCover trip={trip} className="hb-next-cover">
        <span className="hb-tag">{tripStatusLabel(trip)}</span>
        <span className="hb-cover-scrim" aria-hidden="true" />
        <h3>{trip.title}</h3>
      </TripCover>
      <div className="hb-next-body">
        <div className="hb-next-meta">
          <span><span className="hb-meta-icon"><Icon name="pin" size={17} /></span>{trip.destination}</span>
          <span><span className="hb-meta-icon"><Icon name="calendar" size={17} /></span>{formatDateSpan(trip.startDate, trip.endDate)}</span>
          <span><span className="hb-meta-icon"><Icon name="clock" size={17} /></span>{total} {total === 1 ? "day" : "days"}</span>
        </div>
        <ol className="hb-days" aria-label="Days">
          {days.slice(0, MAX_DAY_CARDS).map((day, index) => (
            <li key={day.date} className={`hb-day is-${day.state}`}>
              <span className="hb-day-top">
                <strong>Day {index + 1}</strong>
                <span className="hb-day-mark" aria-hidden="true">
                  <Icon name={day.state === "done" ? "check" : day.state === "warn" ? "info" : "plus"} size={11} />
                </span>
              </span>
              <small>{weekdayDate(day.date)}</small>
              <span className="hb-day-state">{planLoading ? "Loading…" : day.label}</span>
            </li>
          ))}
          {days.length > MAX_DAY_CARDS && (
            <li className="hb-day is-more"><Link href={itineraryHref(trip)}>+{days.length - MAX_DAY_CARDS} more {days.length - MAX_DAY_CARDS === 1 ? "day" : "days"}</Link></li>
          )}
        </ol>
        <div className="hb-next-foot">
          <div className="hb-progress">
            {stops.length > 0 ? <>
              <div className="hb-progress-line">
                <strong>{checked}</strong>
                <span>of {stops.length} stops checked</span>
                {checkCount > 0 && <span className="hb-count-warn">{checkCount} to check</span>}
              </div>
              <div className="hb-bar"><span style={{ width: `${Math.round((checked / stops.length) * 100)}%` }} /></div>
            </> : <div className="hb-progress-line"><span>{planLoading ? "Loading plan…" : "No days planned yet."}</span></div>}
          </div>
          <Link href={itineraryHref(trip)} className="btn btn-primary">
            {!itinerary ? "Plan your days" : current ? "Open today" : "Open itinerary"}
          </Link>
        </div>
      </div>
    </article>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const group = tripGroup(trip);
  const days = tripLength(trip);
  const ticked = trip.selectedPlaceIds?.length;
  return (
    <Link href={itineraryHref(trip)} className="hb-trip-card">
      <TripCover trip={trip} className="hb-trip-cover">
        <span className={`hb-tag${group === "draft" || group === "past" ? " is-quiet" : ""}`}>{GROUP_TAG[group]}</span>
      </TripCover>
      <div className="hb-trip-body">
        <h3>{trip.title}</h3>
        <small>{tripDateLabel(trip)}</small>
        <div className="hb-trip-foot">
          <span>{trip.destination}{days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}</span>
          {ticked !== undefined && <span>{ticked} {ticked === 1 ? "place" : "places"}</span>}
        </div>
      </div>
    </Link>
  );
}

function sourceLabel(url: string) {
  const host = hostOf(url);
  if (host.includes("youtube") || host === "youtu.be") return "YouTube";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("tiktok")) return "TikTok";
  return "Link";
}

function SaveTile({ reel, places, index }: { reel: AccountReel; places: AccountPlace[]; index: number }) {
  const first = places.find((place) => place.reelId === reel.id);
  return (
    <button type="button" className="hb-save-tile" onClick={openHomeShelf}>
      <span className={`hb-art ${index % 2 ? "hb-art-skyline" : "hb-art-mountains"}`} aria-hidden="true" />
      <span className="hb-save-kind">{sourceLabel(reel.url)}</span>
      <span className="hb-save-copy">
        <strong>{first?.name ?? hostOf(reel.url)}</strong>
        <small>{reelStatus(reel)}</small>
      </span>
    </button>
  );
}
