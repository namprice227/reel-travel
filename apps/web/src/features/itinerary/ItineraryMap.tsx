"use client";

import type { PublicItinerary } from "@reel/contracts";
import { DAY_COLORS, PlaceMap, type MapLine, type MapMarker } from "@/components/PlaceMap";
import { formatDay } from "@/lib/format";

/** Map view of one itinerary version: numbered stops and a route line per day. */
export function ItineraryMap({ itinerary }: { itinerary: PublicItinerary }) {
  const markers: MapMarker[] = [];
  const lines: MapLine[] = [];

  itinerary.days.forEach((day, dayIndex) => {
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
    const located = day.stops.filter((stop) => stop.location !== null);
    located.forEach((stop, i) =>
      markers.push({
        id: stop.id,
        position: stop.location!,
        label: `Day ${dayIndex + 1} · ${i + 1}. ${stop.title}`,
        color,
        popup: (
          <p className="small">
            {formatDay(day.date)} {stop.start}–{stop.end}
            {stop.locked ? " · locked booking" : ""}
          </p>
        ),
      }),
    );
    if (located.length > 1) lines.push({ id: day.date, points: located.map((s) => s.location!), color });
  });

  return (
    <div className="card stack">
      <div className="row">
        {itinerary.days.map((day, i) => (
          <span key={day.date} className="small" style={{ color: DAY_COLORS[i % DAY_COLORS.length] }}>
            ● Day {i + 1}
          </span>
        ))}
        <span className="muted small">v{itinerary.version}</span>
      </div>
      {markers.length > 0 ? <PlaceMap markers={markers} lines={lines} /> : <p className="muted">No stops with a location yet.</p>}
    </div>
  );
}
