"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, ErrorBanner, Loading, type Tone } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { startKey, tripDateLabel, tripGroup, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { TripsToolbar } from "./TripsToolbar";
import { TripCoverArt } from "./TripCoverArt";
import { deleteTripWithConfirmation } from "./delete-trip";

type Filter = "all" | "current" | "upcoming" | "past";
type Sort = "newest" | "oldest" | "name";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "current", label: "Current" },
  { id: "upcoming", label: "Upcoming" }, { id: "past", label: "Past" },
];
const TONE: Record<TripGroup, Tone> = { current: "success", upcoming: "info", draft: "neutral", past: "neutral" };
const STATUS: Record<TripGroup, string> = { current: "Happening now", upcoming: "Itinerary saved", draft: "In planning", past: "Past" };
const inFilter = (trip: Trip, filter: Filter) => filter === "all" || (filter === "upcoming" ? ["upcoming", "draft"].includes(tripGroup(trip)) : tripGroup(trip) === filter);

export function AllTripsPage() {
  const trips = useApi("trips.list", {});
  const params = useSearchParams();
  const filter = FILTERS.find((f) => f.id === params.get("filter"))?.id ?? "all";
  const query = params.get("q") ?? "";
  const sort: Sort = params.get("sort") === "oldest" ? "oldest" : params.get("sort") === "name" ? "name" : "newest";
  const [retrying, setRetrying] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const list = trips.data?.trips ?? [];
  const q = query.trim().toLowerCase();
  const shown = list.filter((t) => inFilter(t, filter))
    .filter((t) => !q || `${t.title} ${t.destination}`.toLowerCase().includes(q))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "oldest" ? startKey(a).localeCompare(startKey(b)) : startKey(b).localeCompare(startKey(a)));
  // Undated drafts from video itineraries get their own group.
  const yearOf = (t: Trip) => t.startDate?.slice(0, 4) ?? "Dates not set";
  const years = sort === "name" ? [["", shown] as const] : [...new Set(shown.map(yearOf))].map((year) => [year, shown.filter((t) => yearOf(t) === year)] as const);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, "", `/my-trip/all${next.size ? `?${next}` : ""}`);
    if (scroll.current) scroll.current.scrollTop = 0;
  }
  useEffect(() => {
    if (trips.data && scroll.current) scroll.current.scrollTop = Number(window.history.state?.tripListScroll ?? 0);
  }, [trips.data]);

  async function removeTrip(trip: Trip) {
    if (deletingId) return;
    setDeleteError(null);
    setDeletingId(trip.id);
    try {
      if (await deleteTripWithConfirmation(trip)) trips.setData({ trips: list.filter((item) => item.id !== trip.id) });
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fit-page all-trips-page">
      <TripsToolbar active="all" count={trips.data?.trips.length} />
      <div className="all-trips-toolbar">
        <div className="filter-chips" role="group" aria-label="Filter trips">
          {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => update("filter", f.id)}>{f.label} <span>{list.filter((t) => inFilter(t, f.id)).length}</span></button>)}
        </div>
        <div className="all-trips-search-controls">
          <label className="field-icon all-trips-search"><span className="sr-only">Search trip or destination</span><Icon name="search" size={18} /><input type="search" value={query} onChange={(e) => update("q", e.target.value)} placeholder="Search trip or destination" /></label>
          <label className="sr-only" htmlFor="all-trips-sort">Sort trips</label>
          <select id="all-trips-sort" value={sort} onChange={(e) => update("sort", e.target.value)}><option value="newest">Latest departure</option><option value="oldest">Earliest departure</option><option value="name">Name</option></select>
        </div>
      </div>
      {trips.error && <div className="trips-error"><ErrorBanner error={trips.error} /><button type="button" className="btn btn-outline" disabled={retrying} onClick={async () => { setRetrying(true); try { await trips.reload(); } finally { setRetrying(false); } }}>{retrying ? "Trying again…" : "Try again"}</button></div>}
      <ErrorBanner error={deleteError} />
      {trips.loading && !trips.data ? <Loading label="Loading trips…" /> : !trips.data ? null : shown.length === 0 ? (
        <div className="trips-filter-empty" role="status"><p>{list.length ? "No trips match your search or filter." : "No trips yet."}</p>{list.length ? <button className="btn btn-outline" onClick={() => window.history.replaceState(null, "", "/my-trip/all")}>Clear filters</button> : <Link className="btn btn-primary" href="/my-trip/new">Create a trip</Link>}</div>
      ) : (
        <div ref={scroll} className="card all-trips-list panel-scroll fit-fill">
          {years.map(([year, group]) => <section key={year || "all"} aria-label={year || "Trips"}>
            {year && <h2 className="all-trips-year">{year}</h2>}
            <ul>{group.map((trip) => <li key={trip.id} className="all-trips-item">
              <Link className="all-trips-row" href={`/my-trip/${trip.id}/itinerary`} onClick={() => window.history.replaceState({ ...window.history.state, tripListScroll: scroll.current?.scrollTop ?? 0 }, "")}>
                <TripCoverArt trip={trip} className={`all-trips-thumb${tripGroup(trip) === "past" ? " is-past" : ""}`} showLabel={false} />
                <span className="all-trips-name"><strong>{trip.title}</strong><small>{trip.destination}</small></span>
                <span className="all-trips-dates">{tripDateLabel(trip)}</span>
                <span className="all-trips-status"><Badge tone={TONE[tripGroup(trip)]}>{STATUS[tripGroup(trip)]}</Badge></span>
                <Icon name="chevronRight" size={18} className="all-trips-chevron" />
              </Link>
              <button type="button" className="icon-btn btn-danger all-trips-delete" aria-label={`Delete trip ${trip.title}`}
                title={`Delete ${trip.title}`} disabled={deletingId !== null} onClick={() => void removeTrip(trip)}>
                <Icon name="trash" size={17} />
              </button>
            </li>)}</ul>
          </section>)}
        </div>
      )}
    </div>
  );
}
