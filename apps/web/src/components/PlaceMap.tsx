"use client";

import dynamic from "next/dynamic";

export type { MapLine, MapMarker } from "./MapView";

/** Leaflet needs `window`, so the map renders only in the browser. */
export const PlaceMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map-placeholder">Loading map…</div>,
});

export const DAY_COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04"];
