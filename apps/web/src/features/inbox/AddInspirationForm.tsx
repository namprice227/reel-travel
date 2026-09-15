"use client";

import { SCREENSHOT_CONTENT_TYPES, type SourceType } from "@reel/contracts";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useSubmit } from "@/lib/use-submit";

const MODES: Array<{ value: SourceType; label: string }> = [
  { value: "link", label: "Reel or link" },
  { value: "text", label: "Note" },
  { value: "screenshot", label: "Screenshot" },
];

export function AddInspirationForm({ tripId, onSaved, compact = false }: { tripId: string; onSaved: () => void; compact?: boolean }) {
  const [mode, setMode] = useState<SourceType>("link");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const { busy, error, run } = useSubmit();

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const params = { tripId };
      const optionalNote = note.trim() || undefined;
      if (mode === "screenshot") {
        if (!file) throw new Error("Choose an image first.");
        await api("inspirations.createFromScreenshot", { params, body: { file, note: optionalNote } });
      } else if (mode === "link") {
        await api("inspirations.create", { params, body: { sourceType: "link", url, note: optionalNote } });
      } else {
        await api("inspirations.create", { params, body: { sourceType: "text", text, note: optionalNote } });
      }
      setText("");
      setUrl("");
      setNote("");
      setFile(null);
      setFileInputKey((k) => k + 1);
      onSaved();
    });
  }

  return (
    <form className={`stack inspiration-form${compact ? " is-compact" : ""}`} onSubmit={submit}>
      <div className="tabs">
        {MODES.map((m) => (
          <button type="button" key={m.value} className={mode === m.value ? "active" : undefined} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "text" && (
        <label>
          Note
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a place or idea…"
          />
        </label>
      )}
      {mode === "link" && (
        <label>
          Reel or link
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a travel link…" />
        </label>
      )}
      {mode === "screenshot" && (
        <label>
          Image
          <input
            key={fileInputKey}
            type="file"
            required
            accept={SCREENSHOT_CONTENT_TYPES.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {!compact && <label>Extra detail (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Place name or caption" /></label>}

      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          Save inspiration
        </button>
        {!compact && process.env.NODE_ENV !== "production" && (
          <span className="muted small">
            Fake extractor: try &ldquo;Kumo Ramen&rdquo;, &ldquo;sky deck&rdquo;, &ldquo;lantern temple&rdquo;, a &ldquo;quoted
            name&rdquo;, or [[fail]].
          </span>
        )}
      </div>
      <ErrorBanner error={error} />
    </form>
  );
}
