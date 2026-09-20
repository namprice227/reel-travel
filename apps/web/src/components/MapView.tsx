"use client";

import "leaflet/dist/leaflet.css";
import type { LatLng } from "@reel/contracts";
import L from "leaflet";
import { useEffect, useMemo, type ReactNode } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

import { Icon } from "@/components/icons";
import { getGoogleMapsEmbedUrl, getGoogleMapsRouteUrl } from "@/lib/maps";

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
  provider?: string;
  attribution?: string;
  color?: string;
  popup?: ReactNode;
  /** Shows a numbered pin (itinerary order) instead of a dot. */
  number?: number;
}

export interface MapLine {
  id: string;
  points: LatLng[];
  color?: string;
  dashed?: boolean;
}

function GoogleMapView({
  markers,
  height,
  activeId,
  onSelect,
}: {
  markers: MapMarker[];
  height: number | string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const activeMarker = markers.find((m) => m.id === activeId) ?? markers[0];
  const center = activeMarker?.position ?? markers[0]?.position ?? { lat: 35.68, lng: 139.76 };
  const routeUrl = getGoogleMapsRouteUrl(markers);
  const embedUrl = getGoogleMapsEmbedUrl({
    location: center,
    label: activeMarker?.label,
    zoom: markers.length > 1 && !activeId ? 12 : 15,
  });

  return (
    <div className="google-map-container" style={{ height, width: "100%", position: "relative" }}>
      <iframe
        title="Google Maps"
        src={embedUrl}
        width="100%"
        height="100%"
        style={{ border: 0, borderRadius: "inherit" }}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="google-map-bar">
        <span className="google-map-badge">
          <Icon name="map" size={14} /> Google Maps
        </span>
        {routeUrl && (
          <a
            href={routeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="google-map-open-btn"
          >
            <span>Open in Google Maps</span>
            <Icon name="external" size={13} />
          </a>
        )}
      </div>
      {markers.length > 1 && (
        <div className="google-map-stops-rail">
          {markers.map((marker) => {
            const isSelected = marker.id === activeMarker?.id;
            return (
              <button
                key={marker.id}
                type="button"
                className={`google-map-stop-chip${isSelected ? " is-active" : ""}`}
                onClick={() => onSelect?.(marker.id)}
              >
                {marker.number !== undefined && <span className="pin-num is-small">{marker.number}</span>}
                <span>{marker.label.replace(/^\d+\.\s*/, "")}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Leaflet + OpenStreetMap tiles (attribution required). Loaded client-side only via PlaceMap. */
export default function MapView({
  markers,
  lines = [],
  height = 380,
  activeId,
  onSelect,
  interactive = true,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  /** Pixels, or a CSS length such as "100%" to fill a sized parent. */
  height?: number | string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  interactive?: boolean;
}) {
  // When places use Google provider data, display Google Maps instead of OpenStreetMap.
  if (markers.some((marker) => marker.provider === "google")) {
    return <GoogleMapView markers={markers} height={height} activeId={activeId} onSelect={onSelect} />;
  }
  const center = markers[0]?.position ?? { lat: 35.68, lng: 139.76 };
  const googleRouteUrl = getGoogleMapsRouteUrl(markers);

  return (
    <div className="map-view-wrapper" style={{ height, width: "100%", position: "relative" }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        keyboard={interactive}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMarkers markers={markers} />
        {lines.map((line) => (
          <Polyline
            key={line.id}
            positions={line.points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: line.color ?? "#1a6ad0", weight: 3, opacity: 0.75, dashArray: line.dashed ? "6 8" : undefined }}
          />
        ))}
        {markers.map((marker) =>
          marker.number !== undefined ? (
            <NumberedMarker key={marker.id} marker={marker} active={marker.id === activeId} onSelect={onSelect} />
          ) : (
            <CircleMarker
              key={marker.id}
              center={[marker.position.lat, marker.position.lng]}
              radius={9}
              pathOptions={{ color: marker.color ?? "#1a6ad0", fillOpacity: 0.85 }}
              eventHandlers={onSelect ? { click: () => onSelect(marker.id) } : undefined}
            >
              {!onSelect && (
                <Popup>
                  <strong>{marker.label}</strong>
                  {marker.popup}
                </Popup>
              )}
            </CircleMarker>
          ),
        )}
      </MapContainer>
      {markers.length > 0 && googleRouteUrl && (
        <a
          href={googleRouteUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="google-maps-float-btn"
          title="Open in Google Maps"
        >
          <Icon name="map" size={13} /> Open in Google Maps <Icon name="external" size={11} />
        </a>
      )}
    </div>
  );
}

function NumberedMarker({ marker, active, onSelect }: { marker: MapMarker; active: boolean; onSelect?: (id: string) => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<span class="map-pin${active ? " is-active" : ""}">${marker.number}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    [active, marker.number],
  );
  return (
    <Marker
      position={[marker.position.lat, marker.position.lng]}
      icon={icon}
      title={marker.label}
      alt={marker.label}
      zIndexOffset={active ? 1000 : 0}
      eventHandlers={onSelect ? { click: () => onSelect(marker.id) } : undefined}
    >
      {!onSelect && marker.popup && (
        <Popup>
          <strong>{marker.label}</strong>
          {marker.popup}
        </Popup>
      )}
    </Marker>
  );
}

function FitToMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  const key = markers.map((m) => `${m.position.lat},${m.position.lng}`).join("|");
  useEffect(() => {
    if (markers.length > 1) {
      map.fitBounds(
        markers.map((m) => [m.position.lat, m.position.lng] as [number, number]),
        { padding: [40, 40] },
      );
    } else if (markers.length === 1) {
      map.setView([markers[0]!.position.lat, markers[0]!.position.lng], 14);
    }
    // Refit only when positions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}
