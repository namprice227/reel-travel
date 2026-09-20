"use client";

import type { CandidatePlace, Itinerary, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { categoryGroup } from "@/components/Illustration";
import { PlaceImage } from "@/components/PlacePhoto";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge } from "@/components/ui";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { getGoogleMapsDirectionsUrl, getGoogleMapsRouteUrl } from "@/lib/maps";
import { formatShortDate } from "@/lib/trip-dates";
import { infoFor, stopStatus, type PlaceInfoMap } from "./place-info";

// The itinerary workspace (designs "Sky 3 · 06 the day", "07 stop selected", "09 edit mode"):
// days on the left, the day's stops in the middle, and a narrow panel that shows either the whole day
// or the selected stop. The panel's map always shows every stop of the day; the selected one is highlighted.

export interface EditHandlers {
  move: (stopId: string, toDate: string, toIndex: number) => void;
  remove: (stop: PublicStop) => void;
  add: (placeId: string, date: string) => void;
}

const TRAVEL_ICON: Record<string, IconName> = { walk: "walk", transit: "transit", car: "car" };

export function DayView({
  itinerary,
  places,
  placeDetails,
  dayIndex,
  onSelectDay,
  tripId,
  transport,
  editing = false,
  busy = false,
  onEdit,
}: {
  itinerary: Itinerary;
  places: PlaceInfoMap;
  placeDetails: Map<string, CandidatePlace>;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  tripId: string;
  transport: string;
  editing?: boolean;
  busy?: boolean;
  onEdit?: EditHandlers;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  const stops = day?.stops ?? [];
  const located = stops.filter((s) => s.location);
  const pinNumber = new Map(located.map((s, i) => [s.id, i + 1]));
  const selected = stops.find((s) => s.id === selectedId) ?? null;
  const dates = itinerary.days.map((d) => d.date);

  const summary = (stops: PublicStop[]) => {
    if (stops.length === 0) return "Free day";
    const groups = [...new Set(stops.filter((s) => s.kind !== "break").map((s) => (s.kind === "reservation" ? "Booked dining" : categoryGroup(infoFor(s, places)?.category))))].filter((g) => g !== "Unsorted" && g !== "Other");
    return groups.length === 0 ? `${stops.length} stops` : groups.slice(0, 2).join(" and ");
  };

  return (
    <div className="day-layout fit-fill">
      <nav className="day-rail" aria-label="Trip days">
        {itinerary.days.map((d, i) => (
          <button key={d.date} type="button" className={i === dayIndex ? "active" : undefined} aria-current={i === dayIndex ? "true" : undefined} onClick={() => { onSelectDay(i); setSelectedId(null); }}>
            <span className="day-dot" aria-hidden="true" />
            <strong>Day {i + 1}</strong>
            <span>{formatShortDate(d.date)}</span>
            <small>{summary(d.stops)}</small>
          </button>
        ))}
      </nav>

      {day && (
        <section className="day-main" aria-labelledby="day-title">
          <div className="day-heading">
            <h2 id="day-title">Day {dayIndex + 1} · {formatDay(day.date).replace(/^\w+ /, "")}</h2>
            <p>{formatDay(day.date)} · {summary(stops)}</p>
          </div>
          <div className="stop-scroll panel-scroll">
            {stops.length === 0 ? (
              <div className="empty">A free day to wander.</div>
            ) : (
              <ol className="stop-list">
                {stops.map((stop, index) => (
                  <li key={stop.id}>
                    {stop.travelMinutesBefore > 0 && !editing && (
                      <div className="travel-row"><Icon name={TRAVEL_ICON[transport] ?? "route"} size={16} /> ≈ {stop.travelMinutesBefore} min {transport === "walk" ? "walk" : transport === "car" ? "drive" : "by transit"}</div>
                    )}
                    <StopRow
                      stop={stop}
                      number={pinNumber.get(stop.id)}
                      places={places}
                      active={stop.id === selectedId}
                      editing={editing}
                      busy={busy}
                      first={index === 0}
                      last={index === stops.length - 1}
                      dates={dates}
                      date={day.date}
                      index={index}
                      tripId={tripId}
                      onSelect={() => setSelectedId(stop.id === selectedId ? null : stop.id)}
                      onEdit={onEdit}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {day && (
        <aside className="day-panel card panel-scroll" aria-label={editing ? "Places not scheduled" : selected ? `Details for ${selected.title}` : `Day ${dayIndex + 1} overview`}>
          {editing && onEdit ? (
            <EditPanel
              day={dayIndex + 1}
              date={day.date}
              stops={stops}
              unscheduled={itinerary.unscheduledPlaceIds}
              placeDetails={placeDetails}
              busy={busy}
              onAdd={onEdit.add}
            />
          ) : selected ? (
            <StopPanel
              stop={selected}
              stops={stops}
              number={pinNumber.get(selected.id)}
              places={places}
              place={selected.placeId ? placeDetails.get(selected.placeId) : undefined}
              transport={transport}
              tripId={tripId}
              onBack={() => setSelectedId(null)}
              markers={markersFor(located, pinNumber, places)}
              day={dayIndex + 1}
            />
          ) : (
            <DayPanel day={dayIndex + 1} date={day.date} stops={stops} markers={markersFor(located, pinNumber, places)} tripId={tripId} summary={summary(stops)} />
          )}
        </aside>
      )}
    </div>
  );
}

const markersFor = (located: PublicStop[], pinNumber: Map<string, number>, places: PlaceInfoMap): MapMarker[] =>
  located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id), provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution }));

function StopRow({
  stop, number, places, active, editing, busy, first, last, dates, date, index, tripId, onSelect, onEdit,
}: {
  stop: PublicStop; number?: number; places: PlaceInfoMap; active: boolean; editing: boolean; busy: boolean;
  first: boolean; last: boolean; dates: string[]; date: string; index: number; tripId: string;
  onSelect: () => void; onEdit?: EditHandlers;
}) {
  const status = stopStatus(stop);
  const flag = status && (stop.kind === "reservation" || stop.hoursCheck === "unknown" || stop.hoursCheck === "closed") ? status : null;
  const fixed = stop.kind === "reservation";
  return (
    <article className={`stop-card is-${stop.kind}${active ? " is-active" : ""}`}>
      {editing && <span className="stop-handle" aria-hidden="true">{fixed ? <Icon name="lock" size={18} /> : <Icon name="grid" size={18} />}</span>}
      <PlaceImage photo={infoFor(stop, places)?.photo} category={infoFor(stop, places)?.category} alt="" width={200} />
      <button type="button" className="stop-card-text" onClick={onSelect} aria-pressed={active}>
        <span className="stop-card-time">{stop.start} – {stop.end}</span>
        <strong>{stop.title}</strong>
        <span className="stop-card-place"><Icon name={stop.kind === "break" ? "pause" : "pin"} size={15} /> {infoFor(stop, places)?.address ?? (stop.kind === "break" ? "Time to rest" : "Location from your saved place")}</span>
      </button>
      <div className="stop-card-side">
        {flag && <Badge tone={flag.tone}><Icon name={flag.icon} size={13} /> {flag.label}</Badge>}
        {!editing && <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} />}
        {!editing && number && <span className={`pin-num${active ? " is-active" : ""}`}>{number}</span>}
        {editing && onEdit && !fixed && (
          <div className="stop-edit-actions">
            <button className="icon-btn" aria-label={`Move ${stop.title} earlier`} disabled={busy || first} onClick={() => onEdit.move(stop.id, date, index - 1)}><Icon name="arrowUp" size={18} /></button>
            <button className="icon-btn" aria-label={`Move ${stop.title} later`} disabled={busy || last} onClick={() => onEdit.move(stop.id, date, index + 1)}><Icon name="arrowDown" size={18} /></button>
            {dates.length > 1 && (
              <select className="move-day" aria-label={`Move ${stop.title} to another day`} disabled={busy} value="" onChange={(e) => e.target.value && onEdit.move(stop.id, e.target.value, 0)}>
                <option value="">Move…</option>
                {dates.map((d, i) => (d === date ? null : <option key={d} value={d}>Day {i + 1} · {formatDay(d)}</option>))}
              </select>
            )}
            <button className="icon-btn is-danger" aria-label={`Remove ${stop.title}`} disabled={busy} onClick={() => onEdit.remove(stop)}><Icon name="trash" size={18} /></button>
          </div>
        )}
      </div>
    </article>
  );
}

/** The panel while editing (design "Sky 3 · 09 edit mode"): what is on the day, and the places left over. */
function EditPanel({
  day, date, stops, unscheduled, placeDetails, busy, onAdd,
}: {
  day: number; date: string; stops: PublicStop[]; unscheduled: string[];
  placeDetails: Map<string, CandidatePlace>; busy: boolean; onAdd: (placeId: string, date: string) => void;
}) {
  const fixed = stops.filter((s) => s.kind === "reservation").length;
  return (
    <>
      <div className="day-panel-head">
        <p className="kicker">Editing</p>
        <h3>Day {day}</h3>
      </div>
      <ul className="panel-facts">
        <li><Icon name="pin" size={15} /> <span>On this day<strong>{stops.length} {stops.length === 1 ? "stop" : "stops"}</strong></span></li>
        <li><Icon name="lock" size={15} /> <span>Fixed bookings<strong>{fixed === 0 ? "None on this day" : `${fixed} stay put`}</strong></span></li>
      </ul>
      <section className="edit-pool">
        <h4>Not scheduled · {unscheduled.length}</h4>
        {unscheduled.length === 0 ? (
          <p className="muted small">Every confirmed place is on a day.</p>
        ) : (
          <>
            <p className="muted small">Confirmed places that didn&apos;t fit. Add one to the end of this day.</p>
            <ul>
              {unscheduled.map((id) => {
                const place = placeDetails.get(id);
                return (
                  <li key={id}>
                    <PlaceImage photo={place?.selected?.details.photos[0]} category={place?.selected?.details.category} className="edit-pool-art" width={200} size="sm" />
                    <span>{place?.name ?? id}</span>
                    <button className="icon-btn" aria-label={`Add ${place?.name ?? "place"} to day ${day}`} disabled={busy} onClick={() => onAdd(id, date)}>
                      <Icon name="plus" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <p className="panel-hint"><Icon name="info" size={15} /> Moves save as you go. Use Undo if you change your mind.</p>
    </>
  );
}

function DayPanel({ day, date, stops, markers, tripId, summary }:{ day: number; date: string; stops: PublicStop[]; markers: MapMarker[]; tripId: string; summary: string }) {
  const travel = stops.reduce((total, s) => total + s.travelMinutesBefore, 0);
  const first = stops[0];
  const last = stops[stops.length - 1];
  return (
    <>
      <div className="day-panel-head">
        <p className="kicker">{formatDay(date)}</p>
        <h3>Day {day} route</h3>
      </div>
      <PanelMap markers={markers} tripId={tripId} day={day} />
      <ul className="panel-facts">
        <li><Icon name="pin" size={15} /> <span>Stops<strong>{stops.length} on this day · {summary.toLowerCase()}</strong></span></li>
        <li><Icon name="route" size={15} /> <span>Travel<strong>{travel > 0 ? `About ${travel} min in total` : "No travel estimated"}</strong></span></li>
        {first && last && <li><Icon name="clock" size={15} /> <span>Day<strong>{first.start} – {last.end}</strong></span></li>}
      </ul>
      <ol className="panel-stops">
        {markers.map((m) => (
          <li key={m.id}><span className="pin-num is-small">{m.number}</span>{m.label.replace(/^\d+\. /, "")}</li>
        ))}
      </ol>
      <p className="panel-hint"><Icon name="info" size={15} /> Select a stop to see it here.</p>
    </>
  );
}

function StopPanel({
  stop, stops, number, places, place, transport, tripId, onBack, markers, day,
}: {
  stop: PublicStop; stops: PublicStop[]; number?: number; places: PlaceInfoMap; place?: CandidatePlace;
  transport: string; tripId: string; onBack: () => void; markers: MapMarker[]; day: number;
}) {
  const info = infoFor(stop, places);
  const index = stops.findIndex((s) => s.id === stop.id);
  const before = stops[index - 1];
  const after = stops[index + 1];
  const evidence = place?.evidence[0];
  const leg = (label: string, other: PublicStop | undefined, minutes: number) =>
    other && minutes > 0 ? (
      <li><Icon name={TRAVEL_ICON[transport] ?? "route"} size={15} /> <span>{label} {other.title}<strong>{minutes} min {transport === "walk" ? "walk" : transport === "car" ? "drive" : "by transit"}</strong></span></li>
    ) : null;
  return (
    <>
      <div className="day-panel-head">
        <button type="button" className="btn-link back-link" onClick={onBack}><Icon name="arrowLeft" size={15} /> Day {day} route</button>
        {number && <span className="muted small">Stop {number} of {markers.length}</span>}
      </div>
      <div className="stop-panel-header">
        <PlaceImage photo={info?.photo} category={info?.category} size="md" className="stop-panel-art" width={300} alt={stop.title} />
        <div>
          <h3 className="panel-place-name">{stop.title}</h3>
          <p className="muted small">{[info?.category, info?.rating != null ? `★ ${info.rating.toFixed(1)}` : null, stop.start + " – " + stop.end].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {place?.selected?.details.summary && (
        <p className="panel-place-summary">{place.selected.details.summary}</p>
      )}
      <PanelMap markers={markers} tripId={tripId} day={day} activeId={stop.id} />
      <ul className="panel-facts">
        {leg("From", before, stop.travelMinutesBefore)}
        {leg("To", after, after?.travelMinutesBefore ?? 0)}
        {info?.address && <li><Icon name="pin" size={15} /> <span>Address<strong>{info.address}</strong></span></li>}
        {stop.location && (
          <li>
            <Icon name="map" size={15} />
            <span>
              Google Maps
              <strong>
                <a
                  href={getGoogleMapsDirectionsUrl({ destination: stop.location })}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link-arrow small"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  Directions in Google Maps <Icon name="external" size={12} />
                </a>
              </strong>
            </span>
          </li>
        )}
        <li><Icon name="clock" size={15} /> <span>Hours<strong className={stop.hoursCheck === "unknown" ? "is-warning" : undefined}>{stop.hoursCheck === "unknown" ? "Not checked" : stop.hoursCheck === "closed" ? "Closed at this time" : "Open at this time"}</strong></span></li>
        {evidence && <li><Icon name="link" size={15} /> <span>Saved from<strong>{evidence.sourceType === "link" ? "A link you saved" : evidence.sourceType === "screenshot" ? "A screenshot you saved" : "A note you saved"}</strong></span></li>}
      </ul>
      {place && (
        <Link className="link-arrow" href={`/my-trip/${tripId}/place/${place.id}`}>Full details <Icon name="arrowRight" size={16} /></Link>
      )}
      <div className="panel-actions">
        <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} variant="chip" />
        {info?.attribution && <p className="fineprint">{info.attribution}</p>}
      </div>
    </>
  );
}

function PanelMap({ markers, tripId, day, activeId }: { markers: MapMarker[]; tripId: string; day: number; activeId?: string }) {
  const lines = markers.length > 1 ? [{ id: "day", points: markers.map((m) => m.position), dashed: true }] : [];
  const googleRoute = getGoogleMapsRouteUrl(markers);
  return (
    <div className="panel-map">
      {markers.length > 0 ? (
        <PlaceMap markers={markers} lines={lines} height={150} interactive={false} activeId={activeId} />
      ) : (
        <div className="map-placeholder" style={{ height: 150 }}>No mapped stops</div>
      )}
      <div className="panel-map-links">
        {googleRoute && (
          <a className="panel-map-google" href={googleRoute} target="_blank" rel="noreferrer noopener">
            <Icon name="map" size={13} /> Google Maps <Icon name="external" size={11} />
          </a>
        )}
        <Link className="panel-map-open" href={`/my-trip/${tripId}/map?day=${day}`}>
          <Icon name="map" size={13} /> Open map
        </Link>
      </div>
    </div>
  );
}
