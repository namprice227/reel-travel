"use client";

import { SUPPORTED_COUNTRIES, type AccountPlace, type AccountReel, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { tripLength } from "@/lib/trip-dates";

export const HOME_SHELF_ID = "saved-reels";

/** Expand the shelf and bring it into view, e.g. from a Home save tile. */
export function openHomeShelf() {
  const shelf = document.getElementById(HOME_SHELF_ID);
  if (!(shelf instanceof HTMLDetailsElement)) return;
  shelf.open = true;
  shelf.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function status(reel: AccountReel) {
  if (reel.status === "queued" || reel.status === "processing") return "Reading reel…";
  if (reel.status === "ready" && reel.tripId) return "Itinerary · trip draft created";
  if (reel.status === "ready" && reel.format === "itinerary") return "Itinerary · saved as place ideas";
  if (reel.status === "ready") return "Place ideas found";
  if (reel.status === "failed") return "Extraction failed";
  return "Needs source details";
}

function ReelCard({ reel, places, trip, onReload }: {
  /** undefined while trips load; null when the draft trip was deleted. */
  reel: AccountReel; places: AccountPlace[]; trip: Trip | null | undefined; onReload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("accountReels.addDetails", { params: { reelId: reel.id }, body: { text: text.trim() } });
      setText("");
      await onReload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function keepAsIdeas() {
    if (busy || !window.confirm("Delete the draft trip made from this reel and keep its places as ideas instead?")) return;
    setBusy(true);
    setError(null);
    try {
      await api("accountReels.keepAsIdeas", { params: { reelId: reel.id } });
      await onReload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm("Delete this saved reel and its account place ideas?")) return;
    setBusy(true);
    setError(null);
    try {
      await api("accountReels.delete", { params: { reelId: reel.id } });
      await onReload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
      setBusy(false);
    }
  }

  return <li className="card account-reel-card">
    <div className="account-reel-top">
      <span className="account-reel-icon"><Icon name="link" size={20} /></span>
      <div><strong>{new URL(reel.url).hostname}</strong><small>{new Date(reel.createdAt).toLocaleDateString()}</small></div>
      <span className={`badge badge-${reel.status === "ready" ? "success" : reel.status === "queued" || reel.status === "processing" ? "info" : "warning"}`}>{status(reel)}</span>
      <button type="button" className="btn btn-ghost btn-small account-reel-delete" aria-label="Delete saved reel"
        disabled={busy} onClick={() => void remove()}><Icon name="trash" size={16} /> Delete</button>
    </div>
    <a className="account-reel-source" href={reel.url} target="_blank" rel="noopener noreferrer">{reel.url}</a>
    {reel.failureMessage && <p className="account-reel-message" role="status">{reel.failureMessage}</p>}
    {reel.tripId && trip === null && <p className="account-reel-message" role="status">The draft trip made from this reel was deleted.</p>}
    {reel.status === "ready" && reel.format === "itinerary" && !reel.tripId && <p className="account-reel-message" role="status">
      This itinerary is for a destination trips don&apos;t cover yet, so its places were saved as ideas in your Inspiration Library.
      Trips are available for {SUPPORTED_COUNTRIES.map((country) => country.name).join(", ")}.
    </p>}
    {reel.tripId && trip !== null && <div className="account-reel-trip" role="status">
      <p>
        <Icon name="sparkle" size={16} />{" "}
        This reel is a day-by-day itinerary, so it became a draft trip
        {trip ? <>: <strong>{trip.title}</strong>{tripLength(trip) ? ` · ${tripLength(trip)} days` : ""} · {trip.destination}</> : ""}.
        Add your dates to plan it.
      </p>
      <div className="account-reel-trip-actions">
        <Link className="btn btn-primary btn-small" href={`/my-trip/${reel.tripId}/itinerary`}>Open trip</Link>
        {(!trip || trip.status === "draft") && <button type="button" className="btn btn-ghost btn-small" disabled={busy}
          onClick={() => void keepAsIdeas()}>Keep as ideas instead</button>}
      </div>
    </div>}
    {(reel.status === "needs_input" || reel.status === "failed") && <form className="account-reel-recovery" onSubmit={recover}>
      <label htmlFor={`details-${reel.id}`}>Add place names or the reel caption</label>
      <textarea id={`details-${reel.id}`} value={text} maxLength={5000} onChange={(event) => setText(event.target.value)}
        placeholder="For example: the cafe named in the reel, and any area it mentions" />
      <button type="submit" className="btn btn-outline btn-small" disabled={!text.trim() || busy}>Find places from these details</button>
    </form>}
    {places.length > 0 && <ul className="account-place-list">{places.map((place) => <li key={place.id}>
      <Icon name="pin" size={17} />
      <span><strong>{place.name}</strong><small>{place.area ?? "Area unknown"} · {place.category ?? "Type unknown"} · Location unverified</small>
        {place.excerpt && <em>“{place.excerpt}”</em>}
      </span>
    </li>)}</ul>}
    <ErrorBanner error={error} />
  </li>;
}

export function HomeReelShelf({ reels, places, trips, onReload }: {
  reels: AccountReel[]; places: AccountPlace[]; trips?: Trip[]; onReload: () => Promise<void>;
}) {
  return <details id={HOME_SHELF_ID} className="home-reel-shelf">
    <summary>Saved to your account · {reels.length} {reels.length === 1 ? "reel" : "reels"}, {places.length} {places.length === 1 ? "place idea" : "place ideas"}</summary>
    <ul className="account-reel-list">{reels.map((reel) => <ReelCard key={reel.id} reel={reel}
      places={places.filter((place) => place.reelId === reel.id)}
      trip={trips ? trips.find((trip) => trip.id === reel.tripId) ?? null : undefined} onReload={onReload} />)}</ul>
  </details>;
}
