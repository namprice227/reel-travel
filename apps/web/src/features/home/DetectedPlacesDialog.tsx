"use client";

import type { AccountPlace, AccountReel, CandidatePlace, Trip } from "@reel/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { tripCoverStyle } from "@/lib/country-cover";
import { tripDateLabel } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { AccountPlacePhoto } from "@/features/library/AccountPlacePhoto";
import { accountPlaceCategory } from "@/features/library/account-library-model";
import { confirmLabel, placesCountry, tripChoices, withAdded, type Destination } from "./detected-places-model";

// Home's popup for a saved reel (design 4: compact while reading, expanding when places arrive).
// It opens as soon as a link is saved and comes back on every visit while the reel's review is pending,
// until the traveler closes it or finishes it:
// - × keeps everything (after a confirmation that says so) and closes.
// - Cancel removes every place this reel added to the account.
// - Save/Add removes unticked places and keeps the ticked ones, optionally copying them into a trip.
// An itinerary reel has already become a draft trip; "Keep as ideas instead" turns it into the ticking view.
// Cards show the place only: photo and name.

export type HomeNote = { text: string; href?: string; linkLabel?: string };

type Ask = { text: string; confirm: string; danger?: boolean; run: () => Promise<void> };

const ART: Record<string, string> = {
  "Food & drink": "is-food", Attractions: "is-sight", Nature: "is-nature", Shopping: "is-shop", Stays: "is-stay",
};
/** Uncategorised places still get distinct placeholder colours, chosen by position. */
const OTHER_ART = ["is-food", "is-sight", "is-nature", "is-stay"];

const toError = (cause: unknown) => cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause));
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

export function DetectedPlacesDialog({ reel, url, places, trips, reconnecting, onFinished, onChanged }: {
  /** Null for the moment between pressing Start and the server saving the link. */
  reel: AccountReel | null;
  url: string;
  /** This reel's account places, live. The ticking view takes its starting ticks when it first appears. */
  places: AccountPlace[];
  /** undefined while trips load. */
  trips: Trip[] | undefined;
  /** Home lost the connection while polling; the popup waits and says so. */
  reconnecting: boolean;
  onFinished: (note: HomeNote | null) => void;
  onChanged: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // After "Keep as ideas instead", the converted reel and places stand in until Home's reload catches up.
  const [converted, setConverted] = useState<{ reel: AccountReel; places: AccountPlace[] } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const stale = Boolean(converted && reel?.tripId);
  const current = stale ? converted!.reel : reel;
  const currentPlaces = stale ? converted!.places : places;
  const view = !current || current.status === "queued" || current.status === "processing" ? "reading"
    : current.status !== "ready" ? "recover"
    : current.tripId ? "draft"
    : currentPlaces.length ? "confirm" : "empty";
  const compact = view === "reading" || view === "recover" || view === "empty";

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  /** Close the popup for good: listed places leave the account, everything else stays. */
  async function finish(discardPlaceIds: string[], note: HomeNote | null) {
    if (!current) return;
    await api("accountReels.finishReview", { params: { reelId: current.id }, body: { discardPlaceIds } });
    dialog.current?.close();
    onFinished(note);
    await onChanged();
  }

  /**
   * × and Done keep everything, so they never trap the traveler: if recording the close fails (offline, or the
   * server can't store it yet), the popup still closes for this visit and comes back on the next one.
   */
  async function closeKeepingAll(note: HomeNote | null) {
    try {
      await finish([], note);
    } catch {
      dialog.current?.close();
      onFinished({ text: "Closed for now. It will show again next visit." });
    }
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(toError(cause));
    } finally {
      setBusy(false);
    }
  }

  function requestClose() {
    if (!current || busy) return;
    if (view === "empty") return void run(() => closeKeepingAll(null));
    const count = currentPlaces.length;
    setAsk({
      text: view === "reading" ? "Close? Places we find will be saved to your library."
        : view === "recover" ? "Close? The link stays in your saves."
        : view === "draft" ? "Close? The draft trip stays in your trips."
        : `Close and save all ${plural(count, "place")} to your library?`,
      confirm: view === "confirm" ? "Save all" : "Close",
      run: () => closeKeepingAll(view === "confirm"
        ? { text: `Saved ${plural(count, "place")} to your library.`, href: "/inspiration-library", linkLabel: "Open library" }
        : null),
    });
  }

  const askBar = ask && (
    <div className="dp-ask" role="alert">
      <span>{ask.text}</span>
      <span className="dp-ask-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAsk(null)}>Go back</button>
        <button type="button" className={`btn ${ask.danger ? "btn-danger-solid" : "btn-primary"}`} disabled={busy} onClick={() => void run(ask.run)}>
          {busy ? "Saving…" : ask.confirm}
        </button>
      </span>
    </div>
  );

  return (
    <dialog ref={dialog} className={`detected-places${compact ? " is-compact" : ""}`} aria-labelledby="detected-places-title"
      aria-busy={view === "reading"} onCancel={(event) => { event.preventDefault(); if (ask) setAsk(null); else requestClose(); }}>
      {compact
        ? <CompactView view={view} reel={current} url={url} reconnecting={reconnecting} onClose={requestClose} onChanged={onChanged}
            onDone={() => void run(() => closeKeepingAll(null))} busy={busy} footer={askBar} />
        : view === "draft"
          ? <DraftTripView reel={current!} trip={trips?.find((trip) => trip.id === current!.tripId)} onClose={requestClose} busy={busy} footer={askBar}
              onOpenTrip={(href) => run(async () => { await finish([], null); window.location.assign(href); })}
              onKeepAsIdeas={() => run(async () => {
                setConverted(await api("accountReels.keepAsIdeas", { params: { reelId: current!.id } }));
                await onChanged();
              })} />
          : <ConfirmView key={current!.id} reel={current!} places={currentPlaces} trips={trips} onClose={requestClose} busy={busy}
              footer={askBar} run={run} finish={finish}
              onCancel={() => setAsk({
                text: `Remove all ${plural(currentPlaces.length, "place")} from your account?`, confirm: "Remove all", danger: true,
                run: () => finish(currentPlaces.map((place) => place.id), { text: `Removed ${plural(currentPlaces.length, "place")}.` }),
              })} />}
      <ErrorBanner error={error} />
    </dialog>
  );
}

function CloseButton({ onClose, disabled }: { onClose: () => void; disabled?: boolean }) {
  return <button type="button" className="dp-close" aria-label="Close" disabled={disabled} onClick={onClose}><Icon name="close" size={16} /></button>;
}

function CompactView({ view, reel, url, reconnecting, onClose, onChanged, onDone, busy, footer }: {
  view: "reading" | "recover" | "empty"; reel: AccountReel | null; url: string; reconnecting: boolean;
  onClose: () => void; onChanged: () => Promise<void>; onDone: () => void; busy: boolean; footer: ReactNode;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function addDetails(event: FormEvent) {
    event.preventDefault();
    if (!reel || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      // The reel goes back to queued; reloading restarts Home's poll, which shows the reading state again.
      await api("accountReels.addDetails", { params: { reelId: reel.id }, body: { text: text.trim() } });
      setText("");
      await onChanged();
    } catch (cause) {
      setError(toError(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="dp-compact">
      <CloseButton onClose={onClose} disabled={!reel} />
      {view === "reading"
        ? <span className="dp-spinner" aria-hidden="true" />
        : <span className="dp-compact-icon" aria-hidden="true"><Icon name={view === "recover" ? "info" : "pin"} size={22} /></span>}
      <h2 id="detected-places-title">
        {view === "reading" ? "Finding places…" : view === "recover" ? "Couldn’t read this link" : "No places found"}
      </h2>
      <span className="dp-chip"><Icon name="link" size={14} /> {hostOf(url)}</span>
      {view === "reading" && reconnecting && <small className="dp-reconnecting" role="status">Reconnecting…</small>}
      {view === "recover" && !footer && <form className="dp-recover" onSubmit={addDetails}>
        <label htmlFor="dp-details" className="sr-only">Place names or caption</label>
        <textarea id="dp-details" value={text} maxLength={5000} rows={3} onChange={(event) => setText(event.target.value)}
          placeholder="Place names or the caption" />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending}>{sending ? "Sending…" : "Find places"}</button>
        <ErrorBanner error={error} />
      </form>}
      {view === "empty" && !footer && <button type="button" className="btn btn-outline" disabled={busy} onClick={onDone}>Done</button>}
      {footer}
    </div>
  );
}

function Head({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <header className="dp-head">
      <div>
        <h2 id="detected-places-title">{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <CloseButton onClose={onClose} />
    </header>
  );
}

type CardData = { id: string; name: string; category: string | null; photo: { reelId: string; tripId?: string; providerPlaceId: string } | null };

function PlaceCard({ card, index, ticked, onToggle }: { card: CardData; index: number; ticked?: boolean; onToggle?: () => void }) {
  const art = <span className={`dp-art ${ART[accountPlaceCategory(card.category)] ?? OTHER_ART[index % OTHER_ART.length]}`} aria-hidden="true" />;
  const inputId = `dp-tick-${card.id}`;
  // The card toggles too, except for its own controls and the photo's attribution links.
  const click = (event: MouseEvent) => {
    if (!onToggle || (event.target as HTMLElement).closest("a, input, label")) return;
    onToggle();
  };
  return (
    <li className={`dp-card${onToggle ? " is-pickable" : ""}${ticked === false ? " is-off" : ""}`} onClick={click}>
      <span className="dp-card-art">
        {card.photo
          ? <AccountPlacePhoto reelId={card.photo.reelId} tripId={card.photo.tripId} placeId={card.id}
              providerPlaceId={card.photo.providerPlaceId} name={card.name} fallback={art} />
          : art}
        {onToggle && <input id={inputId} type="checkbox" className="dp-tick" checked={ticked} onChange={onToggle}
          aria-label={`Keep ${card.name}`} />}
      </span>
      {onToggle ? <label htmlFor={inputId} className="dp-card-name">{card.name}</label> : <strong className="dp-card-name">{card.name}</strong>}
    </li>
  );
}

function ConfirmView({ reel, places, trips, onClose, onCancel, busy, footer, run, finish }: {
  reel: AccountReel; places: AccountPlace[]; trips: Trip[] | undefined;
  onClose: () => void; onCancel: () => void; busy: boolean; footer: ReactNode;
  run: (action: () => Promise<void>) => Promise<void>;
  finish: (discardPlaceIds: string[], note: HomeNote | null) => Promise<void>;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState(() => new Set(places.map((place) => place.id)));
  const [destination, setDestination] = useState<Destination>({ kind: "library" });

  const country = placesCountry(places);
  const choices = useMemo(() => tripChoices(trips ?? [], country), [trips, country]);
  const label = confirmLabel(ticked.size, places.length, destination);
  const pick = (next: Destination) => setDestination((current) =>
    current.kind === next.kind && (next.kind !== "trip" || (current.kind === "trip" && current.tripId === next.tripId)) ? { kind: "library" } : next);

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const confirm = () => run(async () => {
    const keep = places.filter((place) => ticked.has(place.id)).map((place) => place.id);
    const drop = places.filter((place) => !ticked.has(place.id)).map((place) => place.id);
    let note: HomeNote = keep.length
      ? { text: `Saved ${plural(keep.length, "place")} to your library.`, href: "/inspiration-library", linkLabel: "Open library" }
      : { text: `Removed ${plural(drop.length, "place")}.` };
    if (destination.kind === "trip") {
      const trip = choices.find((choice) => choice.trip.id === destination.tripId)!.trip;
      // Copies are idempotent, so a retry after a failed selection does not duplicate places.
      const { places: copies } = await api("places.copy", { params: { tripId: trip.id }, body: { accountPlaceIds: keep } });
      const confirmed = trip.selectedPlaceIds === undefined
        ? (await api("places.list", { params: { tripId: trip.id }, query: {} })).places
          .filter((place) => place.status === "confirmed").map((place) => place.id)
        : [];
      await api("places.select", { params: { tripId: trip.id }, body: { placeIds: withAdded(trip.selectedPlaceIds, confirmed, copies.map((copy) => copy.id)) } });
      note = { text: `Added ${plural(keep.length, "place")} to ${trip.title}.`, href: `/my-trip/${trip.id}/itinerary`, linkLabel: "Open trip" };
    }
    if (destination.kind === "new") {
      await finish(drop, null);
      const query = new URLSearchParams({ places: keep.join(",") });
      if (country) query.set("country", country);
      router.push(`/my-trip/new?${query}`);
      return;
    }
    await finish(drop, note);
  });

  const cards: CardData[] = places.map((place) => ({
    id: place.id, name: place.name, category: place.category,
    photo: place.mappingStatus === "pending" && place.options.length === 1
      ? { reelId: reel.id, providerPlaceId: place.options[0]!.providerPlaceId } : null,
  }));

  return <div className="dp-expanded">
    <Head title={`${plural(places.length, "place")} detected`} onClose={onClose} />
    <ul className="dp-cards" aria-label="Detected places">
      {cards.map((card, index) => <PlaceCard key={card.id} card={card} index={index} ticked={ticked.has(card.id)} onToggle={() => toggle(card.id)} />)}
    </ul>

    <section className="dp-trips" aria-labelledby="dp-trips-title">
      <div className="dp-trips-head">
        <h3 id="dp-trips-title">Add places to <span>· optional</span></h3>
        <span>{ticked.size} of {places.length} selected</span>
      </div>
      <ul className="dp-trip-list">
        <li>
          <button type="button" className="dp-trip is-new" aria-pressed={destination.kind === "new"} onClick={() => pick({ kind: "new" })}>
            <span className="dp-trip-thumb"><Icon name="plus" size={16} /></span>
            <span className="dp-trip-copy"><strong>Start a new trip</strong></span>
            <span className="dp-radio" aria-hidden="true" />
          </button>
        </li>
        {choices.map(({ trip, sameCountry }) => {
          const on = destination.kind === "trip" && destination.tripId === trip.id;
          const count = trip.selectedPlaceIds?.length;
          return <li key={trip.id}>
            <button type="button" className="dp-trip" aria-pressed={on} onClick={() => pick({ kind: "trip", tripId: trip.id })}>
              <span className="dp-trip-thumb" style={tripCoverStyle(trip.destination)} aria-hidden="true" />
              <span className="dp-trip-copy">
                <strong>{trip.title}</strong>
                <small>{[tripDateLabel(trip), count === undefined ? null : plural(count, "place"), sameCountry ? "same country" : null].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="dp-radio" aria-hidden="true" />
            </button>
          </li>;
        })}
        {!trips && <li className="dp-trip-loading">Loading your trips…</li>}
      </ul>
    </section>

    {footer ?? <footer className="dp-foot">
      <span className="dp-foot-note" />
      <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className={`btn ${ticked.size ? "btn-primary" : "btn-danger"}`} disabled={!label || busy} onClick={() => void confirm()}>
        {busy ? "Saving…" : label ?? "Tick a place"} {label && !busy && ticked.size > 0 && <Icon name="arrowRight" size={16} />}
      </button>
    </footer>}
  </div>;
}

function DraftTripView({ reel, trip, onClose, onOpenTrip, onKeepAsIdeas, busy, footer }: {
  reel: AccountReel; trip: Trip | undefined; onClose: () => void;
  onOpenTrip: (href: string) => Promise<void>; onKeepAsIdeas: () => Promise<void>; busy: boolean; footer: ReactNode;
}) {
  const tripId = reel.tripId!;
  const tripPlaces = useApi("places.list", { params: { tripId }, query: {} });
  const places = (tripPlaces.data?.places ?? []).filter((place) => place.status !== "rejected");
  const convertible = !trip || trip.status === "draft";

  return <div className="dp-expanded">
    <Head title="Itinerary detected" onClose={onClose} sub={trip ? `Draft trip: ${trip.title}` : undefined} />
    {tripPlaces.error ? <ErrorBanner error={tripPlaces.error} />
      : !tripPlaces.data ? <p className="dp-loading">Loading places…</p>
      : <ul className="dp-cards" aria-label="Places in the draft trip">
          {places.map((place, index) => <PlaceCard key={place.id} card={draftCard(place, reel.id, tripId)} index={index} />)}
        </ul>}
    {footer ?? <footer className="dp-foot">
      <span className="dp-foot-note" />
      {convertible && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void onKeepAsIdeas()}>
        Keep as ideas instead
      </button>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onOpenTrip(`/my-trip/${tripId}/itinerary`)}>
        Open trip <Icon name="arrowRight" size={16} />
      </button>
    </footer>}
  </div>;
}

function draftCard(place: CandidatePlace, reelId: string, tripId: string): CardData {
  const evidence = place.evidence[0];
  const match = place.selected ?? (place.options.length === 1 ? place.options[0]! : null);
  return {
    id: place.id, name: place.name,
    category: evidence?.classification?.category?.value ?? match?.details.category ?? null,
    photo: match ? { reelId, tripId, providerPlaceId: match.providerPlaceId } : null,
  };
}
