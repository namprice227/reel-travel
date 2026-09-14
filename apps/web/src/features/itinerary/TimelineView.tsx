"use client";

import type { PublicItinerary, PublicStop } from "@reel/contracts";
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

  // Moving to another day inserts before that day's first booking, or at the end.
  const indexForNewDay = (date: string) => {
    const stops = itinerary.days.find((d) => d.date === date)?.stops ?? [];
    const firstBooking = stops.findIndex((s) => s.kind === "reservation");
    return firstBooking === -1 ? stops.length : firstBooking;
  };

  return (
    <div className="stack">
      {itinerary.days.map((day, dayIndex) => (
        <section key={day.date} className="card">
          <div className="row between">
            <h3>
              Day {dayIndex + 1} · {formatDay(day.date)}
            </h3>
            <span className="muted small">v{itinerary.version}</span>
          </div>
          {day.stops.length === 0 ? (
            <p className="muted">Free day.</p>
          ) : (
            <ol className="timeline">
              {day.stops.map((stop, index) => (
                <li key={stop.id}>
                  {stop.travelMinutesBefore > 0 && <div className="travel">≈ {stop.travelMinutesBefore} min travel</div>}
                  <div className={`stop stop-${stop.kind} row between`}>
                    <div className="row">
                      <strong>
                        {stop.start}–{stop.end}
                      </strong>
                      <span>{stop.title}</span>
                      <StopBadges stop={stop} />
                    </div>
                    {onEdit && stop.kind !== "reservation" && (
                      <div className="row">
                        <button
                          className="btn btn-small"
                          aria-label="Move earlier"
                          disabled={busy || index === 0}
                          onClick={() => onEdit.move(stop.id, day.date, index - 1)}
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-small"
                          aria-label="Move later"
                          disabled={busy || index === day.stops.length - 1}
                          onClick={() => onEdit.move(stop.id, day.date, index + 1)}
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
                              d === day.date ? null : (
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
      ))}
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
