"use client";

import type { CandidatePlace, Itinerary, PublicStop } from "@reel/contracts";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { StopArt, categoryGroup } from "@/components/Illustration";
import { PlaceImage } from "@/components/PlacePhoto";
import { PlaceMap, type MapLine, type MapMarker } from "@/components/PlaceMap";
import { Badge } from "@/components/ui";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { getGoogleMapsDirectionsUrl, getGoogleMapsPlaceUrl, getGoogleMapsRouteUrl } from "@/lib/maps";
import { formatShortDate } from "@/lib/trip-dates";
import { infoFor, stopStatus, stopSubtitle, type PlaceInfoMap } from "./place-info";
import { PlanningAdvice, PracticalAdvice, SuggestedActivityDetails } from "./PlanningAdvice";
import { hoursForDate } from "./place-hours";
import { PlaceDetailsSheet } from "./PlaceDetailsSheet";

// Compact day workspace; selected places open beside the day or in a dialog on narrow screens.

export interface EditHandlers {
  move: (stopId: string, toDate: string, toIndex: number) => void;
  remove: (stop: PublicStop) => void;
  add: (placeId: string, date: string) => void;
  /** Replacement always opens a server-validated dry-run preview first. */
  replace: (stop: PublicStop, placeId: string) => void;
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
  onEditingChange,
  onRegenerate,
  regenerationRecommended = false,
  onUndo,
  saveStatus,
  feedback,
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
  onEditingChange?: (editing: boolean) => void;
  onRegenerate?: () => void;
  regenerationRecommended?: boolean;
  onUndo?: () => void;
  saveStatus?: string;
  feedback?: ReactNode;
}) {
  const search = useSearchParams();
  const selectedId = search.get("stop");
  const setSelectedId = (id: string | null) => {
    const query = new URLSearchParams(search.toString());
    if (id) query.set("stop", id); else query.delete("stop");
    window.history.replaceState({ dayScroll: window.history.state?.dayScroll }, "", `${window.location.pathname}?${query}`);
  };
  const [narrow, setNarrow] = useState(false);
  const stopScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1099px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const day = itinerary.days[dayIndex] ?? itinerary.days[0];
  // A dropped stop shows in its new place while the server re-times the day; the next version replaces it.
  const [dropped, setDropped] = useState<{ version: number; date: string; order: string[] } | null>(null);
  const savedStops = day?.stops ?? [];
  const stops = dropped && dropped.version === itinerary.version && dropped.date === day?.date
    ? dropped.order.flatMap((id) => savedStops.filter((s) => s.id === id))
    : savedStops;
  // A rejected or failed move leaves the version unchanged; drop the provisional order once saving stops.
  useEffect(() => { if (!busy) setDropped(null); }, [busy]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !day || !onEdit || busy) return;
    const stopId = String(active.id);
    const target = String(over.id);
    if (target.startsWith("day:")) {
      const toDate = target.slice(4);
      if (toDate !== day.date) onEdit.move(stopId, toDate, Number.MAX_SAFE_INTEGER);
      return;
    }
    const from = stops.findIndex((s) => s.id === stopId);
    const to = stops.findIndex((s) => s.id === target);
    if (from < 0 || to < 0 || from === to) return;
    setDropped({ version: itinerary.version, date: day.date, order: arrayMove(stops, from, to).map((s) => s.id) });
    onEdit.move(stopId, day.date, to);
  };
  const located = stops.filter((s) => s.location);
  const pinNumber = new Map(located.map((s, i) => [s.id, i + 1]));
  const selected = stops.find((s) => s.id === selectedId) ?? null;
  const dates = itinerary.days.map((d) => d.date);
  useEffect(() => {
    if (stopScroll.current) stopScroll.current.scrollTop = window.history.state?.dayScroll?.[day?.date ?? ""] ?? 0;
  }, [day?.date]);

  const panel = day && selected && !editing ? <StopPanel
    stop={selected} stops={stops} number={pinNumber.get(selected.id)} places={places}
    place={selected.placeId ? placeDetails.get(selected.placeId) : undefined}
    transport={transport} tripId={tripId} onBack={() => setSelectedId(null)}
    markers={markersFor(located, pinNumber, places)} day={dayIndex + 1} date={day.date}
  /> : null;

  const summary = (stops: PublicStop[]) => {
    if (stops.length === 0) return "Free day";
    const groups = [...new Set(stops.filter((s) => s.kind !== "break").map((s) => (s.kind === "reservation" ? "Booked dining" : categoryGroup(infoFor(s, places)?.category))))].filter((g) => g !== "Unsorted" && g !== "Other");
    return groups.length === 0 ? `${stops.length} stops` : groups.slice(0, 2).join(" and ");
  };

  return (
    <DndContext sensors={sensors} collisionDetection={dayFirst} onDragEnd={onDragEnd} accessibility={{ announcements: dragAnnouncements(stops, dates) }}>
    <div className={`day-layout trip-day-workspace fit-fill${editing ? " is-editing" : ""}`}>
      <nav className="day-rail" aria-label="Trip days">
        {itinerary.days.map((d, i) => (
          <DayRailButton key={d.date} date={d.date} index={i} active={i === dayIndex} droppable={editing && d.date !== day?.date} busy={busy} onSelect={() => onSelectDay(i)} />
        ))}
      </nav>

      {day && (
        <section className="day-main" aria-labelledby="day-title">
          <div className="day-heading">
            <div><h2 id="day-title">{editing ? "Editing day" : "Day"} {dayIndex + 1}</h2><p>{formatDay(day.date)}</p></div>
            <div className="day-heading-actions">
              {!editing && regenerationRecommended && onRegenerate && (
                <button className="btn btn-outline btn-small day-regenerate" disabled={busy} onClick={onRegenerate}>
                  <Icon name="sparkle" size={16} /> Review &amp; regenerate
                </button>
              )}
              {editing && onRegenerate && <details className="day-more"><summary>More</summary><button className="btn btn-outline" disabled={busy} onClick={onRegenerate}>Regenerate itinerary</button></details>}
              {editing && onUndo && <button className="btn btn-outline" disabled={busy} onClick={onUndo}>Undo</button>}
              {onEditingChange && <button className="btn btn-primary" disabled={busy} onClick={() => onEditingChange(!editing)}><Icon name={editing ? "check" : "edit"} size={17} />{editing ? "Done" : "Edit day"}</button>}
            </div>
          </div>
          {editing && <p className="day-edit-hint">Drag a stop by its handle to reorder it, or onto another day to move it there. Moves save as you go; fixed bookings stay put.</p>}
          {saveStatus && <p className="day-save-status" role="status">{saveStatus}</p>}
          {feedback}
          <div ref={stopScroll} className="stop-scroll panel-scroll" onScroll={() => {
            window.history.replaceState({ ...window.history.state, dayScroll: { ...window.history.state?.dayScroll, [day.date]: stopScroll.current?.scrollTop ?? 0 } }, "");
          }}>
            <PlanningAdvice assumptions={itinerary.assumptions} />
            <PracticalAdvice quality={itinerary.quality} />
            {stops.length === 0 ? (
              <div className="empty">A free day to wander.</div>
            ) : (
              <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ol className="stop-list">
                {stops.map((stop, index) => (
                  <SortableStop key={stop.id} id={stop.id} disabled={!editing || busy || stop.kind === "reservation"}>
                    {stop.travelMinutesBefore === null && <div className="travel-row">Travel time unknown · arrival not checked</div>}
                    {stop.travelMinutesBefore !== null && stop.travelMinutesBefore > 0 && !editing && (
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
                      replacementPlaces={itinerary.unscheduledPlaceIds.map((id) => placeDetails.get(id)).filter((place): place is CandidatePlace => Boolean(place))}
                      onSelect={() => setSelectedId(stop.id === selectedId ? null : stop.id)}
                      onEdit={onEdit}
                    />
                    <SuggestedActivityDetails stop={stop} />
                  </SortableStop>
                ))}
              </ol>
              </SortableContext>
            )}
          </div>
        </section>
      )}

      {day && !(narrow && panel) && (
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
          ) : panel ? (
            panel
          ) : (
            <DayPanel
              transport={transport}
              day={dayIndex + 1}
              date={day.date}
              stops={stops}
              markers={markersFor(located, pinNumber, places)}
              tripId={tripId}
              summary={summary(stops)}
              onSelectStop={(id) => setSelectedId(id)}
            />
          )}
        </aside>
      )}
      {narrow && panel && selected && <PlaceDetailsSheet label={`Details for ${selected.title}`} onClose={() => setSelectedId(null)}>{panel}</PlaceDetailsSheet>}
    </div>
    </DndContext>
  );
}

/** A day in the rail; while editing, other days accept a dragged stop (added to the end of that day). */
function DayRailButton({ date, index, active, droppable, busy, onSelect }: {
  date: string; index: number; active: boolean; droppable: boolean; busy: boolean; onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, disabled: !droppable });
  const className = [active && "active", droppable && "is-drop-target", isOver && "is-over"].filter(Boolean).join(" ");
  return (
    <button ref={setNodeRef} type="button" disabled={busy} className={className || undefined} aria-current={active ? "true" : undefined} onClick={onSelect}>
      <span className="day-dot" aria-hidden="true" />
      <strong>Day {index + 1}</strong>
      <span>{formatShortDate(date)}</span>
    </button>
  );
}

type DragHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef">;
const DragHandleContext = createContext<DragHandleProps | null>(null);

function SortableStop({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} className={isDragging ? "is-dragging" : undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <DragHandleContext.Provider value={disabled ? null : { attributes, listeners, setActivatorNodeRef }}>{children}</DragHandleContext.Provider>
    </li>
  );
}

function DragHandle({ label }: { label: string }) {
  const handle = useContext(DragHandleContext);
  if (!handle) return null;
  return (
    <button type="button" className="drag-handle" ref={handle.setActivatorNodeRef} {...handle.attributes} {...handle.listeners} aria-label={`Drag ${label}`}>
      <Icon name="grip" size={18} />
    </button>
  );
}

/** Day targets win while the pointer is over the rail; otherwise the nearest stop in the list. */
const dayFirst: CollisionDetection = (args) => {
  const day = pointerWithin(args).find((hit) => String(hit.id).startsWith("day:"));
  return day ? [day] : closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith("day:")) });
};

function dragAnnouncements(stops: PublicStop[], dates: string[]): Announcements {
  const title = (id: UniqueIdentifier) => stops.find((s) => s.id === id)?.title ?? "Stop";
  const where = (id: UniqueIdentifier) => {
    const value = String(id);
    if (value.startsWith("day:")) return `the end of day ${dates.indexOf(value.slice(4)) + 1}`;
    return `position ${stops.findIndex((s) => s.id === value) + 1} of ${stops.length}`;
  };
  return {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${title(active.id)} is over ${where(over.id)}.` : `${title(active.id)} is not over a drop position.`,
    onDragEnd: ({ active, over }) => over ? `${title(active.id)} dropped at ${where(over.id)}.` : `${title(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
  };
}

const markersFor = (located: PublicStop[], pinNumber: Map<string, number>, places: PlaceInfoMap): MapMarker[] =>
  located.map((s) => ({ id: s.id, position: s.location!, label: `${pinNumber.get(s.id)}. ${s.title}`, number: pinNumber.get(s.id), provider: infoFor(s, places)?.provider, attribution: infoFor(s, places)?.attribution }));

function StopRow({
  stop, number, places, active, editing, busy, first, last, dates, date, index, tripId, replacementPlaces, onSelect, onEdit,
}: {
  stop: PublicStop; number?: number; places: PlaceInfoMap; active: boolean; editing: boolean; busy: boolean;
  first: boolean; last: boolean; dates: string[]; date: string; index: number; tripId: string;
  replacementPlaces: CandidatePlace[];
  onSelect: () => void; onEdit?: EditHandlers;
}) {
  const status = stopStatus(stop);
  const flag = status && (stop.kind === "reservation" || stop.hoursCheck === "unknown" || stop.hoursCheck === "closed") ? status : null;
  const fixed = stop.kind === "reservation";
  return (
    <article className={`stop-card is-${stop.kind}${active ? " is-active" : ""}`}>
      {editing && <DragHandle label={stop.title} />}
      {stop.kind === "meal" || stop.kind === "suggestion" ? <StopArt kind={stop.kind} /> : <PlaceImage google={infoFor(stop, places)?.googlePhoto} photo={infoFor(stop, places)?.photo} category={infoFor(stop, places)?.category} alt={stop.title} width={200} />}
      <button type="button" className="stop-card-text" onClick={onSelect} aria-pressed={active} disabled={editing}>
        <span className="stop-card-time">{stop.start} – {stop.end}</span>
        <strong>{stop.title}</strong>
        <span className="stop-card-place"><Icon name={stop.kind === "break" ? "pause" : "pin"} size={15} /> {stopSubtitle(stop, places)}</span>
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
            {stop.placeId && replacementPlaces.length > 0 && (
              <select className="move-day replace-stop" aria-label={`Replace ${stop.title}`} disabled={busy} value="" onChange={(e) => e.target.value && onEdit.replace(stop, e.target.value)}>
                <option value="">Replace…</option>
                {replacementPlaces.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
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
          <p className="muted small">Every selected place with a usable location is on a day.</p>
        ) : (
          <>
            <p className="muted small">Selected places that didn&apos;t fit. Add one to the end of this day.</p>
            <ul>
              {unscheduled.map((id) => {
                const place = placeDetails.get(id);
                return (
                  <li key={id}>
                    <PlaceImage google={place?.selected?.details.provider === "google" ? { tripId: place.tripId, placeId: place.id, providerPlaceId: place.selected.providerPlaceId } : undefined} photo={place?.selected?.details.photos[0]} category={place?.selected?.details.category} className="edit-pool-art" width={200} size="sm" />
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

function DayPanel({
  day,
  date,
  stops,
  markers,
  tripId,
  summary,
  onSelectStop,
  transport,
}: {
  transport: string;
  day: number;
  date: string;
  stops: PublicStop[];
  markers: MapMarker[];
  tripId: string;
  summary: string;
  onSelectStop?: (id: string) => void;
}) {
  const travel = stops.reduce((total, s) => total + (s.travelMinutesBefore ?? 0), 0);
  const unknownTravel = stops.some((s) => s.travelMinutesBefore === null);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const located = stops.filter((s) => s.location);
  const lines: MapLine[] = located.length > 1 ? [{ id: date, points: located.map((s) => s.location!), dashed: true }] : [];
  return (
    <>
      <div className="day-panel-head">
        <p className="kicker">{formatDay(date)}</p>
        <h3>Day {day} route</h3>
      </div>
      <PanelMap markers={markers} lines={lines} tripId={tripId} day={day} onSelect={onSelectStop} travel={transport} />
      <ul className="panel-facts">
        <li><Icon name="pin" size={15} /> <span>Stops<strong>{stops.length} on this day · {summary.toLowerCase()}</strong></span></li>
        <li><Icon name="route" size={15} /> <span>Travel<strong>{unknownTravel ? "Travel time partly unknown" : travel > 0 ? `About ${travel} min in total` : "No travel estimated"}</strong></span></li>
        {first && last && <li><Icon name="clock" size={15} /> <span>Day<strong>{first.start} – {last.end}</strong></span></li>}
      </ul>
      <ol className="panel-stops">
        {markers.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="panel-stop-link-btn"
              onClick={() => onSelectStop?.(m.id)}
              title={`View details for ${m.label.replace(/^\d+\. /, "")}`}
            >
              <span className="pin-num is-small">{m.number}</span>
              <span>{m.label.replace(/^\d+\. /, "")}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="panel-hint"><Icon name="info" size={15} /> Click any pin on the map or stop above to see details.</p>
    </>
  );
}

function StopPanel({
  stop, stops, number, places, place, transport, tripId, onBack, markers, day, date,
}: {
  stop: PublicStop; stops: PublicStop[]; number?: number; places: PlaceInfoMap; place?: CandidatePlace;
  transport: string; tripId: string; onBack: () => void; markers: MapMarker[]; day: number; date: string;
}) {
  const info = infoFor(stop, places);
  const option = place?.selected ?? null;
  const synthetic = option?.details.provider === "fixture";
  const placeUrl = option && !synthetic ? getGoogleMapsPlaceUrl({
    location: option.location, name: option.name,
    placeId: option.details.provider === "google" ? option.providerPlaceId : undefined,
    providerUrl: option.details.provider === "google" ? option.details.providerUrl ?? undefined : undefined,
  }) : undefined;
  const index = stops.findIndex((s) => s.id === stop.id);
  const before = stops[index - 1];
  const after = stops[index + 1];
  const evidence = place?.evidence[0];
  const hours = option?.details.openingHours;
  const leg = (label: string, other: PublicStop | undefined, minutes: number | null) => other && (minutes === null || minutes > 0) ? (
    <li><Icon name={TRAVEL_ICON[transport] ?? "route"} size={15} /><span>{label} {other.title}<strong>{minutes === null ? "Travel time unknown · arrival not checked" : `≈ ${minutes} min ${transport === "walk" ? "walk" : transport === "car" ? "drive" : "by transit"} · estimate`}</strong></span></li>
  ) : null;
  return (
    <>
      <div className="selected-place-essential">
        <div className="day-panel-head">
          <span className="muted small">{number ? `Stop ${number} · ` : ""}{stop.start}–{stop.end}</span>
          <button type="button" className="btn btn-ghost place-panel-close" onClick={onBack} aria-label="Close place details">Close <Icon name="close" size={16} /></button>
        </div>
        <h3 className="panel-place-name">{placeUrl ? <a href={placeUrl} target="_blank" rel="noreferrer noopener" aria-label={`${stop.title} on Google Maps (opens in a new tab)`}>{stop.title} <Icon name="external" size={17} /></a> : stop.title}</h3>
        {stop.kind === "place" || option ? <div className="selected-place-hours">
          <p className={!hours || hours.status === "unknown" || stop.hoursCheck === "closed" ? "is-warning" : undefined}><Icon name="clock" size={15} /> {hoursForDate(hours, date)}{synthetic ? " · sample" : ""}</p>
          <small>{hours?.status === "known" && stop.hoursCheck === "open" ? "Open during your planned visit" : hours?.status === "known" && stop.hoursCheck === "closed" ? "Your visit is outside these hours" : "Check before visiting"}</small>
        </div> : <p className="muted small">{stop.kind === "reservation" ? "Your booking · opening hours not checked" : stopSubtitle(stop, places)}</p>}
        <div className="selected-place-actions">
          {option && place && <Link className="btn btn-primary" href={`/my-trip/${tripId}/place/${place.id}?day=${day}&stop=${encodeURIComponent(stop.id)}`}>Full details <Icon name="arrowRight" size={16} /></Link>}
          <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} variant="chip" />
        </div>
      </div>
      <div className="selected-place-secondary">
        <SuggestedActivityDetails stop={stop} />
        <p className="muted small">{[info?.category, info?.address].filter(Boolean).join(" · ")}</p>
        {synthetic && <p className="fineprint">Synthetic sample place; not a real venue.</p>}
        {stop.location && (
          <PanelMap
            markers={markers.filter((m) => m.id === stop.id)}
            tripId={tripId}
            day={day}
            activeId={stop.id}
            placeUrl={placeUrl}
          />
        )}
        {placeUrl && stop.location && <a className="link-arrow" href={getGoogleMapsDirectionsUrl({ destination: stop.location, mode: transport === "walk" ? "walking" : transport === "car" ? "driving" : "transit" })} target="_blank" rel="noreferrer noopener">Get directions <Icon name="external" size={14} /></a>}
        {option?.details.summary && <p className="panel-place-summary">{option.details.summary}</p>}
        {!before && stop.travelMinutesBefore === null && <p className="muted small">Travel time unknown · arrival not checked</p>}
        <ul className="panel-facts">{leg("From", before, stop.travelMinutesBefore)}{leg("To", after, after ? after.travelMinutesBefore : 0)}</ul>
        {evidence && <Link className="selected-place-source" href={`/inspiration-library?trip=${tripId}`}><Icon name="link" size={14} /> Saved from {evidence.sourceType === "link" ? "your link" : evidence.sourceType === "screenshot" ? "your screenshot" : "your note"} <Icon name="arrowRight" size={14} /></Link>}
        {info?.attribution && <p className="fineprint">{info.attribution}</p>}
      </div>
    </>
  );
}

function PanelMap({
  markers,
  lines = [],
  tripId,
  day,
  activeId,
  onSelect,
  placeUrl,
  travel,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  tripId: string;
  day: number;
  activeId?: string;
  onSelect?: (id: string) => void;
  placeUrl?: string;
  travel?: string;
}) {
  const isMultiStop = markers.length > 1;
  const routeUrl = getGoogleMapsRouteUrl(markers);
  const clickTargetUrl = activeId ? (placeUrl ?? getGoogleMapsPlaceUrl({ location: markers[0]?.position })) : routeUrl;

  return (
    <div className="panel-map">
      {markers.length > 0 ? (
        <div className="panel-map-container" style={{ position: "relative", height: 180, borderRadius: "var(--radius, 12px)", overflow: "hidden" }}>
          <PlaceMap
            renderer={isMultiStop ? "journey" : "google"}
            markers={markers}
            lines={lines}
            height={180}
            interactive={isMultiStop}
            activeId={activeId}
            onSelect={onSelect}
            travel={asTravel(travel)}
            chrome={!isMultiStop}
          />
          {clickTargetUrl && (
            <a
              href={clickTargetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="panel-map-google-chip"
              title={activeId ? "Open this place in Google Maps" : `Open Day ${day} in Google Maps`}
              aria-label={activeId ? "Open this place in Google Maps" : `Open Day ${day} in Google Maps (opens in a new tab)`}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="map" size={12} />
              <span>{activeId ? "Google Maps" : `Day ${day} Route`}</span>
              <Icon name="external" size={11} />
            </a>
          )}
        </div>
      ) : (
        <div className="map-placeholder">No mapped stops</div>
      )}
      {!activeId && (
        <Link className="panel-day-map-link" href={`/my-trip/${tripId}/map?day=${day}`}>
          <Icon name="map" size={15} /> Explore this day’s map <Icon name="arrowRight" size={14} />
        </Link>
      )}
    </div>
  );
}

const asTravel = (mode?: string) => (mode === "walk" || mode === "transit" || mode === "car" ? mode : undefined);
