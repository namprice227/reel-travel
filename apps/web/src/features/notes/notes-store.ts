"use client";

import { useCallback, useSyncExternalStore } from "react";

// Private traveler notes. STAND-IN: there is no notes endpoint in packages/contracts yet, so notes are kept
// in this browser's localStorage per trip. They never reach the server or shared links. Replace this module
// with an API-backed store once a notes contract exists; components only use the hook below.

export interface Note {
  text: string;
  updatedAt: string;
}

type NoteMap = Record<string, Note>;

const EVENT = "reel-notes-change";
const storageKey = (tripId: string) => `reel.notes.${tripId}`;
const EMPTY: NoteMap = {};
const cache = new Map<string, { raw: string | null; value: NoteMap }>();

function read(tripId: string): NoteMap {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(tripId));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(tripId);
  if (cached && cached.raw === raw) return cached.value;
  let value: NoteMap = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as NoteMap) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache.set(tripId, { raw, value });
  return value;
}

function write(tripId: string, notes: NoteMap) {
  try {
    window.localStorage.setItem(storageKey(tripId), JSON.stringify(notes));
  } catch {
    // Storage blocked (private mode): the note is lost on reload, but the page keeps working.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Note keys. Place stops key by place id so a note survives regeneration and moves. */
export const noteKeys = {
  stop: (stop: { id: string; placeId: string | null; reservationId: string | null }) =>
    stop.placeId ? `place:${stop.placeId}` : stop.reservationId ? `booking:${stop.reservationId}` : `stop:${stop.id}`,
  place: (placeId: string) => `place:${placeId}`,
  day: (date: string) => `day:${date}`,
  trip: () => "trip",
};

export function useNotes(tripId: string) {
  const notes = useSyncExternalStore(subscribe, () => read(tripId), () => EMPTY);

  const save = useCallback(
    (key: string, text: string) => {
      const next = { ...read(tripId) };
      if (text.trim()) next[key] = { text: text.trim(), updatedAt: new Date().toISOString() };
      else delete next[key];
      write(tripId, next);
    },
    [tripId],
  );

  return { notes, save, remove: (key: string) => save(key, "") };
}
