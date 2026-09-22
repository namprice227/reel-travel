"use client";

import { MAX_SCREENSHOT_BYTES, SCREENSHOT_CONTENT_TYPES, type Trip } from "@reel/contracts";
import Link from "next/link";
import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// F1 save box (Member 1). Endpoints: inspirations.create, inspirations.createFromScreenshot.
// Show the destination trip explicitly; automatic trip assignment remains deferred.
// "hero" and "bar" retain explicit trip selection for other import surfaces.
// Pasting or dropping an image anywhere in the box switches to Screenshot.

type Mode = "link" | "screenshot" | "note";

const MODES: Array<{ value: Mode; label: string; icon: IconName }> = [
  { value: "link", label: "Reel or link", icon: "link" },
  { value: "screenshot", label: "Screenshot", icon: "image" },
  { value: "note", label: "Note", icon: "text" },
];

export function SaveComposer({
  trips,
  defaultTripId,
  variant = "hero",
  onSaved,
}: {
  trips: Trip[];
  defaultTripId?: string;
  variant?: "hero" | "bar" | "home";
  onSaved?: (tripId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tripId, setTripId] = useState(defaultTripId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ tripId: string; title: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const trip = trips.find((t) => t.id === tripId) ?? trips.find((t) => t.id === defaultTripId) ?? trips[0];
  const id = `composer-${variant}`;

  const pickFile = (candidate: File | undefined | null) => {
    if (!candidate) return;
    if (!(SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(candidate.type)) {
      setProblem("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (candidate.size > MAX_SCREENSHOT_BYTES) {
      setProblem("That image is over 4 MiB. Choose a smaller screenshot.");
      return;
    }
    setProblem(null);
    setMode("screenshot");
    setFile(candidate);
  };

  const onPaste = (e: ClipboardEvent<HTMLFormElement>) => {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (image) {
      e.preventDefault();
      pickFile(image);
    }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const ready = mode === "link" ? url.trim() : mode === "note" ? text.trim() : file;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trip || !ready) return;
    setBusy(true);
    setError(null);
    setProblem(null);
    setSaved(null);
    try {
      const params = { tripId: trip.id };
      if (mode === "screenshot" && file) await api("inspirations.createFromScreenshot", { params, body: { file } });
      else if (mode === "link") await api("inspirations.create", { params, body: { sourceType: "link", url: url.trim() } });
      else await api("inspirations.create", { params, body: { sourceType: "text", text: text.trim() } });
      setUrl("");
      setText("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setSaved({ tripId: trip.id, title: trip.title });
      onSaved?.(trip.id);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <div className={`card composer composer-empty composer-${variant}`}>
        <p>Create a trip first, then save reels, screenshots and notes into it.</p>
        <Link className="btn btn-primary" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>
      </div>
    );
  }

  const tripPicker = trips.length > 1 ? (
    <label htmlFor={`${id}-trip`} className={variant === "bar" ? "composer-trip is-bar" : "composer-trip"}>
      <span className={variant === "bar" ? "sr-only" : undefined}>Save to</span>
      <select id={`${id}-trip`} value={trip.id} onChange={(e) => setTripId(e.target.value)}>
        {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
    </label>
  ) : variant !== "bar" ? (
    <span className="muted">Saving to <strong>{trip.title}</strong></span>
  ) : null;

  const field =
    mode === "link" ? (
      <>
        <label className="sr-only" htmlFor={`${id}-link`}>Reel or link</label>
        <input id={`${id}-link`} className="composer-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste an English YouTube link (up to 2 minutes)" />
      </>
    ) : mode === "note" ? (
      <>
        <label className="sr-only" htmlFor={`${id}-note`}>Note</label>
        {variant === "bar" ? (
          <input id={`${id}-note`} className="composer-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note about a place" />
        ) : (
          <textarea id={`${id}-note`} className="composer-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={variant === "home" ? "A little place you don’t want to forget…" : "Kumo Ramen was the best bowl of my life!"} />
        )}
      </>
    ) : (
      <label className={variant === "bar" ? "composer-file-btn" : "composer-drop"} htmlFor={`${id}-file`}>
        <Icon name="image" size={variant === "bar" ? 18 : 28} />
        {file ? <strong>{file.name}</strong> : <strong>{variant === "bar" ? "Choose or drop a screenshot" : "Drop a screenshot here, or choose one"}</strong>}
        {variant !== "bar" && <span>PNG, JPEG, WebP or GIF up to 4 MiB. Saved securely to your trip as a visual reference thumbnail.</span>}
        <input id={`${id}-file`} ref={fileInput} className="sr-only" type="file" accept={SCREENSHOT_CONTENT_TYPES.join(",")} onChange={(e) => pickFile(e.target.files?.[0])} />
      </label>
    );

  const modes = (
    <div className={`composer-modes${variant === "bar" ? " is-icons" : ""}`} role="tablist" aria-label="What are you saving?">
      {MODES.map((m) => (
        <button key={m.value} type="button" role="tab" aria-selected={mode === m.value} aria-label={variant === "bar" ? m.label : undefined} title={m.label} onClick={() => setMode(m.value)}>
          <Icon name={m.icon} size={17} />{variant !== "bar" && ` ${m.label}`}
        </button>
      ))}
    </div>
  );

  return (
    <form
      className={`card composer composer-${variant}${dragOver ? " is-over" : ""}`}
      onSubmit={submit}
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {variant === "bar" ? (
        <div className="composer-bar-row">
          {modes}
          <div className="composer-bar-field">{field}</div>
          {tripPicker}
          <button className="btn btn-primary" disabled={busy || !ready}>{busy ? "Saving…" : "Save"}</button>
        </div>
      ) : (
        <>
          {modes}
          <div className={`composer-field${variant === "home" && mode === "link" ? " has-link-icon" : ""}`}>
            {variant === "home" && mode === "link" && <Icon name="link" size={21} />}
            {field}
          </div>
          <div className="composer-foot">
            {tripPicker}
            <div className="composer-action">
              <button className="btn btn-primary btn-large" disabled={busy || !ready}>
                <Icon name="sparkle" size={20} /> {busy ? "Saving…" : variant === "home" ? "Save inspiration" : "Save and find places"}
              </button>
              {variant === "home" && <p className="composer-helper">Short English YouTube videos and text produce unverified place suggestions.</p>}
            </div>
          </div>
        </>
      )}

      {problem && <p className="composer-problem" role="alert">{problem}</p>}
      {mode === "link" && <p className="small muted">Other links need place names or a caption added in the library.</p>}
      {saved && (
        <p className="composer-status" role="status">
          <Icon name="checkCircle" size={18} /> Saved to {saved.title}. Queued; processing may wait while the import service is offline.
          {variant !== "bar" && <> <Link href={`/inspiration-library?trip=${saved.tripId}`}>View in library</Link></>}
        </p>
      )}
      <ErrorBanner error={error} />
    </form>
  );
}
