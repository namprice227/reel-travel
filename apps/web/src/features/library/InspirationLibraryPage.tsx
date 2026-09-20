"use client";

import type { CandidatePlace, Inspiration, Trip } from "@reel/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { InspirationCard } from "@/features/inbox/InspirationCard";
import { SaveComposer } from "@/features/inbox/SaveComposer";
import { api, ApiError, uploadUrl } from "@/lib/api-client";
import { formatTimestamp, placeStatus } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { LibraryDialog } from "./LibraryDialog";
import {
  buildLibrary,
  CATEGORIES,
  countryAlbums,
  destinationLocation,
  matchesQuery,
  type SaveItem,
  type TripSaves,
} from "./library-model";

const SOURCE_ICON: Record<Inspiration["sourceType"], IconName> = { link: "link", text: "text", screenshot: "image" };
const SOURCE_LABEL: Record<Inspiration["sourceType"], string> = {
  link: "Reel or link",
  text: "Note",
  screenshot: "Screenshot",
};
const CATEGORY_ICON: Record<string, IconName> = {
  "Food & drink": "food",
  Attractions: "temple",
  Nature: "tree",
  Shopping: "bag",
  Stays: "bed",
  Other: "discover",
  Unsorted: "library",
};

function useLibrary(trips: Trip[] | undefined) {
  const [data, setData] = useState<Record<string, TripSaves>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!trips) return;
    try {
      const entries = await Promise.all(
        trips.map(async (trip) => {
          const params = { tripId: trip.id };
          const [saves, places] = await Promise.all([
            api("inspirations.list", { params }),
            api("places.list", { params }),
          ]);
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
  }, [trips]);
  useEffect(() => {
    void load();
  }, [load]);
  const working = Object.values(data).some((t) =>
    t.inspirations.some((i) => i.status === "queued" || i.status === "processing"),
  );
  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => void load(), 1500);
    return () => clearTimeout(timer);
  }, [working, data, error, load]);
  return { data, error, loaded, reload: load };
}

function saveState(save: Inspiration, places: CandidatePlace[]): { label: string; tone: string } {
  switch (save.status) {
    case "queued":
    case "processing":
      return { label: "Finding places…", tone: "info" };
    case "needs_input":
    case "failed":
      return { label: "Needs details", tone: "warning" };
    case "needs_confirmation":
      return {
        label: places.some((p) => p.status === "unverified") ? "Review extracted places" : places.some((p) => p.status === "ambiguous") ? "Choose a branch" : "Confirm place",
        tone: "warning",
      };
    case "ready":
      return { label: places.some((p) => p.status === "confirmed") ? "Confirmed" : "Done", tone: "success" };
    default:
      return { label: "Skipped", tone: "neutral" };
  }
}

export function InspirationLibraryPage({ tripId, countryId }: { tripId?: string; countryId?: string }) {
  const trips = useApi("trips.list", {});
  const library = useLibrary(trips.data?.trips);
  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data || !library.loaded) return <Loading />;
  return (
    <LibraryContent
      key={`${tripId ?? ""}/${countryId ?? ""}`}
      trips={trips.data.trips}
      library={library}
      tripId={tripId}
      countryId={countryId}
    />
  );
}

function LibraryContent({
  trips,
  library,
  tripId,
  countryId,
}: {
  trips: Trip[];
  library: ReturnType<typeof useLibrary>;
  tripId?: string;
  countryId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [city, setCity] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const scopedTrip = trips.find((trip) => trip.id === tripId);
  const items = buildLibrary(scopedTrip ? [scopedTrip] : trips, library.data);
  const albums = countryAlbums(items);
  const activeCountry = countryId ?? (scopedTrip && albums.length === 1 ? albums[0]!.id : undefined);
  const reviewing = activeCountry === "review";
  const album = albums.find((entry) => entry.id === activeCountry);
  const overview = !activeCountry;
  const searching = Boolean(query.trim());
  const scopeItems = reviewing
    ? items.filter((item) => item.needsReview)
    : activeCountry
      ? album?.items ?? []
      : items;
  const matched = scopeItems.filter((item) => matchesQuery(item, query) && (!city || item.location.city === city));
  const shown = matched.filter(
    (item) => category === "All" || item.categories.includes(category as (typeof CATEGORIES)[number]),
  );
  const cities = [
    ...new Set(scopeItems.map((item) => item.location.city).filter((value): value is string => Boolean(value))),
  ].sort();
  const reviewCount = items.filter((item) => item.needsReview).length;
  const selected = items.find((item) => item.save.id === selectedId);
  const title = overview
    ? "Inspiration library"
    : reviewing
      ? "Needs review"
      : (album?.name ?? (scopedTrip ? destinationLocation(scopedTrip.destination).country : "Country collection"));
  const href = (country: string) =>
    `/inspiration-library?${new URLSearchParams({ ...(scopedTrip ? { trip: scopedTrip.id } : {}), country })}`;
  const clearFilters = () => {
    setQuery("");
    setCategory("All");
    setCity("");
  };

  return (
    <div className="fit-page library-page">
      {!overview && (
        <nav className="library-breadcrumb" aria-label="Breadcrumb">
          <Link href="/inspiration-library">
            <Icon name="arrowLeft" size={16} /> All countries
          </Link>
          <span>/</span>
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <header className="page-head library-header">
        <div className="page-head-titles">
          <h1>{title}</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add inspiration
        </button>
      </header>
      {scopedTrip && (
        <div className="library-trip-scope">
          <Icon name="trips" size={16} />
          <span>{scopedTrip.title}</span>
          <Link
            href={
              activeCountry
                ? `/inspiration-library?${new URLSearchParams({ country: activeCountry })}`
                : "/inspiration-library"
            }
          >
            Show all trips
          </Link>
        </div>
      )}
      <div className="library-search-row">
        <label className="lib-search" htmlFor="library-search">
          <Icon name="search" size={19} />
          <span className="sr-only">Search your inspiration</span>
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={overview ? "Search your inspiration, countries or cities" : "Search this collection"}
          />
        </label>
        {!reviewing && reviewCount > 0 && (
          <Link className="library-review" href={href("review")}>
            <Icon name="info" size={16} /> Needs review <span>{reviewCount}</span>
          </Link>
        )}
      </div>
      <ErrorBanner error={library.error} />
      {library.error && (
        <button className="btn library-retry" onClick={() => void library.reload()}>
          Reload library
        </button>
      )}
      {notice && (
        <p role="status" className="library-notice">
          <Icon name="checkCircle" size={16} />
          {notice}
        </p>
      )}
      {tripId && !scopedTrip ? (
        <Empty title="Trip unavailable">
          <Link href="/inspiration-library">Open all inspiration</Link>
        </Empty>
      ) : (
        <div className="library-content fit-fill panel-scroll">
          {overview && !searching ? (
            <>
              <div className="library-section-heading">
                <h2>
                  Your countries <span>{albums.filter((a) => a.id !== "unsorted").length}</span>
                </h2>
                <span>
                  {items.length} {items.length === 1 ? "save" : "saves"} in your library
                </span>
              </div>
              {albums.length > 0 ? (
                <div className="library-albums">
                  {albums.map((entry) => (
                    <Link
                      key={entry.id}
                      href={href(entry.id)}
                      className="library-album"
                      aria-label={`Open ${entry.name}, ${entry.items.length} saves`}
                    >
                      <CountryCover countryId={entry.id} name={entry.name} />
                      <div className="library-album-info">
                        <div>
                          <h3>{entry.name}</h3>
                          <span>
                            {entry.items.length} {entry.items.length === 1 ? "save" : "saves"}
                          </span>
                        </div>
                        <Icon name="arrowRight" size={20} />
                        <p>
                          {entry.id === "unsorted"
                            ? "Help us find the country"
                            : entry.cities.join(" · ") || "Ideas from across the country"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                !library.error && (
                  <Empty title="Your next adventure starts with a save">
                    <span className="library-empty-copy">
                      Add a reel, screenshot or note. Your country collections will appear here.
                    </span>
                    <button className="btn btn-primary" onClick={() => setAdding(true)}>
                      <Icon name="plus" size={18} /> Save your first idea
                    </button>
                  </Empty>
                )
              )}
              <p className="library-footnote">
                <Icon name="sparkle" size={17} /> Together by country. Easy to explore by category.
              </p>
            </>
          ) : (
            <>
              {activeCountry === "unsorted" && (
                <p className="library-help">
                  These trip destinations need a country. Open a save and choose “Edit trip destination” to add one,
                  such as “Kyoto, Japan”.
                </p>
              )}
              <div className="library-categories" role="group" aria-label="Filter by category">
                {["All", ...CATEGORIES.filter((c) => scopeItems.some((item) => item.categories.includes(c)))].map(
                  (label) => (
                    <button
                      type="button"
                      key={label}
                      className="library-category"
                      aria-pressed={category === label}
                      onClick={() => setCategory(label)}
                    >
                      {label}
                      <span>
                        {label === "All"
                          ? matched.length
                          : matched.filter((item) => item.categories.includes(label as (typeof CATEGORIES)[number]))
                              .length}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <div className="library-grid-toolbar">
                <div className="row">
                  <label className="sr-only" htmlFor="library-city">
                    Filter by city or destination
                  </label>
                  <select id="library-city" value={city} onChange={(event) => setCity(event.target.value)}>
                    <option value="">All cities</option>
                    {cities.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="muted small" role="status">
                    {shown.length} {shown.length === 1 ? "save" : "saves"}
                    {searching ? " found" : ""}
                  </span>
                </div>
                <div className="library-view-toggle" role="group" aria-label="Library view">
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <Icon name="grid" size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <Icon name="timeline" size={18} />
                  </button>
                </div>
              </div>
              {shown.length ? (
                <div className={`library-saves is-${view}`}>
                  {shown.map((item) => (
                    <SaveTile
                      key={item.save.id}
                      item={item}
                      showCountry={overview || reviewing}
                      onOpen={() => setSelectedId(item.save.id)}
                    />
                  ))}
                </div>
              ) : (
                !library.error && (
                  <Empty title={reviewing && !scopeItems.length ? "You're all caught up" : "No saves here yet"}>
                    <span className="library-empty-copy">
                      {searching || category !== "All" || city
                        ? "Try another search or clear your filters."
                        : "Add an idea to this collection or explore your other countries."}
                    </span>
                    {(searching || category !== "All" || city) && (
                      <button type="button" className="btn" onClick={clearFilters}>
                        Clear filters
                      </button>
                    )}
                  </Empty>
                )
              )}
            </>
          )}
        </div>
      )}
      {adding && (
        <LibraryDialog title="Add inspiration" onDismiss={() => setAdding(false)}>
          <p className="muted">Save something you’d love to experience.</p>
          <SaveComposer
            trips={trips}
            defaultTripId={
              scopedTrip?.id ??
              trips.find((trip) => destinationLocation(trip.destination).countryId === activeCountry)?.id
            }
            onSaved={(savedTripId) => {
              setAdding(false);
              setNotice("Saved. Finding places…");
              void library.reload();
              const savedTrip = trips.find((trip) => trip.id === savedTripId);
              if (savedTrip)
                router.push(
                  `/inspiration-library?${new URLSearchParams({ country: destinationLocation(savedTrip.destination).countryId, ...(scopedTrip?.id === savedTrip.id ? { trip: savedTrip.id } : {}) })}`,
                );
            }}
          />
        </LibraryDialog>
      )}
      {selected && (
        <LibraryDialog title="Saved inspiration" drawer onDismiss={() => setSelectedId(null)}>
          <div className="lib-detail">
            <SaveDetail key={selected.save.id} item={selected} onChange={() => void library.reload()} />
          </div>
        </LibraryDialog>
      )}
    </div>
  );
}

function CountryCover({ countryId, name }: { countryId: string; name: string }) {
  const position = ({ JP: "0%", KR: "50%", TH: "100%" } as Record<string, string>)[countryId];
  return (
    <div className={`library-country-cover${countryId === "unsorted" ? " is-unsorted" : ""}`}>
      {position ? (
        <div className="library-country-photo" style={{ backgroundPosition: `${position} center` }} />
      ) : countryId === "unsorted" ? (
        <Icon name="globe" size={60} />
      ) : (
        <CoverArt seed={name} showLabel={false} />
      )}
      {countryId !== "unsorted" && <span className="library-art-label">Illustrative cover</span>}
    </div>
  );
}

function SavePreview({ item }: { item: SaveItem }) {
  const [failed, setFailed] = useState(false);
  const { save } = item;
  if (save.assetId && !failed)
    return (
      <img
        className="library-source-image"
        src={uploadUrl(save.assetId)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  const excerpt = save.text || save.note || save.details;
  return (
    <span className={`library-source-preview tone-${item.categories[0]?.replace(/[^a-z]/gi, "").toLowerCase()}`}>
      <Icon name={CATEGORY_ICON[item.categories[0] ?? "Unsorted"] ?? "library"} size={28} />
      {excerpt ? (
        <span className="library-excerpt">{excerpt}</span>
      ) : (
        <>
          <span className="library-link-title">
            {failed ? "Screenshot unavailable" : "A little travel inspiration"}
          </span>
          <span className="library-link-host">
            {save.url ? new URL(save.url).hostname.replace(/^www\./, "") : "Open to view details"}
          </span>
        </>
      )}
    </span>
  );
}

function SaveTile({ item, showCountry, onOpen }: { item: SaveItem; showCountry: boolean; onOpen: () => void }) {
  const state = saveState(item.save, item.places);
  return (
    <button
      type="button"
      className="library-save"
      aria-label={`Open ${item.title}`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span className="library-save-visual">
        <SavePreview item={item} />
        <span className="library-source-badge">
          <Icon name={SOURCE_ICON[item.save.sourceType]} size={13} />
          {SOURCE_LABEL[item.save.sourceType]}
        </span>
      </span>
      <span className="library-save-info">
        <strong className="library-save-title">{item.title}</strong>
        <span className="library-save-location">
          {[item.location.city, showCountry ? item.location.country : null, item.categories[0]]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="library-save-footer">
          {item.sample && <span className="library-sample">Sample data</span>}
          {item.places.some(place => place.evidence.some(e => e.inspirationId === item.save.id && e.classification))
            && <span className="library-sample">AI labels</span>}
          {(state.tone !== "success" || item.location.countryId === "unsorted") && (
            <span className={`lib-status is-${item.location.countryId === "unsorted" ? "warning" : state.tone}`}>
              {item.location.countryId === "unsorted" ? "Check country" : state.label}
            </span>
          )}
          <Icon name="arrowRight" size={16} />
        </span>
      </span>
    </button>
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
          <Icon name={SOURCE_ICON[save.sourceType]} size={15} />
          {SOURCE_LABEL[save.sourceType]} · saved {formatTimestamp(save.createdAt)}
        </p>
        <Link href={`/my-trip/${trip.id}/itinerary`}>{trip.title}</Link>
      </div>
      {item.sample && <p className="library-help">Sample data · These venue names and details are fictional.</p>}
      <section className="lib-detail-section">
        <h3>Filed under</h3>
        <p>
          {item.location.country}
          {item.location.city ? ` · ${item.location.city}` : ""}
        </p>
        <div className="library-detail-tags">
          {item.categories.map((cat) => (
            <span key={cat}>{cat}</span>
          ))}
        </div>
        <p className="small muted">Country follows your trip destination. Place matches still need your review.</p>
        <Link className="small" href={`/my-trip/${trip.id}/setup`}>
          Edit trip destination
        </Link>
      </section>
      {places.length > 0 && (
        <section className="lib-detail-section" aria-labelledby="lib-places-title">
          <div className="row between">
            <h3 id="lib-places-title">Places found</h3>
            <Link className="small" href={`/my-trip/${trip.id}/places`}>
              Review places
            </Link>
          </div>
          <ul className="lib-places">
            {places.map((place) => (
              <li key={place.id}>
                <span>
                  <Icon name="pin" size={15} /> {place.name}
                </span>
                <span className="muted small">{placeStatus[place.status].label}</span>
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
