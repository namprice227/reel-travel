"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StopArt } from "@/components/Illustration";
import { Icon } from "@/components/icons";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { countryCoverStyle, hasDedicatedCountryCover } from "@/lib/country-cover";
import { AccountPlacePhoto } from "./AccountPlacePhoto";
import { LibraryDialog } from "./LibraryDialog";
import {
  buildAccountLibrary,
  matchesAccountPlace,
  type AccountLibraryPlace,
} from "./account-library-model";

const CATEGORY_ORDER = ["Food & drink", "Attractions", "Nature", "Shopping", "Stays", "Other"];

export function InspirationLibraryPage({ countryId, placeId }: { countryId?: string; placeId?: string }) {
  const library = useApi("accountReels.library", {}, {
    pollMs: ({ reels }) => reels.some((reel) => reel.status === "queued" || reel.status === "processing") ? 1500 : false,
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(placeId ?? null);
  const [mappingOldPlaces, setMappingOldPlaces] = useState(0);
  const [mappingFailure, setMappingFailure] = useState<string | null>(null);
  const attemptedMappings = useRef(new Set<string>());
  const albums = useMemo(
    () => buildAccountLibrary(library.data?.reels ?? [], library.data?.places ?? []),
    [library.data],
  );
  const activeAlbum = albums.find((album) => album.id === countryId);
  const selected = albums.flatMap((album) => album.places).find((place) => place.id === selectedId);
  const working = library.data?.reels.filter((reel) => reel.status === "queued" || reel.status === "processing").length ?? 0;
  const remapKey = [...new Set((activeAlbum?.places ?? [])
    .filter((place) => !place.originTripId && !place.source.tripId && place.country && place.mappingStatus === "unverified" && place.options.length === 0)
    .map((place) => place.reelId))].sort().join("|");

  useEffect(() => {
    const reelIds = remapKey.split("|").filter((id) => id && !attemptedMappings.current.has(id));
    if (!reelIds.length) return;
    reelIds.forEach((id) => attemptedMappings.current.add(id));
    let active = true;
    setMappingOldPlaces(reelIds.length);
    setMappingFailure(null);
    void (async () => {
      try {
        for (const reelId of reelIds) await api("accountReels.mapPlaces", { params: { reelId } });
        if (active) setMappingOldPlaces(0);
        await library.reload();
      } catch (error) {
        if (active) {
          setMappingOldPlaces(0);
          setMappingFailure(error instanceof Error ? error.message : "Place mapping failed.");
        }
      }
    })();
    return () => { active = false; };
    // remapKey changes only when an eligible reel enters or leaves the active country album.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapKey]);

  if (library.loading && !library.data) return <Loading />;
  if (library.error && !library.data) return <ErrorBanner error={library.error} />;

  const categories = activeAlbum
    ? CATEGORY_ORDER.filter((label) => activeAlbum.places.some((place) => place.categoryLabel === label))
    : [];
  const shown = activeAlbum?.places.filter((place) => matchesAccountPlace(place, query, category)) ?? [];
  const knownAlbums = albums.filter((album) => album.id !== "unknown");
  const unknownAlbum = albums.find((album) => album.id === "unknown");

  return (
    <div className="fit-page library-page account-library-page">
      <header className="page-head library-header account-library-header">
        <div className="page-head-titles">
          <h1>Inspiration library</h1>
          <p>All places from your saved reels, organised by country—including reels used to create trips.</p>
        </div>
        <Link className="btn btn-primary" href="/home">
          <Icon name="plus" size={18} /> <span>Save a reel</span>
        </Link>
      </header>

      {library.error && <ErrorBanner error={library.error} />}
      {working > 0 && (
        <p className="account-library-progress" role="status">
          <Icon name="sparkle" size={17} /> Reading {working} saved {working === 1 ? "reel" : "reels"}. New places will appear here.
        </p>
      )}
      {mappingOldPlaces > 0 && (
        <p className="account-library-progress" role="status">
          <Icon name="map" size={17} /> Mapping existing {mappingOldPlaces === 1 ? "reel" : "reels"} to Google Maps…
        </p>
      )}
      {mappingFailure && (
        <p className="account-library-progress is-warning" role="status">
          <Icon name="info" size={17} /> {mappingFailure}
        </p>
      )}

      {!countryId ? (
        <div className="library-content fit-fill panel-scroll">
          <div className="library-section-heading account-library-section-heading">
            <div>
              <span className="account-library-eyebrow">Browse your inspiration</span>
              <h2>Your countries</h2>
            </div>
            <span>{albums.reduce((total, album) => total + album.places.length, 0)} place ideas from your saved reels</span>
          </div>

          {albums.length ? (
            <>
              <div className="library-albums account-library-albums">
                {knownAlbums.map((album) => (
                  <Link key={album.id} href={`/inspiration-library?country=${album.id}`} className="library-album"
                    aria-label={`Open ${album.name}, ${album.places.length} place ideas`}>
                    <CountryArtwork countryId={album.id} />
                    <div className="library-album-info">
                      <div>
                        <h3>{album.name}</h3>
                        <span>{album.places.length} {album.places.length === 1 ? "place idea" : "place ideas"}</span>
                      </div>
                      <Icon name="arrowRight" size={20} />
                      <p>{album.areas.slice(0, 3).join(" · ") || "Ideas from across the country"}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {unknownAlbum && (
                <Link href="/inspiration-library?country=unknown" className="account-library-unknown">
                  <span className="account-library-unknown-icon"><Icon name="globe" size={24} /></span>
                  <span><strong>Unknown country</strong><small>{unknownAlbum.places.length} {unknownAlbum.places.length === 1 ? "place needs" : "places need"} a source-supported country</small></span>
                  <Icon name="arrowRight" size={18} />
                </Link>
              )}
              <p className="library-footnote"><Icon name="sparkle" size={17} /> Country labels come from source evidence or the linked trip destination.</p>
            </>
          ) : (
            <Empty title={working ? "Finding your first places" : "Your place library is empty"}>
              <span className="library-empty-copy">
                {working ? "Routelet is reading your saved reels." : "Save a reel on Home. Places found in it will appear here."}
              </span>
              {!working && <Link className="btn btn-primary" href="/home"><Icon name="plus" size={18} /> <span>Save a reel</span></Link>}
            </Empty>
          )}
        </div>
      ) : activeAlbum ? (
        <div className="library-content fit-fill panel-scroll">
          <nav className="library-breadcrumb" aria-label="Breadcrumb">
            <Link href="/inspiration-library"><Icon name="arrowLeft" size={16} /> All countries</Link>
            <span>/</span><span aria-current="page">{activeAlbum.name}</span>
          </nav>
          <CountryHero countryId={activeAlbum.id} name={activeAlbum.name} count={activeAlbum.places.length} />
          {activeAlbum.id === "unknown" && (
            <p className="library-help">These ideas remain here because their sources did not explicitly name a country.</p>
          )}
          <div className="library-section-heading account-place-heading">
            <h2>Places in {activeAlbum.name}</h2>
            <span>Names and locations still need checking</span>
          </div>
          <div className="library-search-row">
            <label className="lib-search" htmlFor="account-library-search">
              <Icon name="search" size={19} />
              <span className="sr-only">Search places</span>
              <input id="account-library-search" type="search" value={query}
                onChange={(event) => setQuery(event.target.value)} placeholder="Search place names, areas or categories" />
            </label>
          </div>
          <div className="library-categories" role="group" aria-label="Filter places by category">
            {["All", ...categories].map((label) => (
              <button type="button" key={label} className="library-category" aria-pressed={category === label}
                onClick={() => setCategory(label)}>
                {label}<span>{label === "All" ? activeAlbum.places.length : activeAlbum.places.filter((place) => place.categoryLabel === label).length}</span>
              </button>
            ))}
          </div>
          {shown.length ? (
            <div className="account-place-grid">
              {shown.map((place) => <PlaceCard key={place.id} place={place} onOpen={() => setSelectedId(place.id)} />)}
            </div>
          ) : (
            <Empty title="No matching places">
              <span className="library-empty-copy">Try another search or category.</span>
              <button type="button" className="btn" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button>
            </Empty>
          )}
        </div>
      ) : (
        <Empty title="Country collection unavailable">
          <Link href="/inspiration-library">Open all countries</Link>
        </Empty>
      )}

      {selected && (
        <LibraryDialog title="Extracted place idea" drawer onDismiss={() => setSelectedId(null)}>
          <PlaceDetail place={selected} />
        </LibraryDialog>
      )}
    </div>
  );
}

function CountryArtwork({ countryId }: { countryId: string }) {
  return (
    <div className={`library-country-cover${countryId === "unknown" ? " is-unsorted" : ""}`}>
      {countryId === "unknown" ? <Icon name="globe" size={60} />
        : <div className="library-country-photo" style={countryCoverStyle(countryId)} />}
      {countryId !== "unknown" && <span className="library-art-label">
        {hasDedicatedCountryCover(countryId) ? "Illustrative country image" : "Illustrative travel image"}
      </span>}
    </div>
  );
}

function CountryHero({ countryId, name, count }: { countryId: string; name: string; count: number }) {
  return (
    <div className={`account-country-hero${countryId === "unknown" ? " is-unknown" : ""}`}>
      {countryId !== "unknown" && <div className="account-country-hero-photo" style={countryCoverStyle(countryId)} />}
      <div className="account-country-hero-shade" />
      <div className="account-country-hero-copy"><h2>{name}</h2><p>{count} {count === 1 ? "place idea" : "place ideas"} from your reels</p></div>
      <span className="library-art-label">{countryId === "unknown" ? "Location needed"
        : hasDedicatedCountryCover(countryId) ? "Illustrative country image" : "Illustrative travel image"}</span>
    </div>
  );
}

function PlaceCard({ place, onOpen }: { place: AccountLibraryPlace; onOpen: () => void }) {
  const photoOption = (place.mappingStatus === "pending" || place.mappingStatus === "ambiguous")
    && place.options[0]?.details.provider === "google"
    ? place.options[0] : null;
  const fallback = <>
    {place.countryId !== "unknown" ? <span className="account-place-country-photo" style={countryCoverStyle(place.countryId)} />
      : <StopArt category={place.category} size="lg" />}
    <span className="account-place-art-label">Illustrative</span>
  </>;
  return (
    <article className="account-place-card">
      <div className="account-place-art">
        {photoOption ? (
          <AccountPlacePhoto tripId={place.originTripId} reelId={place.reelId} placeId={place.id} providerPlaceId={photoOption.providerPlaceId}
            name={photoOption.name} fallback={fallback} possibleMatch={place.mappingStatus === "ambiguous"} />
        ) : fallback}
      </div>
      <div className="account-place-info">
        <span className="account-place-kicker">
          <span className="account-place-category">{place.categoryLabel}</span>
          <span className={`account-place-map-status is-${place.mappingStatus}`}>{place.confirmed ? "Confirmed" : mappingLabel(place.mappingStatus)}</span>
        </span>
        <strong>{place.name}</strong>
        <span className="account-place-area">{place.options[0]?.address ?? place.area ?? "Area unknown"}</span>
        <span className="account-place-source"><Icon name="link" size={15} /> Source kept with idea <Icon name="arrowRight" size={16} /></span>
      </div>
      <button type="button" className="account-place-card-open" aria-label={`Open ${place.name}`}
        aria-haspopup="dialog" onClick={onOpen} />
    </article>
  );
}

function PlaceDetail({ place }: { place: AccountLibraryPlace }) {
  const markers: MapMarker[] = place.options.map((option, index) => ({
    id: option.providerPlaceId,
    position: option.location,
    label: option.name,
    provider: option.details.provider,
    attribution: option.details.attribution,
    number: place.options.length > 1 ? index + 1 : undefined,
  }));
  const matchName = place.options.length > 1 ? "Possible map matches" : "Matched place";
  return (
    <div className="account-place-detail">
      <span className="account-library-eyebrow">Source-backed idea</span>
      <h2>{place.name}</h2>
      <p className="lib-detail-meta">{[place.area ?? "Area unknown", place.countryName, place.categoryLabel, place.confirmed ? "Confirmed" : mappingLabel(place.mappingStatus)].join(" · ")}</p>
      <p className={`account-place-warning is-${place.mappingStatus}`}>{mappingMessage(place)}</p>
      {markers.length > 0 && (
        <section className="account-place-map-section">
          <h3>{matchName}</h3>
          <PlaceMap markers={markers} renderer="google" height={280} />
          <ol className="account-place-matches">
            {place.options.map((option) => (
              <li key={option.providerPlaceId}>
                <span><strong>{option.name}</strong>{option.address && <small>{option.address}</small>}</span>
                {place.options.length > 1 && <span>Candidate</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {place.excerpt && <section><h3>Clue from the reel</h3><p>“{place.excerpt}”</p></section>}
      {place.country && <section><h3>Country evidence</h3><p>“{place.country.excerpt}”</p></section>}
      <section><h3>Original reel</h3><a href={place.source.url} target="_blank" rel="noopener noreferrer">{place.source.url}</a></section>
    </div>
  );
}

function mappingLabel(status: AccountLibraryPlace["mappingStatus"]): string {
  switch (status) {
    case "pending": return "Mapped";
    case "ambiguous": return "Several matches";
    case "not_found": return "No map match";
    default: return "Not mapped";
  }
}

function mappingMessage(place: AccountLibraryPlace): string {
  if (place.confirmed) return "You confirmed this place in your trip.";
  switch (place.mappingStatus) {
    case "pending":
      return "Routelet automatically matched this location. The branch has not been confirmed by you yet.";
    case "ambiguous":
      return "Routelet found several possible locations. They remain candidates until you choose the right branch.";
    case "not_found":
      return "Routelet searched for this place but could not find a reliable map match.";
    default:
      return place.country
        ? "Routelet has not mapped this older place yet. Save or process the reel again to run location lookup."
        : "Routelet needs a country named in the source before it can safely search for this place.";
  }
}
