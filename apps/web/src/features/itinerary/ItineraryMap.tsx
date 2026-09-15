"use client";

import type { PublicItinerary } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { StopArt } from "@/components/Illustration";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { infoFor, stopStatus, type PlaceInfoMap } from "./place-info";

/**
 * Map view of one itinerary version for the selected day: numbered stop list beside a large map.
 * Arrangement follows the "Itinerary map enlarge" reference. Lines are estimated connections, not routes.
 * On laptop screens the map fills the remaining height and the stop list scrolls inside its column.
 */
export function ItineraryMap({
  itinerary,
  places,
  dayIndex,
  onSelectDay,
  tripId,
  timelineHref,
}: {
  itinerary: PublicItinerary;
  places: PlaceInfoMap;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  /** Owner view: enables private notes. */
  tripId?: string;
  timelineHref?: string;
}) {
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  const stops = day?.stops ?? [];
  const located = stops.filter((s) => s.location);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  // Default to the first mapped stop; reset when the day changes.
  const [pickedDay, setPickedDay] = useState(day?.date);
  if (pickedDay !== day?.date) {
    setPickedDay(day?.date);
    setPicked(undefined);
  }
  const selectedId = picked === undefined ? (located[0]?.id ?? null) : picked;
  const selected = stops.find((s) => s.id === selectedId) ?? null;
  const pinNumber = new Map(located.map((s, i) => [s.id, i + 1]));

  const markers: MapMarker[] = located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id) }));
  const lines = located.length > 1 ? [{ id: day!.date, points: located.map((s) => s.location!), dashed: true }] : [];
  const status = selected ? stopStatus(selected) : null;

  return (
    <section className="card map-workspace">
      <div className="map-toolbar">
        <div className="day-tabs" role="tablist" aria-label="Trip days">
          {itinerary.days.map((d, i) => (
            <button key={d.date} role="tab" aria-selected={d.date === day?.date} className={d.date === day?.date ? "active" : undefined} onClick={() => onSelectDay(i)}>
              Day {i + 1}
              <small>{formatDay(d.date)}</small>
            </button>
          ))}
        </div>
        {timelineHref && <Link className="btn btn-outline btn-small" href={timelineHref}><Icon name="timeline" size={16} /> View details</Link>}
      </div>

      <div className="map-split">
        <div className="map-list panel-scroll">
          <h2>Day {dayIndex + 1}</h2>
          <p>{day ? formatDay(day.date) : ""}</p>
          {stops.length === 0 && <p className="muted small">Free day.</p>}
          {stops.map((stop) => {
            const s = stopStatus(stop);
            const number = pinNumber.get(stop.id);
            return (
              <button key={stop.id} type="button" className={`map-stop${stop.id === selectedId ? " active" : ""}`} onClick={() => setPicked(stop.id)} aria-pressed={stop.id === selectedId}>
                <span className={`map-stop-num${number ? "" : " is-none"}`} aria-label={number ? `Pin ${number}` : "Not on map"}>{number ?? "–"}</span>
                <StopArt category={infoFor(stop, places)?.category} kind={stop.kind} size="sm" />
                <span>
                  <small>{stop.start}</small>
                  <strong>{stop.title}</strong>
                  <small>{!stop.location ? "Location unavailable" : s ? <><Icon name={s.icon} size={14} /> {s.label}</> : stop.kind === "break" ? "Break" : "Checked"}</small>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            );
          })}
          {timelineHref && <Link className="btn btn-outline btn-small" href={timelineHref} style={{ marginTop: 6, width: "max-content" }}><Icon name="plus" size={16} /> Add stop</Link>}
        </div>

        <div className="map-canvas">
          <span className="map-canvas-label">Map · Estimated connections</span>
          {markers.length > 0 ? (
            <PlaceMap markers={markers} lines={lines} height="100%" activeId={selectedId} onSelect={(id) => setPicked(id)} />
          ) : (
            <div className="map-placeholder" style={{ height: "100%", minHeight: 360 }}>No stops with a location on this day.</div>
          )}
          {selected && (
            <div className="map-popup-card" role="region" aria-label={`Selected stop: ${selected.title}`}>
              <StopArt category={infoFor(selected, places)?.category} kind={selected.kind} size="lg" />
              <div>
                <h3>{selected.title}</h3>
                <p>{selected.start} – {selected.end}</p>
                {status && <p className="muted small"><Icon name={status.icon} size={14} /> {status.label}</p>}
                {!selected.location && <p className="muted small">Location unavailable</p>}
                <div className="map-popup-actions">
                  {tripId && <NoteButton tripId={tripId} noteKey={noteKeys.stop(selected)} subject={selected.title} variant="chip" />}
                  {timelineHref && selected.kind !== "reservation" && <Link className="btn btn-primary btn-small" href={timelineHref}><Icon name="edit" size={15} /> Move stop</Link>}
                </div>
              </div>
              <button type="button" className="icon-btn map-popup-close" onClick={() => setPicked(null)} aria-label="Close stop details"><Icon name="close" size={18} /></button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
