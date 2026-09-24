"use client";

import type { AccountPlace, AddPlaceSource, CandidatePlace, Itinerary, PlaceOption, PublicStop, Trip } from "@reel/contracts";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { PlaceImage } from "@/components/PlacePhoto";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { accountPlaceCategory } from "@/features/library/account-library-model";
import { placeArea, placeCategory, reusableAccountPlaces, reusablePlaces } from "@/features/trips/PickPlacesStep";

// Choosing a place while editing a day (add to the day, or swap a stop for it). Places come from this trip
// (planned or not), the account's saves in the same country, or a Places provider search. A place with several
// matching branches asks which one before it is used; the choice is confirmed by the server in the same save.

export type PickerTarget = { type: "day"; date: string; day: number } | { type: "replace"; stop: PublicStop };

export interface PlaceChoice {
  source: AddPlaceSource;
  /** Set when the traveler picked one of several branches. */
  providerPlaceId?: string;
  name: string;
  /** A trip place that needs no branch choice; a swap to it can be previewed before saving. */
  tripPlaceId?: string;
}

interface Row {
  key: string;
  source: AddPlaceSource;
  name: string;
  detail: string;
  note?: { tone: "neutral" | "info" | "warning"; label: string };
  /** Branches to choose from; empty when the place already has one match or a confirmed branch. */
  branches: PlaceOption[];
  /** No provider match: it cannot be put on a map or timed. */
  unlocated: boolean;
  image: ReactNode;
  tripPlaceId?: string;
}

type Tab = "trip" | "saved" | "search";

export function PlacePickerDialog({ trip, itinerary, tripPlaces, target, busy, onPick, onClose }: {
  trip: Trip;
  itinerary: Itinerary;
  /** Every place in this trip, rejected ones included (they are left out here). */
  tripPlaces: CandidatePlace[];
  target: PickerTarget;
  busy: boolean;
  /** Resolves true when the place was added, so the picker can close. */
  onPick: (choice: PlaceChoice) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("trip");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  const scheduled = new Set(itinerary.days.flatMap((day) => day.stops.flatMap((stop) => stop.placeId ?? [])));
  const unscheduled = new Set(itinerary.unscheduledPlaceIds);
  const available = tripPlaces.filter((place) => place.status !== "rejected");
  const tripRows = available.filter((place) => !scheduled.has(place.id)).map((place) => tripRow(place, unscheduled.has(place.id)));
  const title = target.type === "day" ? `Add a place to day ${target.day}` : `Swap ${target.stop.title}`;
  const needle = query.trim().toLocaleLowerCase();
  const matches = (row: Row) => !needle || `${row.name} ${row.detail}`.toLocaleLowerCase().includes(needle);

  async function pick(row: Row, branch?: PlaceOption) {
    if (row.branches.length > 1 && !branch) {
      setOpen(open === row.key ? null : row.key);
      return;
    }
    const added = await onPick({
      source: row.source,
      name: branch?.name ?? row.name,
      ...(branch ? { providerPlaceId: branch.providerPlaceId } : {}),
      ...(row.tripPlaceId && !branch ? { tripPlaceId: row.tripPlaceId } : {}),
    });
    if (added) onClose();
  }

  const list = (rows: Row[], empty: string) => {
    const shown = rows.filter(matches);
    if (shown.length === 0) return <p className="muted small place-picker-empty">{rows.length === 0 ? empty : "No places match your search."}</p>;
    return (
      <ul className="place-picker-list">
        {shown.map((row) => (
          <li key={row.key}>
            <div className="place-picker-row">
              {row.image}
              <span className="place-picker-text">
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
                {row.note && <Badge tone={row.note.tone}>{row.note.label}</Badge>}
              </span>
              <button type="button" className="btn btn-small" disabled={busy || row.unlocated} aria-expanded={row.branches.length > 1 ? open === row.key : undefined}
                aria-label={`${row.branches.length > 1 ? "Choose a branch of" : target.type === "day" ? "Add" : "Swap in"} ${row.name}`} onClick={() => void pick(row)}>
                {row.unlocated ? "No location" : row.branches.length > 1 ? "Choose branch" : target.type === "day" ? <><Icon name="plus" size={15} /> Add</> : "Swap in"}
              </button>
            </div>
            {open === row.key && (
              <ul className="place-picker-branches" aria-label={`Branches of ${row.name}`}>
                {row.branches.map((branch) => (
                  <li key={branch.providerPlaceId}>
                    <span><strong>{branch.name}</strong><small>{branch.address ?? "Address not available"}{branch.details.provider === "fixture" ? " · synthetic sample" : ""}</small></span>
                    <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void pick(row, branch)}>Use this branch</button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <dialog ref={dialog} className="place-picker" aria-labelledby="place-picker-title" onCancel={(event) => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onClose();
    }}>
      <header className="place-picker-head">
        <div>
          <h2 id="place-picker-title">{title}</h2>
          <p className="muted small">{target.type === "day" ? "It goes at the end of the day; drag it into place afterwards." : "The new place takes this stop's slot. Times are re-checked."}</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      <div className="place-picker-tools">
        <div className="segmented" role="tablist" aria-label="Where from">
          <button type="button" role="tab" aria-selected={tab === "trip"} aria-pressed={tab === "trip"} onClick={() => setTab("trip")}>This trip</button>
          <button type="button" role="tab" aria-selected={tab === "saved"} aria-pressed={tab === "saved"} onClick={() => setTab("saved")}>Saved places</button>
          <button type="button" role="tab" aria-selected={tab === "search"} aria-pressed={tab === "search"} onClick={() => setTab("search")}>Search</button>
        </div>
        {tab !== "search" && (
          <label className="field-icon place-picker-search">
            <span className="sr-only">Filter places</span>
            <Icon name="search" size={17} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or area" />
          </label>
        )}
      </div>
      <div className="place-picker-body" role="tabpanel">
        {tab === "trip"
          ? list(tripRows, "Every place in this trip is already on a day. Try Saved places or Search.")
          : tab === "saved"
            ? <SavedPlaces trip={trip} current={available} list={list} />
            : <SearchPlaces trip={trip} busy={busy} onPick={(row) => void pick(row)} />}
      </div>
    </dialog>
  );
}

function SavedPlaces({ trip, current, list }: { trip: Trip; current: CandidatePlace[]; list: (rows: Row[], empty: string) => ReactNode }) {
  const saved = useApi("places.listSaved", {});
  const library = useApi("accountReels.list", {});
  const trips = useApi("trips.list", {});
  if (saved.error || library.error || trips.error) return <ErrorBanner error={saved.error ?? library.error ?? trips.error} />;
  if (!saved.data || !library.data || !trips.data) return <Loading />;
  const rows = [
    ...reusablePlaces(trip, current, saved.data.places, trips.data.trips).map((place) => savedRow(place, trips.data!.trips)),
    ...reusableAccountPlaces(trip, current, library.data.places, library.data.reels).map(({ place }) => accountRow(place)),
  ];
  return list(rows, "No saved places in this country yet. Save a reel or add places to another trip first.");
}

/**
 * Look a place up by name with the Places provider. Searching is explicit (a button, not per keystroke)
 * because every search is a paid provider call; results are candidates until the traveler picks one.
 */
function SearchPlaces({ trip, busy, onPick }: { trip: Trip; busy: boolean; onPick: (row: Row) => void }) {
  const [draft, setDraft] = useState("");
  const [searched, setSearched] = useState<{ query: string; results: PlaceOption[] } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    const query = draft.trim();
    if (query.length < 2 || searching) return;
    setSearching(true);
    setError(null);
    try {
      const { results } = await api("places.search", { params: { tripId: trip.id }, query: { q: query } });
      setSearched({ query, results });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setSearching(false);
    }
  }

  const rows = searched?.results.map((option): Row => ({
    key: `search:${option.providerPlaceId}`,
    source: { kind: "search", query: searched.query, providerPlaceId: option.providerPlaceId },
    name: option.name,
    detail: [option.details.category?.replace(/_/g, " "), option.address].filter(Boolean).join(" · ") || "Address not available",
    ...(option.details.provider === "fixture" ? { note: { tone: "warning" as const, label: "Synthetic sample, not a real place" } } : {}),
    branches: [],
    unlocated: false,
    image: <PlaceImage photo={option.details.photos[0]} category={option.details.category} className="place-picker-art" size="sm" />,
  })) ?? [];
  const attribution = [...new Set(searched?.results.map((option) => option.details.attribution).filter(Boolean))];

  return (
    <div className="place-picker-search-tab">
      <form className="place-picker-search-form" onSubmit={(e) => void search(e)}>
        <label className="field-icon place-picker-search" htmlFor="place-search-input">
          <span className="sr-only">Place name</span>
          <Icon name="search" size={17} />
          <input id="place-search-input" type="search" minLength={2} maxLength={120} required value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`A place in ${trip.destination}`} />
        </label>
        <button className="btn btn-primary" disabled={searching || draft.trim().length < 2}>{searching ? "Searching…" : "Search"}</button>
      </form>
      <ErrorBanner error={error} />
      {searched && (rows.length === 0
        ? <p className="muted small place-picker-empty">No places found for “{searched.query}”. Try the full name, or add the area.</p>
        : (
          <ul className="place-picker-list" aria-label={`Results for ${searched.query}`}>
            {rows.map((row) => (
              <li key={row.key}>
                <div className="place-picker-row">
                  {row.image}
                  <span className="place-picker-text">
                    <strong>{row.name}</strong>
                    <small>{row.detail}</small>
                    {row.note && <Badge tone={row.note.tone}>{row.note.label}</Badge>}
                  </span>
                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => onPick(row)} aria-label={`Use ${row.name}`}>Use this</button>
                </div>
              </li>
            ))}
          </ul>
        ))}
      {attribution.length > 0 && <p className="fineprint">{attribution.join(" · ")}</p>}
      {!searched && <p className="muted small">Search by name. Choosing a result confirms that exact place and saves your search with it.</p>}
    </div>
  );
}

const branchesOf = (place: { selected?: PlaceOption | null; options: PlaceOption[] }) => (place.selected ? [] : place.options.length > 1 ? place.options : []);

function tripRow(place: CandidatePlace, didNotFit: boolean): Row {
  const unlocated = !place.selected && place.options.length === 0;
  const branches = branchesOf(place);
  return {
    key: `trip:${place.id}`,
    source: { kind: "trip", placeId: place.id },
    name: place.selected?.name ?? place.name,
    detail: `${placeCategory(place)} · ${placeArea(place)}`,
    note: unlocated ? { tone: "warning", label: "No location found" } : branches.length ? { tone: "info", label: `${branches.length} possible branches` } : didNotFit ? { tone: "neutral", label: "Didn't fit" } : place.status !== "confirmed" ? { tone: "neutral", label: "Not confirmed" } : undefined,
    branches,
    unlocated,
    image: <PlaceImage photo={place.selected?.details.photos[0]} category={place.selected?.details.category} className="place-picker-art" size="sm" />,
    ...(branches.length === 0 && !unlocated ? { tripPlaceId: place.id } : {}),
  };
}

function savedRow(place: CandidatePlace, trips: Trip[]): Row {
  const from = trips.find((trip) => trip.id === place.tripId);
  const branches = branchesOf(place);
  return {
    key: `saved:${place.id}`,
    source: { kind: "saved", placeId: place.id },
    name: place.selected?.name ?? place.name,
    detail: `${placeCategory(place)} · ${placeArea(place)}`,
    note: { tone: "neutral", label: from ? `From ${from.title}` : "Saved place" },
    branches,
    unlocated: !place.selected && place.options.length === 0,
    image: <PlaceImage photo={place.selected?.details.photos[0]} category={place.selected?.details.category} className="place-picker-art" size="sm" />,
  };
}

function accountRow(place: AccountPlace): Row {
  const only = place.options.length === 1 ? place.options[0]! : null;
  return {
    key: `account:${place.id}`,
    source: { kind: "account", accountPlaceId: place.id },
    name: only?.name ?? place.name,
    detail: `${accountPlaceCategory(place.category)} · ${place.area ?? only?.address ?? "Area unknown"}`,
    note: { tone: "neutral", label: "From your library" },
    branches: place.options.length > 1 ? place.options : [],
    unlocated: place.options.length === 0,
    image: <PlaceImage photo={only?.details.photos[0]} category={only?.details.category ?? place.category} className="place-picker-art" size="sm" />,
  };
}
