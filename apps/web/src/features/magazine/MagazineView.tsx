import type { PublicItinerary } from "@reel/contracts";
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
  return (
    <article className="magazine">
      <header className="mag-cover">
        <p className="kicker">{trip.destination}</p>
        <h1>{trip.title}</h1>
        <p>{formatRange(trip.startDate, trip.endDate)}</p>
        <p className="kicker">Edition {itinerary.version}</p>
      </header>

      {itinerary.days.map((day, i) => {
        const stops = day.stops.filter((stop) => stop.kind !== "break");
        return (
          <section key={day.date} className="mag-day">
            <p className="kicker">
              Day {i + 1} · {formatDay(day.date)}
            </p>
            {stops.length === 0 ? (
              <p className="muted">A free day to wander.</p>
            ) : (
              stops.map((stop) => (
                <div key={stop.id} className="mag-stop">
                  <span className="mag-time">{stop.start}</span>
                  <div>
                    <h3>{stop.title}</h3>
                    <p className="muted small">
                      {stop.kind === "reservation" ? (stop.locked ? "Booked" : "Planned booking") : `Until ${stop.end}`}
                      {stop.hoursCheck === "unknown" ? " · opening hours not checked" : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })}

      <footer className="muted small">{itinerary.assumptions.join(" ")}</footer>
    </article>
  );
}
