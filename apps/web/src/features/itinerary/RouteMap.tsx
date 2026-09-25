"use client";

import type { Accommodation, PublicItinerary, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PlaceImage } from "@/components/PlacePhoto";
import { PlaceMap, type MapLine, type MapMarker } from "@/components/PlaceMap";
import { formatDay } from "@/lib/format";
import { GOOGLE_MAPS_EMBED_KEY, getGoogleMapsPlaceUrl, getGoogleMapsRouteUrl } from "@/lib/maps";
import { infoFor, type PlaceInfoMap } from "./place-info";
import { dayStayEnds, returnMinutes, withStayEnds } from "./stay-markers";

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
  stays = [],
}: {
  itinerary: PublicItinerary;
  places: PlaceInfoMap;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  tripId: string;
  transport: string;
  /** The owner's hotels; the day's route starts and ends at them. */
  stays?: Accommodation[];
}) {
  const [scope, setScope] = useState<"day" | "trip">("day");
  const [mapMode, setMapMode] = useState<"journey" | "google">("journey");
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
  const travel = stops.reduce((total, s) => total + (s.travelMinutesBefore ?? 0), 0);
  const unknownTravel = stops.some((s) => s.travelMinutesBefore === null);

  const hotel = day ? dayStayEnds(stays, day.date) : null;
  const back = returnMinutes(hotel, located.at(-1)?.location ?? null, transport);
  const stopMarkers: MapMarker[] = located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id), provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution }));
  const dayMarkers = withStayEnds(hotel, stopMarkers);
  const markers: MapMarker[] = scope === "trip"
    ? itinerary.days.flatMap((d, i) => d.stops.filter((s) => s.location).map((s) => ({ id: s.id, position: s.location!, label: `Day ${i + 1} · ${s.title}`, provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution })))
    : dayMarkers;
  const lines: MapLine[] = scope === "trip"
    ? itinerary.days.flatMap((d) => {
        const pts = d.stops.filter((s) => s.location).map((s) => s.location!);
        return pts.length > 1 ? [{ id: d.date, points: pts, dashed: true }] : [];
      })
    : located.length > 1
      ? [{ id: day.date, points: located.map((s) => s.location!), dashed: true }]
      : [];
  const visibleStops = scope === "trip" ? itinerary.days.flatMap((d) => d.stops) : stops;
  const chosenId = visibleStops.some((s) => s.id === activeId) || markers.some((m) => m.id === activeId) ? activeId : null;
  const selectedId = chosenId ?? stopMarkers[0]?.id ?? markers[0]?.id;
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
          {GOOGLE_MAPS_EMBED_KEY && markers.length > 1 && (
            <div className="scope-toggle" role="group" aria-label="Map style">
              <button type="button" aria-pressed={mapMode === "journey"} onClick={() => setMapMode("journey")}>Route ({markers.length} stops)</button>
              <button type="button" aria-pressed={mapMode === "google"} onClick={() => setMapMode("google")}>One stop</button>
            </div>
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
            <span className="muted small">{unknownTravel ? "Travel time partly unknown" : travel > 0 ? `${travel} min travel` : "No travel estimated"}</span>
          </div>
          {stops.length === 0 && <p className="muted small">Free day.</p>}
          {hotel?.start && stops.length > 0 && (
            <StayRow stay={hotel.start} edge="Start" markerId={hotel.startMarker?.id} selectedId={selectedId} onSelect={setActiveId} />
          )}
          {stops.map((stop) => (
            <div key={stop.id}>
              {stop.travelMinutesBefore === null && <div className="route-leg">Travel time unknown · arrival not checked</div>}
              {stop.travelMinutesBefore !== null && stop.travelMinutesBefore > 0 && (
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
          {hotel?.end && stops.length > 0 && (
            <div>
              {back !== null && back > 0 && (
                <div className="route-leg">
                  <Icon name={TRAVEL_ICON[transport] ?? "route"} size={15} />
                  ≈ {back} min {transport === "walk" ? "walk" : transport === "car" ? "drive" : "by transit"}
                </div>
              )}
              <StayRow stay={hotel.end} edge="End" markerId={hotel.endMarker?.hideChip ? hotel.startMarker?.id : hotel.endMarker?.id}
                selectedId={selectedId} onSelect={setActiveId} />
            </div>
          )}
        </aside>

        <div className="route-canvas">
          {active && !active.location ? (
            <div className="map-placeholder" style={{ flex: 1, minHeight: 200 }}>No saved location for this stop.</div>
          ) : markers.length > 0 ? (
            <PlaceMap
              renderer={mapMode === "journey" ? "journey" : "google"}
              lines={lines}
              markers={markers}
              height="100%"
              // The route view opens on the whole day; only a stop the traveler picked zooms the map in.
              activeId={mapMode === "journey" ? chosenId : selectedId}
              onSelect={(id) => setActiveId(id)}
              travel={transport === "walk" || transport === "transit" || transport === "car" ? transport : undefined}
            />
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
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {active.location && (
                  <a
                    className="btn btn-outline btn-small"
                    href={getGoogleMapsPlaceUrl({ location: active.location, name: active.title })}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`Open ${active.title} in Google Maps`}
                  >
                    <Icon name="map" size={13} /> Maps <Icon name="external" size={11} />
                  </a>
                )}
                <Link className="btn btn-primary btn-small" href={`/my-trip/${tripId}/itinerary?day=${activeDay + 1}&stop=${encodeURIComponent(active.id)}`}><Icon name="magazine" size={15} /> View in day {activeDay + 1}</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The hotel a day leaves from or returns to, in the route list. Selecting it zooms the map to the hotel. */
function StayRow({ stay, edge, markerId, selectedId, onSelect }: {
  stay: Accommodation; edge: "Start" | "End"; markerId?: string; selectedId?: string | null; onSelect: (id: string) => void;
}) {
  const active = Boolean(markerId && markerId === selectedId);
  return (
    <button type="button" className={`route-stop is-stay${active ? " active" : ""}`} disabled={!markerId}
      onClick={() => markerId && onSelect(markerId)} aria-pressed={active}>
      <span className="pin-num is-stay"><Icon name="bed" size={14} /></span>
      <span className="route-stop-text">
        <strong>{stay.name}</strong>
        <small>{edge}{stay.location ? stay.place?.locality ? ` · ${stay.place.locality}` : "" : " · Location unknown"}</small>
      </span>
    </button>
  );
}
