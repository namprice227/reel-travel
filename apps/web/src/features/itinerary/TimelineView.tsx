"use client";

import type { PublicItinerary } from "@reel/contracts";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { PlanningAdvice, SuggestedActivityDetails } from "./PlanningAdvice";
import { ConflictList } from "./ConflictList";
import { stopStatus, stopSubtitle, type PlaceInfoMap } from "./place-info";

export interface TimelineEditHandlers {
  move: (stopId: string, toDate: string, toIndex: number) => void;
  remove: (stopId: string) => void;
}

/**
 * Day timeline with edit controls. Read-only when `onEdit` is omitted (shared view). Bookings are never editable here.
 * On laptop screens the stop list and the side column scroll inside themselves so the page fits one screen.
 */
export function TimelineView({
  itinerary,
  places,
  dayIndex,
  onSelectDay,
  tripId,
  onEdit,
  busy = false,
  aside,
}: {
  itinerary: PublicItinerary;
  places: PlaceInfoMap;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  /** Owner view: enables private notes. */
  tripId?: string;
  onEdit?: TimelineEditHandlers;
  busy?: boolean;
  aside?: ReactNode;
}) {
  const dates = itinerary.days.map((d) => d.date);
  const selectedDay = itinerary.days[dayIndex] ?? itinerary.days[0];

  // Moving to another day inserts before that day's first booking, or at the end.
  const indexForNewDay = (date: string) => {
    const stops = itinerary.days.find((d) => d.date === date)?.stops ?? [];
    const firstBooking = stops.findIndex((s) => s.kind === "reservation");
    return firstBooking === -1 ? stops.length : firstBooking;
  };

  return (
    <div className="timeline-layout">
      <section className="card timeline-panel">
        <div className="day-tabs" role="tablist" aria-label="Trip days">
          {itinerary.days.map((day, i) => (
            <button key={day.date} role="tab" aria-selected={day.date === selectedDay?.date} className={day.date === selectedDay?.date ? "active" : undefined} onClick={() => onSelectDay(i)}>
              Day {i + 1}
              <small>{formatDay(day.date)}</small>
            </button>
          ))}
        </div>

        {selectedDay && (
          <>
            <div className="timeline-panel-head">
              <h2>{formatDay(selectedDay.date)}</h2>
              <span className="muted small">Version {itinerary.version} · {selectedDay.stops.length} stops</span>
            </div>
            <PlanningAdvice assumptions={itinerary.assumptions} />
            {selectedDay.stops.length === 0 ? (
              <p className="muted">Free day.</p>
            ) : (
              <ol className="tl-list panel-scroll">
                {selectedDay.stops.map((stop, index) => {
                  const status = stopStatus(stop);
                  return (
                    <li key={stop.id}>
                      {stop.travelMinutesBefore !== null && stop.travelMinutesBefore > 0 && <div className="tl-travel">≈ {stop.travelMinutesBefore} min travel</div>}
                      <div className={`tl-item is-${stop.kind}`}>
                        <span className="tl-time">{stop.start} – {stop.end}</span>
                        <span className="tl-num" aria-hidden="true">{index + 1}</span>
                        <div className="tl-main">
                          <h3>
                            {stop.title}
                            {status && <Badge tone={status.tone}><Icon name={status.icon} size={13} /> {status.label}</Badge>}
                          </h3>
                          <p className="stop-card-place"><Icon name={stop.kind === "break" ? "pause" : "pin"} size={15} /> {stopSubtitle(stop, places)}</p>
                        </div>
                        <div className="tl-actions">
                          {tripId && <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} />}
                          {onEdit && stop.kind !== "reservation" && (
                            <>
                              <button className="btn btn-small" aria-label={`Move ${stop.title} earlier`} disabled={busy || index === 0} onClick={() => onEdit.move(stop.id, selectedDay.date, index - 1)}>↑</button>
                              <button className="btn btn-small" aria-label={`Move ${stop.title} later`} disabled={busy || index === selectedDay.stops.length - 1} onClick={() => onEdit.move(stop.id, selectedDay.date, index + 1)}>↓</button>
                              {dates.length > 1 && (
                                <select
                                  aria-label={`Move ${stop.title} to another day`}
                                  disabled={busy}
                                  value=""
                                  onChange={(e) => e.target.value && onEdit.move(stop.id, e.target.value, indexForNewDay(e.target.value))}
                                >
                                  <option value="">Move to day…</option>
                                  {dates.map((d, i) => (d === selectedDay.date ? null : <option key={d} value={d}>Day {i + 1} · {formatDay(d)}</option>))}
                                </select>
                              )}
                              <button className="btn btn-small btn-danger" disabled={busy} onClick={() => onEdit.remove(stop.id)}>
                                <Icon name="trash" size={15} /> Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <SuggestedActivityDetails stop={stop} />
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </section>

      <aside className="timeline-aside panel-scroll">
        {aside}
        <ConflictList conflicts={itinerary.conflicts} />
        {itinerary.assumptions.length > 0 && (
          <section className="card side-card">
            <h3 className="side-card-title">Planning notes</h3>
            <p className="assumptions-text">{itinerary.assumptions.join(" ")}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
