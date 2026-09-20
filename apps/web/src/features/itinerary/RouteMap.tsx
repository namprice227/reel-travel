"use client";

import type { PublicItinerary, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { StopArt } from "@/components/Illustration";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { formatDay } from "@/lib/format";
import { infoFor, type PlaceInfoMap } from "./place-info";

// The enlarged map (design "Sky 3 · 08 Route map"): the day's stops in order with the travel between them,
// beside a map of every stop. Other days' places stay visible as small dots so nothing is lost.

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  const stops = day?.stops ?? [];
  const located = stops.filter((s) => s.location);
  const pinNumber = new Map(located.map((s, i) => [s.id, i + 1]));
  const travel = stops.reduce((total, s) => total + s.travelMinutesBefore, 0);

  const dayMarkers: MapMarker[] = located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id), provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution }));
  const otherMarkers: MapMarker[] = scope === "trip"
    ? itinerary.days.flatMap((d, i) => (i === dayIndex ? [] : d.stops.filter((s) => s.location).map((s) => ({ id: s.id, position: s.location!, label: `Day ${i + 1} · ${s.title}`, color: "#9fb6d0", provider: infoFor(s, places)?.provider }))))
    : [];
  const lines = dayMarkers.length > 1 ? [{ id: day!.date, points: dayMarkers.map((m) => m.position), dashed: true }] : [];
  const active = stops.find((s) => s.id === activeId) ?? null;

  return (
    <section className="route-map fit-fill">
      <div className="route-toolbar">
        <div className="day-chips" role="tablist" aria-label="Trip days">
          {itinerary.days.map((d, i) => (
            <button key={d.date} type="button" role="tab" aria-selected={i === dayIndex} className={i === dayIndex ? "active" : undefined} onClick={() => { onSelectDay(i); setActiveId(null); }}>
              Day {i + 1}<small>{formatDay(d.date).replace(/^(\w{3})\w* /, "$1 ")}</small>
            </button>
          ))}
        </div>
        <div className="scope-toggle" role="group" aria-label="Show on map">
          <button type="button" aria-pressed={scope === "day"} onClick={() => setScope("day")}>This day</button>
          <button type="button" aria-pressed={scope === "trip"} onClick={() => setScope("trip")}>Whole trip</button>
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
              <button type="button" className={`route-stop${stop.id === activeId ? " active" : ""}`} onClick={() => setActiveId(stop.id === activeId ? null : stop.id)} aria-pressed={stop.id === activeId}>
                <span className={`pin-num${stop.id === activeId ? " is-active" : ""}${pinNumber.get(stop.id) ? "" : " is-none"}`}>{pinNumber.get(stop.id) ?? "–"}</span>
                <StopArt category={infoFor(stop, places)?.category} kind={stop.kind} size="sm" />
                <span className="route-stop-text">
                  <strong>{stop.title}</strong>
                  <small>{stop.start} – {stop.end}{infoFor(stop, places)?.address ? ` · ${infoFor(stop, places)!.address}` : ""}</small>
                </span>
              </button>
            </div>
          ))}
        </aside>

        <div className="route-canvas">
          {dayMarkers.length > 0 || otherMarkers.length > 0 ? (
            <PlaceMap markers={[...otherMarkers, ...dayMarkers]} lines={lines} height="100%" activeId={activeId} onSelect={(id) => setActiveId(id)} />
          ) : (
            <div className="map-placeholder" style={{ height: "100%", minHeight: 360 }}>No stops with a location on this day.</div>
          )}
          <span className="route-canvas-label">{scope === "trip" ? "This day numbered; other days as grey dots" : "Estimated connections, not routes"}</span>
          {active && (
            <div className="route-card" role="region" aria-label={`Selected stop: ${active.title}`}>
              <StopArt category={infoFor(active, places)?.category} kind={active.kind} size="sm" />
              <span className="route-card-text">
                <small>{active.start} – {active.end}</small>
                <strong>{active.title}</strong>
              </span>
              {directionsUrl(active) && <a className="btn btn-primary btn-small" href={directionsUrl(active)} target="_blank" rel="noreferrer noopener"><Icon name="route" size={15} /> Directions</a>}
              <Link className="btn btn-small" href={`/my-trip/${tripId}/itinerary?day=${dayIndex + 1}`}><Icon name="magazine" size={15} /> In the day</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
