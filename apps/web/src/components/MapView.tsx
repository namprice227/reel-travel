"use client";

import "leaflet/dist/leaflet.css";
import type { LatLng } from "@reel/contracts";
import L from "leaflet";
import { useEffect, useMemo, type ReactNode } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
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
  height?: number;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  interactive?: boolean;
}) {
  const center = markers[0]?.position ?? { lat: 35.68, lng: 139.76 };
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom={false}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      keyboard={interactive}
      style={{ height, width: "100%" }}
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
          pathOptions={{ color: line.color ?? "#1d4ed8", weight: 3, opacity: 0.75, dashArray: line.dashed ? "6 8" : undefined }}
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
            pathOptions={{ color: marker.color ?? "#1d4ed8", fillOpacity: 0.85 }}
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
