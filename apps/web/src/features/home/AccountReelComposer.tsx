"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// Home's floating paste bar. Links are saved to the account shelf (accountReels.create) without choosing a trip.
// Notes and screenshots still need a trip, so Home names them and points there instead of guessing one.

export const HOME_PASTE_INPUT_ID = "home-paste";

type Kind = "empty" | "link" | "text" | "image";

function detect(value: string, file: File | null): Kind {
  if (file) return "image";
  const low = value.trim().toLowerCase();
  if (!low) return "empty";
  return /^(https?:\/\/|www\.)/.test(low) ? "link" : "text";
}

function linkLabel(value: string) {
  const low = value.toLowerCase();
  if (low.includes("instagram")) return "Instagram reel";
  if (low.includes("tiktok")) return "TikTok video";
  if (low.includes("youtube") || low.includes("youtu.be")) return "YouTube video";
  if (low.includes("pinterest")) return "Pinterest pin";
  return "Link";
}

export function AccountReelComposer({ onSaved }: { onSaved?: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const kind = detect(value, file);
  const trimmed = value.trim();
  const chip = kind === "link" ? linkLabel(trimmed)
    : kind === "text" ? `Text · ${trimmed.length} characters`
    : kind === "image" ? `Image · ${file!.name}` : null;

  function reset() {
    setValue("");
    setFile(null);
    setProblem(null);
  }

  function pickFile(candidate: File | undefined | null) {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {
      setProblem("Drop an image, such as a screenshot.");
      return;
    }
    setSaved(false);
    setProblem(null);
    setFile(candidate);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kind !== "link" || busy) return;
    let url: string;
    try {
      url = new URL(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed).toString();
    } catch {
      setProblem("That doesn't look like a complete link. Check it and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setProblem(null);
    setSaved(false);
    try {
      await api("accountReels.create", { body: { url } });
      reset();
      setSaved(true);
      await onSaved?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hb-composer">
      <form className={`hb-pill${dragging ? " is-dragging" : ""}`} onSubmit={submit}
        onDragOver={(event) => { event.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <span className="hb-pill-icon" aria-hidden="true"><Icon name="link" size={24} /></span>
        <label htmlFor={HOME_PASTE_INPUT_ID} className="sr-only">Paste a link</label>
        <input id={HOME_PASTE_INPUT_ID} className="hb-pill-input" type="text" maxLength={5000} autoComplete="off"
          placeholder="Paste a link" value={value}
          onChange={(event) => { setValue(event.target.value); setFile(null); setSaved(false); setProblem(null); }} />
        {chip && <>
          <span className="hb-chip">{chip}</span>
          <button type="button" className="hb-clear" aria-label="Clear" onClick={reset}><Icon name="close" size={15} /></button>
        </>}
        <span className="hb-pill-divider" aria-hidden="true" />
        <input id="home-image" type="file" accept="image/*" className="sr-only"
          onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
        <label htmlFor="home-image" className="hb-pill-image"><Icon name="image" size={19} /> Image</label>
        <button type="submit" className="hb-pill-go" disabled={kind !== "link" || busy}>
          <Icon name="search" size={18} /> {busy ? "Saving…" : "Start"}
        </button>
        {dragging && <div className="hb-pill-drop" aria-hidden="true"><Icon name="share" size={20} /> Drop your image</div>}
      </form>
      <div className="hb-pill-notes" aria-live="polite">
        {(kind === "text" || kind === "image") && <p>
          Home saves links for now. To add {kind === "text" ? "a note" : "a screenshot"}, open a trip and add it there.
        </p>}
        {problem && <p className="hb-pill-problem">{problem}</p>}
        {saved && <p className="hb-pill-success"><Icon name="checkCircle" size={17} /> Saved to your account. Public YouTube Shorts are read for place ideas; other links stay saved as sources.</p>}
        <ErrorBanner error={error} />
      </div>
    </div>
  );
}
