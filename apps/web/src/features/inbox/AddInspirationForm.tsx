"use client";

import { SCREENSHOT_CONTENT_TYPES, type SourceType } from "@reel/contracts";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useSubmit } from "@/lib/use-submit";

const MODES: Array<{ value: SourceType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
  { value: "screenshot", label: "Screenshot" },
];

export function AddInspirationForm({ tripId, onSaved }: { tripId: string; onSaved: () => void }) {
  const [mode, setMode] = useState<SourceType>("text");
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
    <form className="stack" onSubmit={submit}>
      <div className="tabs">
        {MODES.map((m) => (
          <button type="button" key={m.value} className={mode === m.value ? "active" : undefined} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "text" && (
        <label>
          Caption or notes
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a caption, a list of places, a friend's message…"
          />
        </label>
      )}
      {mode === "link" && (
        <label>
          Link
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
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
      <label>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the place names shown in the video" />
      </label>

      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          Save
        </button>
        {process.env.NODE_ENV !== "production" && (
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
