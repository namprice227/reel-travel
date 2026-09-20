"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, Empty, ErrorBanner, Loading, type Tone } from "@/components/ui";
import { formatDateSpan, tripGroup, tripStatusLabel, type TripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// Every trip at /my-trip/all (design "Sky 3 · 02 All trips"): filter, search and sort, grouped by year.

type Filter = "all" | "upcoming" | "draft" | "past";
type Sort = "newest" | "oldest" | "name";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "draft", label: "Drafts" },
  { id: "past", label: "Past" },
];
const TONE: Record<TripGroup, Tone> = { current: "success", upcoming: "info", draft: "neutral", past: "neutral" };
// "Upcoming" includes a trip that is happening now.
const inFilter = (trip: Trip, filter: Filter) => filter === "all" || (filter === "upcoming" ? ["current", "upcoming"].includes(tripGroup(trip)) : tripGroup(trip) === filter);

export function AllTripsPage() {
  const trips = useApi("trips.list", {});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const list = trips.data?.trips ?? [];

  const q = query.trim().toLowerCase();
  const shown = list
    .filter((t) => inFilter(t, filter))
    .filter((t) => !q || `${t.title} ${t.destination}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate)));
  const years = sort === "name" ? [["", shown] as const] : [...new Set(shown.map((t) => t.startDate.slice(0, 4)))].map((y) => [y, shown.filter((t) => t.startDate.startsWith(y))] as const);

  return (
    <div className="fit-page all-trips-page">
      <header className="trips-head">
        <div>
          <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={16} /> My trips</Link>
          <h1>All trips</h1>
        </div>
        <Link className="btn btn-primary" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
      </header>

      <div className="all-trips-toolbar">
        <div className="filter-chips" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} · {list.filter((t) => inFilter(t, f.id)).length}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="field-icon all-trips-search">
            <span className="sr-only">Search trips</span>
            <Icon name="search" size={18} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trips or places" />
          </label>
          <label className="sr-only" htmlFor="all-trips-sort">Sort trips</label>
          <select id="all-trips-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <ErrorBanner error={trips.error} />
      {trips.loading && !trips.data ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty title={list.length ? "No trips match" : "No trips yet"}>{list.length ? "Try another search or filter." : "Create a trip to get started."}</Empty>
      ) : (
        <div className="card all-trips-list panel-scroll fit-fill">
          {years.map(([year, trips]) => (
            <section key={year || "all"} aria-label={year || "Trips"}>
              {year && <p className="all-trips-year">{year} · {trips.length} {trips.length === 1 ? "trip" : "trips"}</p>}
              <ul>
                {trips.map((trip) => (
                  <li key={trip.id}>
                    <Link href={`/my-trip/${trip.id}/itinerary`} className="all-trips-row">
                      <CoverArt seed={trip.destination} className={`all-trips-thumb${tripGroup(trip) === "past" ? " is-past" : ""}`} showLabel={false} />
                      <span className="all-trips-name"><strong>{trip.title}</strong><small>{trip.destination}</small></span>
                      <span>{formatDateSpan(trip.startDate, trip.endDate)}</span>
                      <span><Badge tone={TONE[tripGroup(trip)]}>{tripStatusLabel(trip)}</Badge></span>
                      <Icon name="chevronRight" size={18} className="all-trips-chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
