"use client";

import { isDatedTrip, type AccountPlace, type AccountReel, type DatedTrip, type Day, type Itinerary, type Stop, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { AccountReelComposer, HOME_PASTE_INPUT_ID } from "./AccountReelComposer";
import { DetectedPlacesDialog, type HomeNote } from "./DetectedPlacesDialog";
import { HomeRecoveryDialog } from "./HomeReelShelf";
import { buildAccountLibrary, type AccountLibraryPlace } from "@/features/library/account-library-model";
import { uploadUrl } from "@/lib/api-client";
import { addDays, formatDateSpan, startKey, tripDateLabel, tripDays, tripGroup, tripLength, tripStatusLabel, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { countryCoverStyle, tripCoverStyle } from "@/lib/country-cover";

// Signed-in Home: paste bar over a photo hero, then the next trip, anything to check, trips and recent saves.
// Links save to the account before any trip exists. The detected-places popup confirms which of a link's
// places stay and, optionally, which trip gets them. Every count comes from saved data; hours come from the
// itinerary's own checks, never from a caption.

const GROUP_ORDER: Record<TripGroup, number> = { current: 0, upcoming: 1, draft: 1, past: 2 };
const GROUP_TAG: Record<TripGroup, string> = { current: "Now", upcoming: "Upcoming", draft: "Draft", past: "Past" };
const MAX_DAY_CARDS = 4;

const needsCheck = (stop: Stop) => stop.hoursCheck === "unknown" || stop.hoursCheck === "closed";
const plannedStops = (day: Day) => day.stops.filter((stop) => stop.kind !== "break");
const itineraryHref = (trip: Trip) => `/my-trip/${trip.id}/itinerary`;
const weekdayDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

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
  const library = useApi("accountReels.library", {}, {
    pollMs: (data) => data.reels.some((reel) => reel.status === "queued" || reel.status === "processing") ? 1500 : false,
  });

  const ordered = orderTrips(trips.data?.trips ?? []);
  // The day-by-day hero needs dates; a draft from a video waits in the trip list until it has them.
  const next = ordered.find((trip): trip is DatedTrip => isDatedTrip(trip) && tripGroup(trip) !== "past") ?? null;
  const plan = useApi("itinerary.get", next?.currentItineraryVersion ? { params: { tripId: next.id } } : null);
  const itinerary = plan.data?.itinerary ?? null;

  const reels = shelf.data?.reels ?? [];
  const places = shelf.data?.places ?? [];
  const savedPlaces = buildAccountLibrary(library.data?.reels ?? [], library.data?.places ?? [])
    .flatMap((album) => album.places)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name))
    .slice(0, 3);
  // An itinerary reel finishes as a draft trip; show it in the trip list as soon as the shelf reports it.
  const tripList = trips.data?.trips;
  const missingDraft = Boolean(tripList) && reels.some((reel) => reel.tripId && !tripList!.some((trip) => trip.id === reel.tripId));
  const reloadTrips = trips.reload;
  useEffect(() => { if (missingDraft) void reloadTrips(); }, [missingDraft, reloadTrips]);
  const reloadShelf = async () => { await Promise.all([shelf.reload(), library.reload(), trips.reload()]); };
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  // The detected-places popup opens the moment Start is pressed (`saving`), then follows that reel. It also
  // comes back for any reel whose review is still pending on the server, across reloads and devices, until the
  // traveler closes (×) or finishes it. The reel just saved goes first, then the oldest pending one.
  const [saving, setSaving] = useState<string | null>(null);
  const [fresh, setFresh] = useState<AccountReel | null>(null);
  const [finished, setFinished] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState<HomeNote | null>(null);
  const known = fresh && !reels.some((reel) => reel.id === fresh.id) ? [fresh, ...reels] : reels;
  const pending = known.filter((reel) => reel.review === "pending" && !finished.has(reel.id));
  const popupReel = pending.find((reel) => reel.id === fresh?.id)
    ?? [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const popupOpen = Boolean(saving || popupReel);
  const notice = note && !popupOpen ? <p>{note.text}{note.href && <> <Link href={note.href}>{note.linkLabel ?? "Open"}</Link></>}</p> : null;

  // A failed poll stops polling, so retry while the connection is down, and at once when it comes back.
  const reloadList = shelf.reload;
  const offline = Boolean(shelf.error);
  useEffect(() => {
    if (!offline) return;
    const timer = setTimeout(() => void reloadList(), 3000);
    return () => clearTimeout(timer);
  }, [offline, shelf.error, reloadList]);
  useEffect(() => {
    const online = () => void reloadList();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [reloadList]);
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
        <AccountReelComposer notice={notice}
          onStart={(url) => { setNote(null); setSaving(url); }}
          onFailed={() => setSaving(null)}
          onSaved={async (reel) => {
            setFresh(reel);
            setSaving(null);
            await Promise.all([shelf.reload(), library.reload()]);
          }} />
        {popupOpen && <DetectedPlacesDialog key={popupReel?.id ?? "saving"} reel={saving ? null : popupReel}
          url={saving ?? popupReel!.url} places={popupReel ? places.filter((place) => place.reelId === popupReel.id) : []}
          trips={tripList} reconnecting={offline}
          onFinished={(result) => {
            setFinished((current) => new Set(current).add(popupReel!.id));
            setNote(result);
          }} onChanged={reloadShelf} />}
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
              : <button type="button" className="hb-see-all" onClick={() => setRecoveryOpen(true)}>Review all →</button>}
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
              <button type="button" className="hb-check-card" onClick={() => setRecoveryOpen(true)}>
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
        <ErrorBanner error={library.error ?? shelf.error} />
        <div className="hb-save-grid">
          {savedPlaces.map((place) => <SaveTile key={place.id} place={place} />)}
          <button type="button" className="hb-save-add" onClick={() => document.getElementById(HOME_PASTE_INPUT_ID)?.focus()}>
            <Icon name="plus" size={22} />
            <span>Add a save</span>
          </button>
        </div>
      </section>
      {recoveryOpen && unmatched.length > 0 && <HomeRecoveryDialog reels={unmatched} places={places}
        trips={tripList} onReload={reloadShelf} onDismiss={() => setRecoveryOpen(false)} />}
    </div>
  );
}

/** Uploaded cover first; otherwise illustrative country art or a neutral travel cover. */
function TripCover({ trip, className = "", children }: { trip: Trip; className?: string; children?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const src = trip.coverAssetId && !failed ? uploadUrl(trip.coverAssetId) : null;
  const kind = src ? "is-upload" : "is-photo";
  return (
    <span className={`hb-cover ${kind} ${className}`}>
      {src
        // eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated upload
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="hb-photo" style={tripCoverStyle(trip.destination)} aria-hidden="true" />}
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
            <li key={day.date} className={`hb-day has-link is-${day.state}`}>
              <Link href={`${itineraryHref(trip)}?day=${index + 1}`} className="hb-day-link" aria-label={`Open day ${index + 1} itinerary`}>
                <span className="hb-day-top">
                  <strong>Day {index + 1}</strong>
                  <span className="hb-day-mark" aria-hidden="true">
                    <Icon name={day.state === "done" ? "check" : day.state === "warn" ? "info" : "plus"} size={11} />
                  </span>
                </span>
                <small>{weekdayDate(day.date)}</small>
                <span className="hb-day-state">{planLoading ? "Loading…" : day.label}</span>
              </Link>
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
        <small className="hb-trip-details">
          {trip.destination} · {tripDateLabel(trip)}{days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
        </small>
        {ticked !== undefined && <div className="hb-trip-foot">
          <span>{ticked} {ticked === 1 ? "place" : "places"}</span>
        </div>}
      </div>
    </Link>
  );
}

function SaveTile({ place }: { place: AccountLibraryPlace }) {
  return (
    <Link className="hb-save-tile" href={`/inspiration-library?country=${place.countryId}&place=${encodeURIComponent(place.id)}`}>
      <span className="hb-save-art" style={countryCoverStyle(place.countryId)} aria-hidden="true" />
      <span className="hb-save-kind">{place.categoryLabel}</span>
      <span className="hb-save-copy">
        <strong>{place.name}</strong>
        <small>{place.area ?? place.countryName}</small>
      </span>
    </Link>
  );
}
