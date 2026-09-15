"use client";

import type { PublicItinerary } from "@reel/contracts";
import { useState } from "react";
import { formatDay, formatRange } from "@/lib/format";

// F5 magazine view (owner: Member 2). A presentation of the same saved version as timeline and map;
// it never reorders or recalculates anything.

export function MagazineView({
  trip,
  itinerary,
}: {
  trip: { title: string; destination: string; startDate: string; endDate: string };
  itinerary: PublicItinerary;
}) {
  const [selectedDate, setSelectedDate] = useState(itinerary.days[0]?.date ?? "");
  const selectedDay = itinerary.days.find((day) => day.date === selectedDate) ?? itinerary.days[0];

  return (
    <article className="magazine">
      <header className="mag-cover">
        <p className="kicker">{trip.destination}</p>
        <h1>{trip.title}</h1>
        <p>{formatRange(trip.startDate, trip.endDate)}</p>
        <p className="kicker">Edition {itinerary.version}</p>
      </header>

      <div className="magazine-layout">
        <aside className="day-rail magazine-days" aria-label="Trip days">
          {itinerary.days.map((day, i) => (
            <button key={day.date} className={selectedDay?.date === day.date ? "active" : undefined} onClick={() => setSelectedDate(day.date)}>
              <span className="day-dot" aria-hidden="true" /><strong>Day {i + 1}</strong><span>{formatDay(day.date)}</span><small>{day.stops.length ? `${day.stops.length} stops` : "Free day"}</small>
            </button>
          ))}
        </aside>
        {selectedDay && <section className="mag-day">
            <p className="kicker">Day {itinerary.days.indexOf(selectedDay) + 1}</p>
            <h2>{formatDay(selectedDay.date)}</h2>
            {selectedDay.stops.length === 0 ? (
              <p className="muted">A free day to wander.</p>
            ) : (
              selectedDay.stops.map((stop) => (
                <div key={stop.id}>
                  {stop.travelMinutesBefore > 0 && <div className="mag-travel">≈ {stop.travelMinutesBefore} min travel</div>}
                  <div className={`mag-stop mag-stop-${stop.kind}`}>
                  <span className="mag-time">{stop.start}</span>
                  <div>
                    <h3>{stop.title}</h3>
                    <p className="muted small">
                      {stop.kind === "reservation" ? (stop.locked ? "Fixed booking" : "Booking") : stop.kind === "break" ? `Break until ${stop.end}` : `Until ${stop.end}`}
                      {stop.hoursCheck === "unknown" ? " · opening hours not checked" : ""}
                    </p>
                  </div>
                  </div>
                </div>
              ))
            )}
          </section>}
      </div>

      <footer className="muted small">{itinerary.assumptions.join(" ")}</footer>
    </article>
  );
}
