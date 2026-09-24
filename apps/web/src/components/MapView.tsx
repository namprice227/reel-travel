"use client";

import type { LatLng } from "@reel/contracts";
import { useEffect, useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import {
  GOOGLE_MAPS_EMBED_KEY,
  getGoogleMapsEmbedPlaceUrl,
  getGoogleMapsEmbedRouteUrl,
  getGoogleMapsPlaceUrl,
  getGoogleMapsRouteUrl,
} from "@/lib/maps";

/**
 * Every map is Google Maps in an iframe, so the page needs no map script and no third-party tiles.
 * Several stops show the day's route through the Maps Embed API when NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY is set;
 * picking a stop zooms to it. Without the key, the keyless embed shows one stop at a time.
 * Only coordinates are sent to Google, never place names, so fictional fixtures stay local.
 */

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
  provider?: string;
  attribution?: string;
  color?: string;
  popup?: ReactNode;
  /** Itinerary order, shown on the stop buttons. */
  number?: number;
}

/** Kept for callers that pass route lines; Google draws the route itself. */
export interface MapLine {
  id: string;
  points: LatLng[];
  color?: string;
  dashed?: boolean;
}

export default function MapView({
  markers,
  height = 380,
  activeId,
  onSelect,
  interactive = true,
  renderer = "auto",
  travel,
  chrome = true,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  /** Pixels, or a CSS length such as "100%" to fill a sized parent. */
  height?: number | string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  interactive?: boolean;
  /** "google" shows one place at a time; "journey" and "auto" show the whole route when they can. */
  renderer?: "auto" | "google" | "journey";
  /** How the traveler gets around; picks the route mode. */
  travel?: "walk" | "transit" | "car";
  /** Stop buttons and the caption; off where the page already lists the stops and links to Google Maps. */
  chrome?: boolean;
}) {
  const key = GOOGLE_MAPS_EMBED_KEY;
  const canShowRoute = renderer !== "google" && markers.length > 1 && Boolean(key);
  const [localId, setLocalId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(canShowRoute && !activeId);
  // A stop chosen elsewhere on the page (the timeline, the stop list) zooms the map to it.
  useEffect(() => { if (activeId) setShowAll(false); }, [activeId]);

  if (!markers.length) return <div className="map-placeholder">No mapped stops</div>;
  const selected = markers.find((m) => m.id === activeId) ?? markers.find((m) => m.id === localId) ?? markers[0]!;
  const overview = canShowRoute && showAll;
  const src = overview
    ? getGoogleMapsEmbedRouteUrl({ key, points: markers.map((m) => m.position), travel })!
    : getGoogleMapsEmbedPlaceUrl({ key, location: selected.position });
  const external = overview ? getGoogleMapsRouteUrl(markers) ?? getGoogleMapsPlaceUrl({ location: selected.position })
    : getGoogleMapsPlaceUrl({ location: selected.position });
  const label = overview ? `Route through ${markers.length} stops` : selected.label.replace(/^\d+\.\s*/, "");
  const synthetic = markers.some((m) => m.provider === "fixture");

  function pick(id: string) {
    setLocalId(id);
    setShowAll(false);
    onSelect?.(id);
  }

  return (
    <div className="trip-google-map" style={{ height }}>
      <div className="trip-google-frame-wrap">
        <GoogleMapFrame key={src} src={src} label={label} interactive={interactive} />
        {!interactive && (
          <a href={external} target="_blank" rel="noreferrer noopener" className="trip-google-clickable-overlay"
            title={`Open ${label} in Google Maps`} aria-label={`Open ${label} in Google Maps`}>
            <span className="trip-google-overlay-badge">
              <Icon name="map" size={12} /> Open in Google Maps <Icon name="external" size={11} />
            </span>
          </a>
        )}
      </div>
      {chrome && markers.length > 1 && interactive && (
        <div className="trip-google-stops" role="group" aria-label="Select mapped stop">
          {canShowRoute && (
            <button type="button" aria-pressed={overview} onClick={() => setShowAll(true)}>
              <Icon name="route" size={14} /> All stops
            </button>
          )}
          {markers.map((marker) => (
            <button key={marker.id} type="button" aria-pressed={!overview && marker.id === selected.id} onClick={() => pick(marker.id)}>
              {marker.number !== undefined && <span>{marker.number}</span>}
              {marker.label.replace(/^\d+\.\s*/, "")}
            </button>
          ))}
        </div>
      )}
      {chrome && <div className="trip-google-caption">
        <span>{synthetic ? "Sample coordinates" : overview ? "Route on Google Maps" : "Mapped via Google Maps"}</span>
        <a href={external} target="_blank" rel="noreferrer noopener">
          Open in Google Maps <Icon name="external" size={12} />
        </a>
      </div>}
    </div>
  );
}

function GoogleMapFrame({ src, label, interactive }: { src: string; label: string; interactive: boolean }) {
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  return <div className="trip-google-frame">
    {loading && !failed && <span className="trip-google-loading" role="status">{slow ? "Map is taking longer to load. You can open it in Google Maps below." : "Loading Google Maps…"}</span>}
    {failed ? <span className="trip-google-loading" role="status">Map unavailable. Open it in Google Maps below.</span> : <iframe
      title={`Google Maps: ${label}`} src={src} loading="lazy" allowFullScreen
      referrerPolicy="no-referrer-when-downgrade" tabIndex={interactive ? 0 : -1}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}
    />}
  </div>;
}
