"use client";

import { MAX_SCREENSHOT_BYTES, SCREENSHOT_CONTENT_TYPES, type AccountPlace, type AccountReel, type CandidatePlace, type Inspiration, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon, type IconName } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { accountPlaceCategory } from "@/features/library/account-library-model";
import { destinationLocation } from "@/features/library/library-model";
import { sourceLabels } from "@/features/places/source-labels";
import { outsideTripCity } from "./trip-city";

/**
 * Builder step 1 (design "P-B"): pick places for this trip from one table, and add new ones beside it.
 *
 * The table lists this trip's places and the account's saved places in the same country. Ticking a
 * saved place from another trip copies it in when the traveler continues; nothing is copied before.
 * Places found in something new land in the table already ticked, unless their address is outside the
 * trip's city: a trip plans one city, so those are flagged and left for the traveler to tick.
 */

type Filter = "all" | "trip" | "saved" | "selected";
type Row =
  | { kind: "trip"; place: CandidatePlace }
  | { kind: "saved"; place: CandidatePlace }
  | { kind: "account"; place: AccountPlace; reel: AccountReel };

export function PickPlacesStep({ trip, places, saves, onTripSaved, onPlacesChanged, onDraftChange, onNext }: {
  trip: Trip;
  /** This trip's places, rejected ones already removed. */
  places: CandidatePlace[];
  saves: Inspiration[];
  onTripSaved: (trip: Trip) => void;
  onPlacesChanged: () => Promise<void>;
  onDraftChange?: (count: number) => void;
  onNext: () => void;
}) {
  const savedPlaces = useApi("places.listSaved", {});
  const accountLibrary = useApi("accountReels.list", {}, {
    pollMs: ({ reels }) => reels.some((reel) => reel.status === "queued" || reel.status === "processing") ? 1500 : false,
  });
  const accountTrips = useApi("trips.list", {});
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(trip.selectedPlaceIds ?? places.filter((p) => p.status === "confirmed").map((p) => p.id)));
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Places that appear after the step opened came from something just added: tick those in the trip's city.
  const known = useRef(new Set(places.map((p) => p.id)));
  const placeIds = places.map((p) => p.id).join(",");
  useEffect(() => {
    const fresh = places.filter((p) => !known.current.has(p.id));
    if (!fresh.length) return;
    fresh.forEach((p) => known.current.add(p.id));
    const inCity = fresh.filter((p) => !outsideTripCity(p, trip.destination));
    if (inCity.length) setTicked((current) => new Set([...current, ...inCity.map((p) => p.id)]));
  }, [placeIds]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the id list, not the array identity

  const reusable = reusablePlaces(trip, places, savedPlaces.data?.places ?? [], accountTrips.data?.trips ?? []);
  const accountReusable = reusableAccountPlaces(
    trip,
    places,
    accountLibrary.data?.places ?? [],
    accountLibrary.data?.reels ?? [],
  );
  const rows: Row[] = [
    ...places.map((place): Row => ({ kind: "trip", place })),
    ...accountReusable.map(({ place, reel }): Row => ({ kind: "account", place, reel })),
    ...reusable.map((place): Row => ({ kind: "saved", place })),
  ];
  const chosen = rows.filter((row) => ticked.has(row.place.id));
  const canSave = chosen.length > 0 || (trip.selectedPlaceIds ?? places.filter((p) => p.status === "confirmed").map((p) => p.id)).length > 0;
  const shown = rows.filter((row) => filter === "all" || (filter === "trip" && row.kind === "trip") || (filter === "saved" && row.kind !== "trip") || (filter === "selected" && ticked.has(row.place.id)));
  const withoutLocation = chosen.filter((row) => !rowHasLocation(row)).length;
  const country = destinationLocation(trip.destination).country;
  const awayInTrip = places.filter((p) => outsideTripCity(p, trip.destination));
  const tripCity = destinationLocation(trip.destination).city;

  useEffect(() => { onDraftChange?.(chosen.length); }, [chosen.length, onDraftChange]);

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function continuePlanning() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const copyIds = chosen.filter((row) => row.kind === "saved").map((row) => row.place.id);
      const accountPlaceIds = chosen.filter((row) => row.kind === "account").map((row) => row.place.id);
      const copied = copyIds.length || accountPlaceIds.length
        ? (await api("places.copy", { params: { tripId: trip.id }, body: { placeIds: copyIds, accountPlaceIds } })).places
        : [];
      const placeIds = [...new Set([...chosen.filter((row) => row.kind === "trip").map((row) => row.place.id), ...copied.map((p) => p.id)])];
      const { trip: updated } = await api("places.select", { params: { tripId: trip.id }, body: { placeIds, expectedUpdatedAt: trip.updatedAt } });
      onTripSaved(updated);
      await onPlacesChanged();
      onNext();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setBusy(false);
    }
  }

  const filters: Array<[Filter, string, number]> = [
    ["all", "All", rows.length],
    ["trip", "In this trip", places.length],
    ["saved", "Saved ideas", reusable.length + accountReusable.length],
    ["selected", "Selected", chosen.length],
  ];

  return (
    <div className="pick">
      <section className="pick-main panel-scroll" aria-labelledby="pick-title">
        <header className="builder-head">
          <h1 id="pick-title">Pick places for this trip</h1>
          <p>Tick the places you want to visit. Your saved places in {country === "Unsorted" ? "this country" : country} are here too.</p>
        </header>
        <div className="pick-filters" role="group" aria-label="Show">
          {filters.map(([id, label, count]) => (id === "saved" && !count && filter !== "saved") ? null : (
            <button key={id} type="button" className="pick-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} · {count}</button>
          ))}
        </div>
        <ErrorBanner error={error ?? savedPlaces.error ?? accountLibrary.error} />
        {awayInTrip.length > 0 && tripCity && (
          <p className="banner banner-warning small" role="status">
            {awayInTrip.length} {awayInTrip.length === 1 ? "place has an address" : "places have addresses"} outside {tripCity}.
            This trip plans one city, so new ones aren’t ticked. Tick them only if you’ll travel there.
          </p>
        )}
        {rows.length === 0 ? (
          <div className="pick-empty">
            <strong>No places yet</strong>
            <p>{savedPlaces.loading || accountLibrary.loading ? "Looking for places you saved…" : "Add a link, a note or a screenshot. The places we find show up here, ticked."}</p>
          </div>
        ) : (
          <table className="pick-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Include</span></th>
                <th scope="col">Place</th>
                <th scope="col" className="pick-col-type">Type</th>
                <th scope="col" className="pick-col-area">Area</th>
                <th scope="col" className="pick-col-link"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const { place } = row;
                const on = ticked.has(place.id);
                const area = rowArea(row);
                const name = rowName(row);
                const away = outsideTripCity(place, trip.destination);
                return (
                  <tr key={place.id} className={on ? "is-on" : undefined}>
                    <td>
                      <input type="checkbox" className="pick-tick" checked={on} onChange={() => toggle(place.id)} aria-label={`Include ${name}`} />
                    </td>
                    <td>
                      <span className="pick-place">
                        <CoverArt seed={place.name} className="pick-art" showLabel={false} />
                        <span className="pick-name">
                          <strong>{name}</strong>
                          <small className="pick-area-inline">{area}</small>
                          {away && <span className="pick-away"><Badge tone="warning">Address outside {away}</Badge></span>}
                        </span>
                      </span>
                    </td>
                    <td className="pick-col-type">{rowCategory(row)}</td>
                    <td className="pick-col-area">{area}</td>
                    <td className="pick-col-link">
                      <Link href={row.kind === "account"
                        ? `/inspiration-library?country=${row.place.country?.code ?? "unknown"}&place=${row.place.id}`
                        : `/my-trip/${row.kind === "saved" ? row.place.tripId : trip.id}/place/${row.place.id}`}>Details</Link>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="pick-none">Nothing here with this filter.</td></tr>
              )}
            </tbody>
          </table>
        )}
        {withoutLocation > 0 && (
          <p className="small muted" role="status">{withoutLocation} selected {withoutLocation === 1 ? "place has" : "places have"} no location yet. {withoutLocation === 1 ? "It stays" : "They stay"} selected and will be listed as unplaced after planning.</p>
        )}
      </section>

      <AddPanel trip={trip} saves={saves} onAdded={onPlacesChanged} />

      <footer className="pick-foot">
        <strong>{chosen.length} {chosen.length === 1 ? "place" : "places"} selected</strong>
        <span className="muted small">You can add or drop places after the days are built.</span>
        <button type="button" className="btn btn-primary" disabled={!canSave || busy} onClick={() => void continuePlanning()}>
          {busy ? "Saving…" : chosen.length ? `Continue with ${chosen.length} ${chosen.length === 1 ? "place" : "places"}` : canSave ? "Save no places" : "Tick at least one place"} <Icon name="arrowRight" size={16} />
        </button>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- add something new */

type Mode = "link" | "text" | "screenshot";
const MODES: Array<[Mode, string, IconName]> = [["link", "Link", "link"], ["text", "Text", "text"], ["screenshot", "Screenshot", "image"]];

/** One short line for the save just added; everything else shows up in the table. */
const SAVE_STATUS: Record<Inspiration["status"], [string, Tone] | null> = {
  queued: ["Finding places…", "info"],
  processing: ["Finding places…", "info"],
  needs_confirmation: ["Places added to the table", "success"],
  ready: ["Places added to the table", "success"],
  needs_input: ["Couldn’t read that. Try text or a screenshot.", "warning"],
  failed: ["Couldn’t read that. Try text or a screenshot.", "danger"],
  skipped: null,
};

const PLACEHOLDER: Record<Mode, string> = { link: "Paste a YouTube Short link", text: "Type a place or a note", screenshot: "" };

function AddPanel({ trip, saves, onAdded }: { trip: Trip; saves: Inspiration[]; onAdded: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("link");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = mode === "screenshot" ? Boolean(file) : Boolean(value.trim());
  const last = saves.find((save) => save.id === lastId);
  const status = last ? SAVE_STATUS[last.status] : null;

  function pickFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!(SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(candidate.type)) return setProblem("Choose a PNG, JPEG, WebP or GIF image.");
    if (candidate.size > MAX_SCREENSHOT_BYTES) return setProblem("Choose an image under 4 MiB.");
    setProblem(null);
    setFile(candidate);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const params = { tripId: trip.id };
      const { inspiration } = mode === "screenshot" && file ? await api("inspirations.createFromScreenshot", { params, body: { file } })
        : mode === "link" ? await api("inspirations.create", { params, body: { sourceType: "link", url: value.trim() } })
          : await api("inspirations.create", { params, body: { sourceType: "text", text: value.trim() } });
      setLastId(inspiration.id);
      setValue("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="pick-add" aria-labelledby="pick-add-title">
      <form className="pick-add-card" onSubmit={submit}>
        <span className="pick-add-mark" aria-hidden="true"><Icon name="plus" size={24} /></span>
        <h2 id="pick-add-title">Add something new</h2>
        <div className="pick-modes" role="group" aria-label="What are you adding?">
          {MODES.map(([id, label, icon]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => { setMode(id); setProblem(null); }}>
              <Icon name={icon} size={15} /> {label}
            </button>
          ))}
        </div>
        {mode === "link" && (
          <label className="field-icon" htmlFor="pick-add-link">
            <span className="sr-only">YouTube Short link</span>
            <Icon name="link" size={18} />
            <input id="pick-add-link" type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDER.link} />
          </label>
        )}
        {mode === "text" && (
          <label htmlFor="pick-add-text">
            <span className="sr-only">Place name or note</span>
            <textarea id="pick-add-text" rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDER.text} />
          </label>
        )}
        {mode === "screenshot" && (
          <label className="pick-drop" htmlFor="pick-add-file">
            <Icon name="image" size={22} />
            <strong>{file ? file.name : "Choose a screenshot"}</strong>
            <input id="pick-add-file" ref={fileInput} className="sr-only" type="file" accept={SCREENSHOT_CONTENT_TYPES.join(",")} onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )}
        {problem && <p className="small pick-problem" role="alert">{problem}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !ready}><Icon name="sparkle" size={17} /> {busy ? "Adding…" : "Find places"}</button>
        {status && <p className={`pick-status is-${status[1]}`} role="status">{status[0]}</p>}
        <ErrorBanner error={error} />
      </form>
    </aside>
  );
}

/* ---------------------------------------------------------------- helpers */

/** Saved places from the account's other trips in this trip's country, once each and not already here. */
function reusablePlaces(trip: Trip, current: CandidatePlace[], saved: CandidatePlace[], trips: Trip[]): CandidatePlace[] {
  const target = destinationLocation(trip.destination).countryId;
  if (target === "unsorted") return [];
  const tripsById = new Map(trips.map((t) => [t.id, t]));
  const origin = (p: CandidatePlace) => p.copiedFromPlaceId ?? p.id;
  const provider = (p: CandidatePlace) => p.selected?.providerPlaceId ?? null;
  const seenOrigins = new Set(current.map(origin));
  const seenProviders = new Set(current.flatMap((p) => provider(p) ?? []));
  const out: CandidatePlace[] = [];
  for (const place of saved) {
    if (place.tripId === trip.id || place.status === "rejected") continue;
    if (seenOrigins.has(origin(place)) || (provider(place) && seenProviders.has(provider(place)!))) continue;
    const labels = sourceLabels(place);
    const from = tripsById.get(place.tripId);
    const country = labels.present ? (labels.countryCode ?? "unsorted") : from ? destinationLocation(from.destination).countryId : "unsorted";
    if (country !== target) continue;
    seenOrigins.add(origin(place));
    if (provider(place)) seenProviders.add(provider(place)!);
    out.push(place);
  }
  return out;
}

/** Account reel places in this trip's source-supported country, excluding ideas already copied here. */
function reusableAccountPlaces(
  trip: Trip,
  current: CandidatePlace[],
  saved: AccountPlace[],
  reels: AccountReel[],
): Array<{ place: AccountPlace; reel: AccountReel }> {
  const target = destinationLocation(trip.destination).countryId;
  if (target === "unsorted") return [];
  const reelsById = new Map(reels.map((reel) => [reel.id, reel]));
  const copiedIds = new Set(current.flatMap((place) => place.copiedFromAccountPlaceId ?? []));
  const providerIds = new Set(current.flatMap((place) => resolvedProviderId(place) ?? []));
  const out: Array<{ place: AccountPlace; reel: AccountReel }> = [];
  for (const place of saved) {
    const reel = reelsById.get(place.reelId);
    if (!reel || reel.tripId || place.country?.code !== target || copiedIds.has(place.id)) continue;
    const providerId = accountProviderId(place);
    if (providerId && providerIds.has(providerId)) continue;
    copiedIds.add(place.id);
    if (providerId) providerIds.add(providerId);
    out.push({ place, reel });
  }
  return out.sort((a, b) => b.place.createdAt.localeCompare(a.place.createdAt));
}

function rowName(row: Row): string {
  return row.kind === "account"
    ? (row.place.options.length === 1 ? row.place.options[0]!.name : row.place.name)
    : row.place.selected?.name ?? row.place.name;
}

function rowCategory(row: Row): string {
  return row.kind === "account" ? accountPlaceCategory(row.place.category) : placeCategory(row.place);
}

function rowArea(row: Row): string {
  if (row.kind !== "account") return placeArea(row.place);
  return row.place.area ?? (row.place.options.length === 1 ? row.place.options[0]!.address : null) ?? "Area unknown";
}

function rowHasLocation(row: Row): boolean {
  return row.kind === "account" ? row.place.options.length > 0 : Boolean(row.place.selected || row.place.options.length);
}

const resolvedProviderId = (place: CandidatePlace) =>
  place.selected?.providerPlaceId ?? (place.options.length === 1 ? place.options[0]!.providerPlaceId : null);

const accountProviderId = (place: AccountPlace) =>
  place.options.length === 1 ? place.options[0]!.providerPlaceId : null;

function placeCategory(place: CandidatePlace): string {
  const preview = place.selected ?? (place.options.length === 1 ? place.options[0] : null);
  const raw = preview?.details.category ?? place.evidence.find((e) => e.classification?.category)?.classification?.category?.value ?? null;
  if (!raw) return "Place";
  const text = raw.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function placeArea(place: CandidatePlace): string {
  return place.evidence.find((e) => e.hint)?.hint ?? place.selected?.address ?? (place.options.length === 1 ? place.options[0]!.address : null) ?? "Area unknown";
}
