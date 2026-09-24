"use client";

import type { AccountPlace, AddPlaceSource, CandidatePlace, Itinerary, PlaceOption, PublicStop, Trip } from "@reel/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { PlaceImage } from "@/components/PlacePhoto";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import { accountPlaceCategory } from "@/features/library/account-library-model";
import { placeArea, placeCategory, reusableAccountPlaces, reusablePlaces } from "@/features/trips/PickPlacesStep";

// Choosing a place while editing a day (add to the day, or swap a stop for it). Places come from this trip
// (planned or not) or from the account's saves in the same country. A place with several matching branches
// asks which one before it is used; the choice is confirmed by the server in the same save.

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

type Tab = "trip" | "saved";

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
        </div>
        <label className="field-icon place-picker-search">
          <span className="sr-only">Filter places</span>
          <Icon name="search" size={17} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or area" />
        </label>
      </div>
      <div className="place-picker-body" role="tabpanel">
        {tab === "trip"
          ? list(tripRows, "Every place in this trip is already on a day. Try Saved places.")
          : <SavedPlaces trip={trip} current={available} list={list} />}
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
