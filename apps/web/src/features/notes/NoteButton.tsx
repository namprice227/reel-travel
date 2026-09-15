"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { formatTimestamp } from "@/lib/format";
import { useNotes } from "./notes-store";

/** Note icon that opens a private notes drawer for one stop, day or trip. */
export function NoteButton({
  tripId,
  noteKey,
  subject,
  variant = "icon",
}: {
  tripId: string;
  noteKey: string;
  /** What the note is about, e.g. the stop title. */
  subject: string;
  variant?: "icon" | "chip";
}) {
  const { notes, save, remove } = useNotes(tripId);
  const note = notes[noteKey];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const show = () => {
    setDraft(note?.text ?? "");
    setOpen(true);
  };

  const label = note ? `Open your note for ${subject}` : `Add a note for ${subject}`;

  return (
    <>
      {variant === "chip" ? (
        <button type="button" className={`note-chip${note ? " has-note" : ""}`} onClick={show} aria-label={label}>
          <Icon name="note" size={16} /> {note ? "Your note" : "Add a note"}
        </button>
      ) : (
        <button type="button" className={`note-button${note ? " has-note" : ""}`} onClick={show} aria-label={label} title={label}>
          <Icon name="note" size={18} />
          {note && <span className="note-dot" aria-hidden="true" />}
        </button>
      )}

      <dialog ref={dialog} className="notes-drawer" onClose={() => setOpen(false)} aria-labelledby={`note-title-${noteKey}`}>
        {open && (
          <form
            className="notes-drawer-body"
            onSubmit={(e) => {
              e.preventDefault();
              save(noteKey, draft);
              setOpen(false);
            }}
          >
            <div className="notes-drawer-head">
              <h2 id={`note-title-${noteKey}`}>Notes</h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close notes">
                <Icon name="close" />
              </button>
            </div>
            <div className="row notes-subject">
              <strong>{subject}</strong>
              <span className="pill pill-info"><Icon name="lock" size={14} /> Private to you</span>
            </div>

            <label className="notes-field">
              {note ? "Your note" : "Add a note"}
              <textarea
                autoFocus
                value={draft}
                maxLength={1000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reminder, idea or detail…"
              />
            </label>
            {note && <p className="muted small">Edited {formatTimestamp(note.updatedAt)}</p>}

            <div className="row">
              <button className="btn btn-primary">Save note</button>
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              {note && (
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => {
                    remove(noteKey);
                    setOpen(false);
                  }}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              )}
            </div>

            <div className="callout">
              <Icon name="note" />
              <p className="small">
                Notes appear beside this item in your itinerary. They are not included in shared trip links, and for now
                they are saved in this browser only.
              </p>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
