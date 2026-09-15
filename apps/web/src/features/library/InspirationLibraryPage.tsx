"use client";

import type { CandidatePlace, Inspiration, Trip } from "@reel/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { categoryGroup } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { InspirationCard } from "@/features/inbox/InspirationCard";
import { SaveComposer } from "@/features/inbox/SaveComposer";
import { api, ApiError } from "@/lib/api-client";
import { formatTimestamp, placeStatus } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// Inspiration library at /inspiration-library (F1 import UI, Member 1): every reel, link, screenshot and note the
// traveler saved, as a calm list grouped by type with a detail panel. Saves are stored per trip, so the page loads
// inspirations.list and places.list for every trip. `?trip=<id>` shows one trip.

interface TripSaves {
  inspirations: Inspiration[];
  places: CandidatePlace[];
}

interface SaveItem {
  trip: Trip;
  save: Inspiration;
  places: CandidatePlace[];
  group: string;
  title: string;
}

const SOURCE_ICON: Record<Inspiration["sourceType"], IconName> = { link: "link", text: "text", screenshot: "image" };
const SOURCE_LABEL: Record<Inspiration["sourceType"], string> = { link: "Reel or link", text: "Note", screenshot: "Screenshot" };
const GROUP_ORDER = ["Food & drink", "Culture", "Nature", "Views", "Entertainment", "Other", "Unsorted"];

function useLibrary(trips: Trip[] | undefined) {
  const [data, setData] = useState<Record<string, TripSaves>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ids = trips?.map((t) => t.id).join("|") ?? "";

  const load = useCallback(async () => {
    if (!trips) return;
    try {
      const entries = await Promise.all(
        trips.map(async (trip) => {
          const params = { tripId: trip.id };
          const [saves, places] = await Promise.all([api("inspirations.list", { params }), api("places.list", { params })]);
          return [trip.id, { inspirations: saves.inspirations, places: places.places }] as const;
        }),
      );
      setData(Object.fromEntries(entries));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e)));
    } finally {
      setLoaded(true);
    }
    // `ids` captures the trip list by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while imports are queued or processing.
  const working = Object.values(data).some((t) => t.inspirations.some((i) => i.status === "queued" || i.status === "processing"));
  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => void load(), 1500);
    return () => clearTimeout(timer);
  }, [working, data, load]);

  return { data, error, loaded, reload: load };
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function saveTitle(save: Inspiration, places: CandidatePlace[]): string {
  const names = places.filter((p) => p.status !== "rejected").map((p) => p.name);
  if (names.length) return `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  if (save.text) return shorten(save.text, 80);
  if (save.url) return shorten(save.url.replace(/^https?:\/\/(www\.)?/, ""), 60);
  return "Screenshot";
}

/** One quiet word for where a save is, from its status and the places it found. */
function saveState(save: Inspiration, places: CandidatePlace[]): { label: string; tone: "success" | "warning" | "info" | "neutral" } {
  switch (save.status) {
    case "queued":
    case "processing":
      return { label: "Finding places…", tone: "info" };
    case "needs_input":
    case "failed":
      return { label: "Needs details", tone: "warning" };
    case "needs_confirmation":
      return places.some((p) => p.status === "ambiguous") ? { label: "Choose a branch", tone: "warning" } : { label: "Confirm place", tone: "warning" };
    case "ready":
      return places.some((p) => p.status === "confirmed") ? { label: "Confirmed", tone: "success" } : { label: "Done", tone: "neutral" };
    default:
      return { label: "Skipped", tone: "neutral" };
  }
}

export function InspirationLibraryPage({ tripId }: { tripId?: string }) {
  const router = useRouter();
  const trips = useApi("trips.list", {});
  const library = useLibrary(trips.data?.trips);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useMemo(() => trips.data?.trips ?? [], [trips.data]);

  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data || !library.loaded) return <Loading />;

  const scopedTrip = list.find((t) => t.id === tripId);
  const visibleTrips = scopedTrip ? [scopedTrip] : list;

  const items: SaveItem[] = visibleTrips.flatMap((trip) => {
    const saves = library.data[trip.id];
    if (!saves) return [];
    const byId = new Map(saves.places.map((p) => [p.id, p]));
    return saves.inspirations.map((save) => {
      const places = save.placeIds.map((id) => byId.get(id)).filter((p): p is CandidatePlace => Boolean(p));
      const category = places.map((p) => p.selected?.details.category ?? p.options[0]?.details.category ?? null).find(Boolean) ?? null;
      return { trip, save, places, group: categoryGroup(category), title: saveTitle(save, places) };
    });
  });

  const needle = query.trim().toLowerCase();
  const shown = items
    .filter((i) => type === "all" || i.group === type)
    .filter((i) => !needle || [i.title, i.save.text, i.save.url, i.trip.title, ...i.places.map((p) => p.name)].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => b.save.createdAt.localeCompare(a.save.createdAt));
  const groups = GROUP_ORDER.map((label) => ({ label, items: shown.filter((i) => i.group === label) })).filter((g) => g.items.length > 0);
  const typeCounts = GROUP_ORDER.map((label) => ({ label, count: items.filter((i) => i.group === label).length })).filter((g) => g.count > 0);
  const selected = shown.find((i) => i.save.id === selectedId) ?? groups[0]?.items[0] ?? null;

  return (
    <div className="fit-page library-page">
      <header className="page-head">
        <div className="page-head-titles">
          <h1>Inspiration library</h1>
          <p>{items.length} {items.length === 1 ? "save" : "saves"} · your reels, links, screenshots and notes</p>
        </div>
      </header>

      {list.length === 0 ? (
        <Empty title="No trips yet"><Link href="/my-trip/new">Create a trip</Link> to start saving inspiration.</Empty>
      ) : (
        <>
          <SaveComposer trips={list} defaultTripId={scopedTrip?.id ?? list[0]?.id} variant="bar" onSaved={() => void library.reload()} />
          <ErrorBanner error={library.error} />

          <div className="lib-layout fit-fill">
            <section className="card lib-list" aria-label="Saves">
              <div className="lib-toolbar">
                <label className="lib-search" htmlFor="lib-search">
                  <span className="sr-only">Search saves</span>
                  <Icon name="text" size={17} />
                  <input id="lib-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saves and places" />
                </label>
                <label htmlFor="lib-trip">
                  <span className="sr-only">Trip</span>
                  <select id="lib-trip" value={scopedTrip?.id ?? "all"} onChange={(e) => router.replace(e.target.value === "all" ? "/inspiration-library" : `/inspiration-library?trip=${e.target.value}`)}>
                    <option value="all">All trips</option>
                    {list.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
                <label htmlFor="lib-type">
                  <span className="sr-only">Type</span>
                  <select id="lib-type" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="all">All types</option>
                    {typeCounts.map((g) => <option key={g.label} value={g.label}>{g.label} ({g.count})</option>)}
                  </select>
                </label>
              </div>

              <div className="lib-groups panel-scroll">
                {groups.length === 0 ? (
                  <p className="muted lib-none">{items.length === 0 ? "Nothing saved yet. Paste a reel, link or note above." : "No saves match."}</p>
                ) : (
                  groups.map((group) => (
                    <section key={group.label} aria-labelledby={`group-${group.label}`}>
                      <h2 id={`group-${group.label}`} className="lib-group-title">{group.label} <span>{group.items.length}</span></h2>
                      <ul className="lib-rows">
                        {group.items.map((item) => {
                          const state = saveState(item.save, item.places);
                          const active = selected?.save.id === item.save.id;
                          return (
                            <li key={item.save.id}>
                              <button type="button" className="lib-row" aria-pressed={active} onClick={() => setSelectedId(item.save.id)}>
                                <span className="lib-row-icon"><Icon name={SOURCE_ICON[item.save.sourceType]} size={17} /></span>
                                <span className="lib-row-text">
                                  <span className="lib-row-title">{item.title}</span>
                                  <span className="lib-row-meta">{SOURCE_LABEL[item.save.sourceType]} · {formatTimestamp(item.save.createdAt)}{scopedTrip ? "" : ` · ${item.trip.title}`}</span>
                                </span>
                                <span className={`lib-status is-${state.tone}`}>{state.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </section>

            <aside className="card lib-detail panel-scroll" aria-label="Save details">
              {selected ? <SaveDetail item={selected} onChange={() => void library.reload()} /> : <p className="muted">Select a save to see its source.</p>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function SaveDetail({ item, onChange }: { item: SaveItem; onChange: () => void }) {
  const { trip, save, places } = item;
  const state = saveState(save, places);
  return (
    <>
      <div className="lib-detail-head">
        <p className={`lib-status is-${state.tone}`}>{state.label}</p>
        <h2>{item.title}</h2>
        <p className="lib-detail-meta">
          <Icon name={SOURCE_ICON[save.sourceType]} size={15} /> {SOURCE_LABEL[save.sourceType]} · saved {formatTimestamp(save.createdAt)} ·{" "}
          <Link href={`/my-trip/${trip.id}/itinerary`}>{trip.title}</Link>
        </p>
      </div>

      {places.length > 0 && (
        <section className="lib-detail-section" aria-labelledby="lib-places-title">
          <div className="row between">
            <h3 id="lib-places-title">Places found</h3>
            <Link className="small" href={`/my-trip/${trip.id}/places`}>Review places</Link>
          </div>
          <ul className="lib-places">
            {places.map((p) => (
              <li key={p.id}>
                <span><Icon name="pin" size={15} /> {p.name}</span>
                <span className="muted small">{placeStatus[p.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lib-detail-section" aria-labelledby="lib-source-title">
        <h3 id="lib-source-title">Source</h3>
        <InspirationCard tripId={trip.id} inspiration={save} onChange={onChange} />
      </section>
    </>
  );
}
