"use client";

import type { PublicItinerary, PublicStop } from "@reel/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { formatDay } from "@/lib/format";

export interface TimelineEditHandlers {
  move: (stopId: string, toDate: string, toIndex: number) => void;
  remove: (stopId: string) => void;
}

/** Day-by-day timeline. Read-only when `onEdit` is omitted (shared view). Bookings are never editable here. */
export function TimelineView({
  itinerary,
  onEdit,
  busy = false,
}: {
  itinerary: PublicItinerary;
  onEdit?: TimelineEditHandlers;
  busy?: boolean;
}) {
  const dates = itinerary.days.map((d) => d.date);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const selectedDay = itinerary.days.find((day) => day.date === selectedDate) ?? itinerary.days[0];

  // Moving to another day inserts before that day's first booking, or at the end.
  const indexForNewDay = (date: string) => {
    const stops = itinerary.days.find((d) => d.date === date)?.stops ?? [];
    const firstBooking = stops.findIndex((s) => s.kind === "reservation");
    return firstBooking === -1 ? stops.length : firstBooking;
  };

  return (
    <div className="day-layout">
      <aside className="day-rail" aria-label="Trip days">
        {itinerary.days.map((day, dayIndex) => (
          <button key={day.date} className={day.date === selectedDay?.date ? "active" : undefined} onClick={() => setSelectedDate(day.date)}>
            <span className="day-dot" aria-hidden="true" />
            <strong>Day {dayIndex + 1}</strong>
            <span>{formatDay(day.date)}</span>
            <small>{day.stops.length === 0 ? "Free day" : `${day.stops.length} stops`}</small>
          </button>
        ))}
      </aside>
      {selectedDay && (
        <section className="card day-panel">
          <div className="row between day-panel-heading">
            <div><p className="kicker">Selected day</p><h2>Day {itinerary.days.indexOf(selectedDay) + 1}</h2><p className="muted">{formatDay(selectedDay.date)}</p></div>
            <span className="muted small">Version {itinerary.version}</span>
          </div>
          {selectedDay.stops.length === 0 ? (
            <p className="muted">Free day.</p>
          ) : (
            <ol className="timeline">
              {selectedDay.stops.map((stop, index) => (
                <li key={stop.id}>
                  {stop.travelMinutesBefore > 0 && <div className="travel">≈ {stop.travelMinutesBefore} min travel</div>}
                  <div className={`stop stop-${stop.kind}`}>
                    <div className="stop-main">
                      <strong className="stop-time">
                        {stop.start}–{stop.end}
                      </strong>
                      <div><h3>{stop.title}</h3><StopBadges stop={stop} /></div>
                    </div>
                    {onEdit && stop.kind !== "reservation" && (
                      <div className="stop-actions">
                        <button
                          className="btn btn-small"
                          aria-label="Move earlier"
                          disabled={busy || index === 0}
                          onClick={() => onEdit.move(stop.id, selectedDay.date, index - 1)}
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-small"
                          aria-label="Move later"
                          disabled={busy || index === selectedDay.stops.length - 1}
                          onClick={() => onEdit.move(stop.id, selectedDay.date, index + 1)}
                        >
                          ↓
                        </button>
                        {dates.length > 1 && (
                          <select
                            aria-label="Move to another day"
                            disabled={busy}
                            value=""
                            onChange={(e) => e.target.value && onEdit.move(stop.id, e.target.value, indexForNewDay(e.target.value))}
                          >
                            <option value="">Move to day…</option>
                            {dates.map((d, i) =>
                              d === selectedDay.date ? null : (
                                <option key={d} value={d}>
                                  Day {i + 1} · {formatDay(d)}
                                </option>
                              ),
                            )}
                          </select>
                        )}
                        <button className="btn btn-danger btn-small" disabled={busy} onClick={() => onEdit.remove(stop.id)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

function StopBadges({ stop }: { stop: PublicStop }) {
  return (
    <>
      {stop.kind === "reservation" && <Badge tone="warning">{stop.locked ? "Locked booking" : "Booking"}</Badge>}
      {stop.hoursCheck === "unknown" && <Badge tone="warning">Hours not checked</Badge>}
      {stop.hoursCheck === "closed" && <Badge tone="danger">Closed at this time</Badge>}
    </>
  );
}
