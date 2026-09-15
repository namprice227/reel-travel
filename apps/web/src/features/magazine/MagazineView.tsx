"use client";

import type { PublicItinerary } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoverArt, StopArt, categoryGroup } from "@/components/Illustration";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge } from "@/components/ui";
import { infoFor, stopStatus, stopSubtitle, type PlaceInfoMap } from "@/features/itinerary/place-info";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys, useNotes } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { formatShortDate, tripDays } from "@/lib/trip-dates";

// F5 magazine view (owner: Member 2). Arrangement follows the "itinerary0" reference: day rail, stop cards,
// then a map preview and notes column. A presentation of the same saved version as timeline and map;
// it never reorders or recalculates anything. Owner-only extras (notes) appear only when `tripId` is set.

export function MagazineView({
  trip,
  itinerary,
  places,
  dayIndex,
  onSelectDay,
  tripId,
  mapHref,
  onOpenMap,
}: {
  trip: { title: string; destination: string; startDate: string; endDate: string };
  itinerary: PublicItinerary;
  places: PlaceInfoMap;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  /** Owner view: enables private notes. */
  tripId?: string;
  mapHref?: string;
  onOpenMap?: () => void;
}) {
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  const n = itinerary.days.indexOf(day!) + 1;

  const summary = (d: PublicItinerary["days"][number]) => {
    const groups = [...new Set(d.stops.filter((s) => s.kind !== "break").map((s) => (s.kind === "reservation" ? "Booked dining" : categoryGroup(infoFor(s, places)?.category))))]
      .filter((g) => g !== "Unsorted" && g !== "Other");
    if (d.stops.length === 0) return "Free day";
    if (groups.length === 0) return `${d.stops.length} stops`;
    return groups.length === 1 ? groups[0]! : `${groups.slice(0, -1).join(", ")} and ${groups.at(-1)!.toLowerCase()}`;
  };

  const located = (day?.stops ?? []).filter((s) => s.location);
  const markers: MapMarker[] = located.map((s, i) => ({ id: s.id, position: s.location!, label: `${i + 1}. ${s.title}`, number: i + 1 }));
  const dayConflicts = itinerary.conflicts.filter((c) => c.date === day?.date && c.severity !== "info");

  return (
    <div className="mag-layout">
      <aside className="mag-left">
        <div className="day-rail" aria-label="Trip days">
          {itinerary.days.map((d, i) => (
            <button key={d.date} className={i === n - 1 ? "active" : undefined} aria-current={i === n - 1 ? "true" : undefined} onClick={() => onSelectDay(i)}>
              <span className="day-dot" aria-hidden="true" />
              <strong>Day {i + 1}</strong>
              <span>{formatShortDate(d.date)}</span>
              <small>{summary(d)}</small>
            </button>
          ))}
        </div>
        <CoverArt seed={`${trip.destination}-rail`} className="mag-left-art" caption={`${trip.destination}, ${tripDays(trip.startDate, trip.endDate)} days of saved places.`} />
      </aside>

      {day && (
        <section className="mag-day" aria-labelledby="mag-day-title">
          <div className="mag-day-heading">
            <h2 id="mag-day-title">Day {n}</h2>
            <p>{formatDay(day.date)} · {summary(day)}</p>
          </div>
          {day.stops.length === 0 ? (
            <div className="empty">A free day to wander.</div>
          ) : (
            <ol className="stop-list">
              {day.stops.map((stop) => {
                const status = stopStatus(stop);
                return (
                  <li key={stop.id}>
                    {stop.travelMinutesBefore > 0 && (
                      <div className="travel-row"><Icon name="transit" size={20} /> ≈ {stop.travelMinutesBefore} min travel</div>
                    )}
                    <article className={`stop-card is-${stop.kind}`}>
                      <StopArt category={infoFor(stop, places)?.category} kind={stop.kind} />
                      <div>
                        <p className="stop-card-time">{stop.start} – {stop.end}</p>
                        <h3>{stop.title}</h3>
                        <p className="stop-card-place"><Icon name={stop.kind === "break" ? "pause" : "pin"} size={16} /> {stopSubtitle(stop, places)}</p>
                        {stop.kind === "break" && <p className="stop-card-meta">Break until {stop.end}.</p>}
                        {tripId && <NotePreview tripId={tripId} noteKey={noteKeys.stop(stop)} />}
                      </div>
                      <div className="stop-card-side">
                        {status && <Badge tone={status.tone}><Icon name={status.icon} size={14} /> {status.label}</Badge>}
                        {tripId && <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} />}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {day && (
        <aside className="mag-right">
          <MapPreview markers={markers} caption={`Day ${n} route · estimated`} href={mapHref} onOpen={onOpenMap} />
          {tripId ? (
            <DayNoteCard tripId={tripId} date={day.date} n={n} />
          ) : (
            <div className="card side-card day-note-card">
              <span className="day-note-icon"><Icon name="mountain" /></span>
              <div><h3 className="side-card-title">{summary(day)}</h3><p className="muted small">{day.stops.length} stops planned for {formatDay(day.date)}.</p></div>
            </div>
          )}
          {(dayConflicts.length > 0 || itinerary.assumptions.length > 0) && (
            <div className="card side-card">
              <h3 className="side-card-title">Good to know</h3>
              {dayConflicts.length > 0 && (
                <ul className="checks-list">
                  {dayConflicts.map((c, i) => <li key={i}><Icon name="alert" size={16} /><span>{c.message}</span></li>)}
                </ul>
              )}
              {itinerary.assumptions.length > 0 && <p className="assumptions-text">{itinerary.assumptions.join(" ")}</p>}
            </div>
          )}
          <CoverArt seed={`${trip.destination}-quote-${n}`} className="quote-art" caption={`“${summary(day)}.”`} />
        </aside>
      )}
    </div>
  );
}

function MapPreview({ markers, caption, href, onOpen }: { markers: MapMarker[]; caption: string; href?: string; onOpen?: () => void }) {
  const lines = markers.length > 1 ? [{ id: "day", points: markers.map((m) => m.position) }] : [];
  const map = markers.length > 0 ? <PlaceMap markers={markers} lines={lines} height={260} interactive={false} /> : <div className="map-placeholder" style={{ height: 200 }}>No mapped stops this day</div>;
  const enlarge = <>Enlarge map <Icon name="arrowRight" size={14} /></>;
  // Not a link card: Leaflet's attribution already contains links, and links must not nest.
  return (
    <div className="card map-preview">
      {map}
      <div className="map-preview-foot">
        <span>{caption}</span>
        {href ? <Link href={href} className="link-arrow">{enlarge}</Link> : <button type="button" className="btn-link link-arrow" onClick={onOpen}>{enlarge}</button>}
      </div>
    </div>
  );
}

function NotePreview({ tripId, noteKey }: { tripId: string; noteKey: string }) {
  const { notes } = useNotes(tripId);
  const note = notes[noteKey];
  if (!note) return null;
  return <p className="stop-card-meta note-preview"><Icon name="note" size={14} /> {note.text.length > 90 ? `${note.text.slice(0, 90)}…` : note.text}</p>;
}

function DayNoteCard({ tripId, date, n }: { tripId: string; date: string; n: number }) {
  const { notes } = useNotes(tripId);
  const note = notes[noteKeys.day(date)];
  return (
    <div className="card side-card day-note-card">
      <span className="day-note-icon"><Icon name="note" /></span>
      <div>
        <h3 className="side-card-title">Your notes for Day {n}</h3>
        {note ? <p className="day-note-text">{note.text}</p> : <p className="muted small">Leave yourself a reminder for this day. Only you can see it.</p>}
        <NoteButton tripId={tripId} noteKey={noteKeys.day(date)} subject={`Day ${n}`} variant="chip" />
      </div>
    </div>
  );
}
