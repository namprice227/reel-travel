"use client";

import "leaflet/dist/leaflet.css";
import type { LatLng } from "@reel/contracts";
import { useEffect, type ReactNode } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
  color?: string;
  popup?: ReactNode;
}

export interface MapLine {
  id: string;
  points: LatLng[];
  color?: string;
}

/** Leaflet + OpenStreetMap tiles (attribution required). Loaded client-side only via PlaceMap. */
export default function MapView({ markers, lines = [], height = 380 }: { markers: MapMarker[]; lines?: MapLine[]; height?: number }) {
  const center = markers[0]?.position ?? { lat: 35.68, lng: 139.76 };
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} scrollWheelZoom={false} style={{ height, width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToMarkers markers={markers} />
      {lines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.points.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: line.color ?? "#2563eb", weight: 3, opacity: 0.6 }}
        />
      ))}
      {markers.map((marker) => (
        <CircleMarker
          key={marker.id}
          center={[marker.position.lat, marker.position.lng]}
          radius={9}
          pathOptions={{ color: marker.color ?? "#2563eb", fillOpacity: 0.85 }}
        >
          <Popup>
            <strong>{marker.label}</strong>
            {marker.popup}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function FitToMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  const key = markers.map((m) => `${m.position.lat},${m.position.lng}`).join("|");
  useEffect(() => {
    if (markers.length > 1) {
      map.fitBounds(
        markers.map((m) => [m.position.lat, m.position.lng] as [number, number]),
        { padding: [30, 30] },
      );
    } else if (markers.length === 1) {
      map.setView([markers[0]!.position.lat, markers[0]!.position.lng], 14);
    }
    // Refit only when positions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}
