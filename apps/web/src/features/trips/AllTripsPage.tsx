"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner, Loading, type Tone } from "@/components/ui";
import { formatDateSpan, tripGroup, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { TripsToolbar } from "./TripsToolbar";

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
  const scroll = useRef<HTMLDivElement>(null);
  const list = trips.data?.trips ?? [];
  const q = query.trim().toLowerCase();
  const shown = list.filter((t) => inFilter(t, filter))
    .filter((t) => !q || `${t.title} ${t.destination}`.toLowerCase().includes(q))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate));
  const years = sort === "name" ? [["", shown] as const] : [...new Set(shown.map((t) => t.startDate.slice(0, 4)))].map((year) => [year, shown.filter((t) => t.startDate.startsWith(year))] as const);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, "", `/my-trip/all${next.size ? `?${next}` : ""}`);
    if (scroll.current) scroll.current.scrollTop = 0;
  }
  useEffect(() => {
    if (trips.data && scroll.current) scroll.current.scrollTop = Number(window.history.state?.tripListScroll ?? 0);
  }, [trips.data]);

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
      {trips.loading && !trips.data ? <Loading label="Loading trips…" /> : !trips.data ? null : shown.length === 0 ? (
        <div className="trips-filter-empty" role="status"><p>{list.length ? "No trips match your search or filter." : "No trips yet."}</p>{list.length ? <button className="btn btn-outline" onClick={() => window.history.replaceState(null, "", "/my-trip/all")}>Clear filters</button> : <Link className="btn btn-primary" href="/my-trip/new">Create a trip</Link>}</div>
      ) : (
        <div ref={scroll} className="card all-trips-list panel-scroll fit-fill">
          {years.map(([year, group]) => <section key={year || "all"} aria-label={year || "Trips"}>
            {year && <h2 className="all-trips-year">{year}</h2>}
            <ul>{group.map((trip) => <li key={trip.id}>
              <Link className="all-trips-row" href={`/my-trip/${trip.id}/itinerary`} onClick={() => window.history.replaceState({ ...window.history.state, tripListScroll: scroll.current?.scrollTop ?? 0 }, "")}>
                <CoverArt seed={trip.destination} className={`all-trips-thumb${tripGroup(trip) === "past" ? " is-past" : ""}`} showLabel={false} />
                <span className="all-trips-name"><strong>{trip.title}</strong><small>{trip.destination}</small></span>
                <span className="all-trips-dates">{formatDateSpan(trip.startDate, trip.endDate)}</span>
                <span className="all-trips-status"><Badge tone={TONE[tripGroup(trip)]}>{STATUS[tripGroup(trip)]}</Badge></span>
                <Icon name="chevronRight" size={18} className="all-trips-chevron" />
              </Link>
            </li>)}</ul>
          </section>)}
        </div>
      )}
    </div>
  );
}
