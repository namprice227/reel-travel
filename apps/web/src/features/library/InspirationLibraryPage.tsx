"use client";

import type { CandidatePlace, Inspiration, Trip } from "@reel/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { StopArt, categoryGroup } from "@/components/Illustration";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { AddInspirationForm } from "@/features/inbox/AddInspirationForm";
import { InspirationCard } from "@/features/inbox/InspirationCard";
import { api, ApiError } from "@/lib/api-client";
import { inspirationStatus } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// Inspiration library at /inspiration-library (F1 import UI, Member 1). Saves are stored per trip, so the library
// loads inspirations.list and places.list for every trip and groups them: destination -> trip -> type.
// `?trip=<id>` opens one trip's saves (this replaces the old per-trip inbox route).

interface TripSaves {
  inspirations: Inspiration[];
  places: CandidatePlace[];
}

const SOURCE_ICON: Record<Inspiration["sourceType"], IconName> = { link: "link", text: "text", screenshot: "image" };
const SOURCE_LABEL: Record<Inspiration["sourceType"], string> = { link: "Reel or link", text: "Note", screenshot: "Screenshot" };
const ATTENTION = new Set<Inspiration["status"]>(["needs_input", "failed", "needs_confirmation"]);

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

export function InspirationLibraryPage({ tripId }: { tripId?: string }) {
  const trips = useApi("trips.list", {});
  const library = useLibrary(trips.data?.trips);
  const [destination, setDestination] = useState<string | null>(null);
  const [type, setType] = useState<string>("All");
  const [adding, setAdding] = useState(false);
  const [addTrip, setAddTrip] = useState(tripId ?? "");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#add") setAdding(true);
  }, []);

  const list = useMemo(() => trips.data?.trips ?? [], [trips.data]);
  const scopedTrip = list.find((t) => t.id === tripId);
  const destinations = useMemo(() => {
    const map = new Map<string, Trip[]>();
    for (const trip of list) map.set(trip.destination, [...(map.get(trip.destination) ?? []), trip]);
    return [...map.entries()];
  }, [list]);

  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data || !library.loaded) return <Loading />;

  const activeDestination = scopedTrip ? scopedTrip.destination : destination;
  const visibleTrips = scopedTrip ? [scopedTrip] : activeDestination ? list.filter((t) => t.destination === activeDestination) : list;
  const count = (trip: Trip) => library.data[trip.id]?.inspirations.length ?? 0;

  const items = visibleTrips.flatMap((trip) => {
    const saves = library.data[trip.id];
    if (!saves) return [];
    const byId = new Map(saves.places.map((p) => [p.id, p]));
    return saves.inspirations.map((save) => {
      const places = save.placeIds.map((id) => byId.get(id)).filter((p): p is CandidatePlace => Boolean(p));
      const categories = places.map((p) => p.selected?.details.category ?? p.options[0]?.details.category ?? null);
      const groups = [...new Set(categories.map(categoryGroup))];
      return { trip, save, places, category: categories[0] ?? null, groups: groups.length ? groups : ["Unsorted"] };
    });
  });

  const typeCounts = new Map<string, number>();
  for (const item of items) for (const g of item.groups) typeCounts.set(g, (typeCounts.get(g) ?? 0) + 1);
  const attention = items.filter((i) => ATTENTION.has(i.save.status)).length;
  const types = ["All", ...[...typeCounts.keys()].filter((g) => g !== "Unsorted").sort(), ...(typeCounts.has("Unsorted") ? ["Unsorted"] : [])];
  const shown = items.filter((i) => type === "All" || (type === "Needs attention" ? ATTENTION.has(i.save.status) : i.groups.includes(type)));
  const heading = scopedTrip ? scopedTrip.title : activeDestination ?? "All saves";
  const saveTarget = addTrip || visibleTrips[0]?.id || "";

  return (
    <div className="library-page">
      <header className="page-heading">
        <div>
          <p className="kicker">Inspiration library</p>
          <h1>Your saved inspiration</h1>
          <p>Reels, links, screenshots and notes, sorted by destination and type.</p>
        </div>
        {list.length > 0 && (
          <button className="btn btn-primary btn-large" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Icon name={adding ? "close" : "plus"} size={18} /> {adding ? "Close" : "Add inspiration"}
          </button>
        )}
      </header>
      <ErrorBanner error={library.error} />

      {list.length === 0 ? (
        <Empty title="No trips yet"><Link href="/my-trip/new">Create a trip</Link> to start saving inspiration.</Empty>
      ) : (
        <div className="library-layout">
          <aside className="card library-tree" aria-label="Destinations">
            <h2 className="side-card-title library-tree-title">Destinations</h2>
            <Link href="/inspiration-library" className={`tree-item${!tripId && !destination ? " active" : ""}`} onClick={() => setDestination(null)}>
              <span>All saves</span><span className="tree-count">{list.reduce((n, t) => n + count(t), 0)}</span>
            </Link>
            {destinations.map(([dest, destTrips]) => (
              <div key={dest} className="tree-group">
                <Link
                  href="/inspiration-library"
                  className={`tree-item tree-destination${!tripId && destination === dest ? " active" : ""}`}
                  onClick={() => { setDestination(dest); setType("All"); }}
                >
                  <span><Icon name="pin" size={16} /> {dest}</span><span className="tree-count">{destTrips.reduce((n, t) => n + count(t), 0)}</span>
                </Link>
                {destTrips.map((trip) => (
                  <Link key={trip.id} href={`/inspiration-library?trip=${trip.id}`} className={`tree-item tree-trip${tripId === trip.id ? " active" : ""}`} onClick={() => setType("All")}>
                    <span className="truncate">{trip.title}</span><span className="tree-count">{count(trip)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </aside>

          <section className="card library-main">
            <div className="library-main-head">
              <div>
                <p className="library-crumbs">{scopedTrip ? <>{scopedTrip.destination} / <span>{scopedTrip.title}</span></> : activeDestination ? activeDestination : "All destinations"}</p>
                <h2>{heading} <span className="muted">· {items.length} saves</span></h2>
              </div>
              {scopedTrip && <Link className="btn btn-outline" href={`/my-trip/${scopedTrip.id}/places`}><Icon name="pin" size={18} /> Review places</Link>}
            </div>

            {adding && (
              <div className="library-add" id="add">
                <div className="row between">
                  <strong>Add inspiration</strong>
                  {!scopedTrip && (
                    <label className="inline small">
                      Save to
                      <select value={saveTarget} onChange={(e) => setAddTrip(e.target.value)}>
                        {visibleTrips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {saveTarget && <AddInspirationForm key={saveTarget} tripId={saveTarget} onSaved={() => void library.reload()} />}
              </div>
            )}

            <div className="type-chips" role="tablist" aria-label="Filter by type">
              {types.map((t) => (
                <button key={t} role="tab" aria-selected={type === t} className={type === t ? "active" : undefined} onClick={() => setType(t)}>
                  {t} <span>{t === "All" ? items.length : typeCounts.get(t)}</span>
                </button>
              ))}
              {attention > 0 && (
                <button role="tab" aria-selected={type === "Needs attention"} className={`is-attention${type === "Needs attention" ? " active" : ""}`} onClick={() => setType("Needs attention")}>
                  <Icon name="alert" size={14} /> Needs attention <span>{attention}</span>
                </button>
              )}
            </div>

            {shown.length === 0 ? (
              <Empty title="Nothing here yet">Paste a caption, a link or a screenshot of somewhere you want to go.</Empty>
            ) : (
              <div className="save-grid">
                {shown.map((item) => (
                  <SaveCard key={item.save.id} {...item} showTrip={!scopedTrip} onChange={() => void library.reload()} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SaveCard({
  trip,
  save,
  places,
  category,
  groups,
  showTrip,
  onChange,
}: {
  trip: Trip;
  save: Inspiration;
  places: CandidatePlace[];
  category: string | null;
  groups: string[];
  showTrip: boolean;
  onChange: () => void;
}) {
  const names = places.map((p) => p.name);
  const title = names.length
    ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`
    : save.text
      ? truncate(save.text, 60)
      : save.url
        ? truncate(save.url.replace(/^https?:\/\/(www\.)?/, ""), 48)
        : "Screenshot";
  const confirmed = places.some((p) => p.status === "confirmed");
  const status = save.status === "ready" && confirmed ? { label: "Place confirmed", tone: "success" as const } : inspirationStatus[save.status];
  const needsAction = ATTENTION.has(save.status);

  return (
    <article className="save-card">
      <div className="save-card-art">
        <StopArt category={category} />
        <span className="save-tag save-tag-type">{groups[0]}</span>
        <span className="save-tag save-tag-source"><Icon name={SOURCE_ICON[save.sourceType]} size={13} /> {SOURCE_LABEL[save.sourceType]}</span>
      </div>
      <div className="save-card-body">
        <h3>{title}</h3>
        <p className="save-meta">
          <span><Icon name={SOURCE_ICON[save.sourceType]} size={15} /> {SOURCE_LABEL[save.sourceType]}</span>
          <span><Icon name="pin" size={15} /> {showTrip ? trip.title : trip.destination}</span>
        </p>
        <Badge tone={status.tone}>{status.label}</Badge>
        <details className="save-details" open={needsAction && save.status !== "needs_confirmation" ? undefined : undefined}>
          <summary className={`btn btn-small ${needsAction ? "btn-outline" : "btn-ghost"}`}>
            {save.status === "needs_input" || save.status === "failed" ? "Add details" : "Source and actions"}
          </summary>
          <InspirationCard tripId={trip.id} inspiration={save} onChange={onChange} />
        </details>
      </div>
    </article>
  );
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
