"use client";

import type { PublicStop } from "@reel/contracts";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";

// Everything that changes one stop while editing a day, in one place, so the stop card only keeps the quick
// actions (drag, earlier/later, remove). Sections that don't apply to a stop's kind are left out.

export function StopEditorDialog({ stop, date, dates, tripId, busy, onMove, onSwap, onRemove, onClose, children }: {
  stop: PublicStop;
  date: string;
  dates: string[];
  tripId: string;
  busy: boolean;
  onMove: (toDate: string) => void;
  /** Opens the place picker to swap this stop; absent for stops that can't be swapped. */
  onSwap?: () => void;
  onRemove: () => void;
  onClose: () => void;
  /** Extra sections (time, place details) rendered between the heading and the day section. */
  children?: ReactNode;
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
        {children}
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
            <strong>Place</strong>
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
