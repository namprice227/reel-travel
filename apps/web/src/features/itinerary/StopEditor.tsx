"use client";

import type { CandidatePlace, PublicStop } from "@reel/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";

// Everything that changes one stop while editing a day, in one place, so the stop card only keeps the quick
// actions (drag, earlier/later, remove). Sections that don't apply to a stop's kind are left out.

export function StopEditorDialog({ stop, place, date, dates, tripId, busy, onMove, onSetTime, onUpdatePlace, onSwap, onRemove, onClose }: {
  stop: PublicStop;
  /** The trip place behind a place stop, for its name and branches. */
  place?: CandidatePlace;
  date: string;
  dates: string[];
  tripId: string;
  busy: boolean;
  onMove: (toDate: string) => void;
  /** Saves a new length and optional earliest start; resolves true once saved. */
  onSetTime: (durationMinutes: number, notBefore: string | null) => Promise<boolean>;
  /** Renames the place or switches its branch; resolves true once saved. */
  onUpdatePlace: (change: { providerPlaceId?: string; customName?: string | null }) => Promise<boolean>;
  /** Opens the place picker to swap this stop; absent for stops that can't be swapped. */
  onSwap?: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.showModal();
    return () => {
      el.close();
      before?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className="stop-editor" aria-labelledby="stop-editor-title" onCancel={(event) => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onClose();
    }}>
      <header className="stop-editor-head">
        <div>
          <p className="kicker">Edit stop · {stop.start}–{stop.end}</p>
          <h2 id="stop-editor-title">{stop.title}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Close stop editor" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      <div className="stop-editor-body">
        <TimeSection key={stop.id} stop={stop} busy={busy} onSetTime={onSetTime} />
        {place && stop.kind === "place" && <PlaceSection key={place.id} place={place} busy={busy} onUpdatePlace={onUpdatePlace} />}
        {dates.length > 1 && (
          <section className="stop-editor-section">
            <label htmlFor="stop-editor-day"><strong>Day</strong></label>
            <select id="stop-editor-day" disabled={busy} value={date} onChange={(e) => { if (e.target.value !== date) { onMove(e.target.value); onClose(); } }}>
              {dates.map((d, i) => <option key={d} value={d}>Day {i + 1} · {formatDay(d)}</option>)}
            </select>
            <small className="muted">Moving puts it at the start of that day.</small>
          </section>
        )}
        {onSwap && (
          <section className="stop-editor-section">
            {!(place && stop.kind === "place") && <strong>Place</strong>}
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onSwap}><Icon name="route" size={16} /> Swap for another place</button>
          </section>
        )}
        <section className="stop-editor-section">
          <strong>Note</strong>
          <NoteButton tripId={tripId} noteKey={noteKeys.stop(stop)} subject={stop.title} variant="chip" />
        </section>
      </div>
      <footer className="stop-editor-foot">
        <button type="button" className="btn btn-ghost btn-danger" disabled={busy} onClick={() => { onRemove(); onClose(); }}><Icon name="trash" size={16} /> Remove from day</button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </footer>
    </dialog>
  );
}

const LENGTHS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
const lengthLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};
const minutesBetween = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(5, (eh! * 60 + em!) - (sh! * 60 + sm!));
};

/** Length and earliest start. The planner still decides the actual start from travel and opening hours. */
function TimeSection({ stop, busy, onSetTime }: { stop: PublicStop; busy: boolean; onSetTime: (durationMinutes: number, notBefore: string | null) => Promise<boolean> }) {
  const current = stop.plannedDurationMinutes ?? minutesBetween(stop.start, stop.end);
  const [length, setLength] = useState(current);
  const [pinned, setPinned] = useState(Boolean(stop.notBefore));
  const [notBefore, setNotBefore] = useState(stop.notBefore ?? stop.start);
  const [done, setDone] = useState(false);
  if (stop.kind === "reservation") {
    return <section className="stop-editor-section"><strong>Time</strong><small className="muted">A fixed booking keeps its time. Change it in Trip settings.</small></section>;
  }
  const changed = length !== current || (pinned ? notBefore : null) !== (stop.notBefore ?? null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setDone(await onSetTime(length, pinned ? notBefore : null));
  }
  return (
    <form className="stop-editor-section stop-editor-time" onSubmit={(e) => void save(e)}>
      <strong>Time</strong>
      <label htmlFor="stop-editor-length">
        How long
        <select id="stop-editor-length" disabled={busy} value={length} onChange={(e) => { setLength(Number(e.target.value)); setDone(false); }}>
          {[...new Set([...LENGTHS, current])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{lengthLabel(m)}</option>)}
        </select>
      </label>
      <label className="inline" htmlFor="stop-editor-pin">
        <input id="stop-editor-pin" type="checkbox" disabled={busy} checked={pinned} onChange={(e) => { setPinned(e.target.checked); setDone(false); }} />
        Start no earlier than
      </label>
      {pinned && (
        <label htmlFor="stop-editor-not-before">
          <span className="sr-only">Earliest start</span>
          <input id="stop-editor-not-before" type="time" required disabled={busy} value={notBefore} onChange={(e) => { setNotBefore(e.target.value); setDone(false); }} />
        </label>
      )}
      <small className="muted">Later stops move to fit. Travel time and opening hours can still push the start later.</small>
      <div className="stop-editor-time-foot">
        {done && !changed && <span className="small muted" role="status">Saved.</span>}
        <button className="btn btn-small btn-primary" disabled={busy || !changed}>Save time</button>
      </div>
    </form>
  );
}

/** The traveler's own name for the place and, when the provider found several, which branch it is. */
function PlaceSection({ place, busy, onUpdatePlace }: {
  place: CandidatePlace;
  busy: boolean;
  onUpdatePlace: (change: { providerPlaceId?: string; customName?: string | null }) => Promise<boolean>;
}) {
  const providerName = place.selected?.name ?? place.name;
  const [name, setName] = useState(place.customName ?? providerName);
  const [branch, setBranch] = useState(place.selected?.providerPlaceId ?? "");
  const [saved, setSaved] = useState<"name" | "branch" | null>(null);
  const nameChanged = name.trim() !== (place.customName ?? providerName) && name.trim().length > 0;
  const branches = place.options.length > 1 ? place.options : [];

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const label = name.trim();
    if (await onUpdatePlace({ customName: label === providerName ? null : label })) setSaved("name");
  }

  return (
    <>
      <form className="stop-editor-section" onSubmit={(e) => void saveName(e)}>
        <label htmlFor="stop-editor-name"><strong>Name</strong></label>
        <input id="stop-editor-name" maxLength={120} required disabled={busy} value={name} onChange={(e) => { setName(e.target.value); setSaved(null); }} />
        <small className="muted">
          {place.customName ? <>Your name for it. The place is listed as “{providerName}”. </> : "Only changes how it shows in this trip. "}
          {place.customName && <button type="button" className="link-button" disabled={busy} onClick={() => void onUpdatePlace({ customName: null }).then((ok) => { if (ok) { setName(providerName); setSaved("name"); } })}>Use the listed name</button>}
        </small>
        <div className="stop-editor-time-foot">
          {saved === "name" && !nameChanged && <span className="small muted" role="status">Saved.</span>}
          <button className="btn btn-small btn-primary" disabled={busy || !nameChanged}>Save name</button>
        </div>
      </form>
      {branches.length > 0 && (
        <fieldset className="stop-editor-section plain-fieldset">
          <legend><strong>Which branch</strong></legend>
          {branches.map((option) => (
            <label key={option.providerPlaceId} className="stop-editor-branch" htmlFor={`branch-${option.providerPlaceId}`}>
              <input id={`branch-${option.providerPlaceId}`} type="radio" name="stop-editor-branch" disabled={busy} checked={branch === option.providerPlaceId} onChange={() => { setBranch(option.providerPlaceId); setSaved(null); }} />
              <span><strong>{option.name}</strong><small>{option.address ?? "Address not available"}{option.details.provider === "fixture" ? " · synthetic sample" : ""}</small></span>
            </label>
          ))}
          <div className="stop-editor-time-foot">
            {saved === "branch" && branch === place.selected?.providerPlaceId && <span className="small muted" role="status">Saved.</span>}
            <button type="button" className="btn btn-small btn-primary" disabled={busy || !branch || branch === place.selected?.providerPlaceId}
              onClick={() => void onUpdatePlace({ providerPlaceId: branch }).then((ok) => { if (ok) setSaved("branch"); })}>Use this branch</button>
          </div>
        </fieldset>
      )}
    </>
  );
}
