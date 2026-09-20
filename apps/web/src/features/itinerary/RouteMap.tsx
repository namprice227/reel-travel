"use client";

import type { PublicItinerary, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PlaceImage } from "@/components/PlacePhoto";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { formatDay } from "@/lib/format";
import { getGoogleMapsRouteUrl } from "@/lib/maps";
import { infoFor, type PlaceInfoMap } from "./place-info";

// Browse saved coordinates on Google Maps; actual navigation opens externally.

const TRAVEL_ICON: Record<string, IconName> = { walk: "walk", transit: "transit", car: "car" };
const directionsUrl = (stop: PublicStop) =>
  stop.location ? `https://www.google.com/maps/dir/?api=1&destination=${stop.location.lat},${stop.location.lng}` : undefined;

export function RouteMap({
  itinerary,
  places,
  dayIndex,
  onSelectDay,
  tripId,
  transport,
}: {
  itinerary: PublicItinerary;
  places: PlaceInfoMap;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  tripId: string;
  transport: string;
}) {
  const [scope, setScope] = useState<"day" | "trip">("day");
  const search = useSearchParams();
  const activeId = search.get("stop");
  const setActiveId = (id: string | null) => {
    const query = new URLSearchParams(search.toString());
    if (id) query.set("stop", id); else query.delete("stop");
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  };
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  const stops = day?.stops ?? [];
  const located = stops.filter((s) => s.location);
  const pinNumber = new Map(located.map((s, i) => [s.id, i + 1]));
  const travel = stops.reduce((total, s) => total + s.travelMinutesBefore, 0);

  const dayMarkers: MapMarker[] = located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id), provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution }));
  const markers: MapMarker[] = scope === "trip"
    ? itinerary.days.flatMap((d, i) => d.stops.filter((s) => s.location).map((s) => ({ id: s.id, position: s.location!, label: `Day ${i + 1} · ${s.title}`, provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution })))
    : dayMarkers;
  const visibleStops = scope === "trip" ? itinerary.days.flatMap((d) => d.stops) : stops;
  const selectedId = visibleStops.some((s) => s.id === activeId) ? activeId : markers[0]?.id;
  const activeDay = itinerary.days.findIndex((d) => d.stops.some((s) => s.id === selectedId));
  const active = itinerary.days[activeDay]?.stops.find((s) => s.id === selectedId) ?? null;

  return (
    <section className="route-map fit-fill">
      <div className="route-toolbar">
        <div className="day-chips" role="group" aria-label="Trip days">
          {itinerary.days.map((d, i) => (
            <button key={d.date} type="button" aria-pressed={i === dayIndex} className={i === dayIndex ? "active" : undefined} onClick={() => onSelectDay(i)}>
              Day {i + 1}<small>{formatDay(d.date).replace(/^(\w{3})\w* /, "$1 ")}</small>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {dayMarkers.length > 0 && (
            <a
              className="btn btn-outline btn-small"
              href={getGoogleMapsRouteUrl(dayMarkers)}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="map" size={15} /> Day {dayIndex + 1} directions <Icon name="external" size={12} />
            </a>
          )}
          <div className="scope-toggle" role="group" aria-label="Show on map">
            <button type="button" aria-pressed={scope === "day"} onClick={() => setScope("day")}>This day</button>
            <button type="button" aria-pressed={scope === "trip"} onClick={() => setScope("trip")}>Whole trip</button>
          </div>
        </div>
      </div>

      <div className="route-split">
        <aside className="route-list panel-scroll" aria-label={`Day ${dayIndex + 1} route`}>
          <div className="route-list-head">
            <h2>Day {dayIndex + 1} route</h2>
            <span className="muted small">{travel > 0 ? `${travel} min travel` : "No travel estimated"}</span>
          </div>
          {stops.length === 0 && <p className="muted small">Free day.</p>}
          {stops.map((stop) => (
            <div key={stop.id}>
              {stop.travelMinutesBefore > 0 && (
                <div className="route-leg">
                  <Icon name={TRAVEL_ICON[transport] ?? "route"} size={15} />
                  ≈ {stop.travelMinutesBefore} min {transport === "walk" ? "walk" : transport === "car" ? "drive" : "by transit"}
                  {directionsUrl(stop) && <a href={directionsUrl(stop)} target="_blank" rel="noreferrer noopener">Directions</a>}
                </div>
              )}
              <button type="button" className={`route-stop${stop.id === selectedId ? " active" : ""}`} onClick={() => setActiveId(stop.id)} aria-pressed={stop.id === selectedId}>
                <span className={`pin-num${stop.id === selectedId ? " is-active" : ""}${pinNumber.get(stop.id) ? "" : " is-none"}`}>{pinNumber.get(stop.id) ?? "–"}</span>
                <PlaceImage photo={infoFor(stop, places)?.photo} category={infoFor(stop, places)?.category} size="sm" width={100} alt={stop.title} />
                <span className="route-stop-text">
                  <strong>{stop.title}</strong>
                  <small>{stop.start} – {stop.end}{infoFor(stop, places)?.address ? ` · ${infoFor(stop, places)!.address}` : ""}</small>
                </span>
              </button>
            </div>
          ))}
        </aside>

        <div className="route-canvas">
          {active && !active.location ? (
            <div className="map-placeholder" style={{ flex: 1, minHeight: 200 }}>No saved location for this stop.</div>
          ) : markers.length > 0 ? (
            <PlaceMap renderer="google" markers={markers} height="100%" activeId={selectedId} onSelect={(id) => setActiveId(id)} />
          ) : (
            <div className="map-placeholder" style={{ height: "100%", minHeight: 360 }}>No stops with a location on this day.</div>
          )}
          {active && (
            <div className="route-card" role="region" aria-label={`Selected stop: ${active.title}`}>
              <PlaceImage photo={infoFor(active, places)?.photo} category={infoFor(active, places)?.category} size="sm" width={100} alt={active.title} />
              <span className="route-card-text">
                <small>{active.start} – {active.end}</small>
                <strong>{active.title}</strong>
              </span>
              <Link className="btn btn-primary btn-small" href={`/my-trip/${tripId}/itinerary?day=${activeDay + 1}&stop=${encodeURIComponent(active.id)}`}><Icon name="magazine" size={15} /> View in day {activeDay + 1}</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
