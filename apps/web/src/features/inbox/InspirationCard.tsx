"use client";

import type { Inspiration } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Badge, ErrorBanner } from "@/components/ui";
import { api, uploadUrl } from "@/lib/api-client";
import { formatTimestamp, inspirationStatus } from "@/lib/format";
import { useSubmit } from "@/lib/use-submit";

export function InspirationCard({
  tripId,
  inspiration,
  onChange,
}: {
  tripId: string;
  inspiration: Inspiration;
  onChange: () => void;
}) {
  const [details, setDetails] = useState("");
  const { busy, error, run } = useSubmit();
  const params = { tripId, inspirationId: inspiration.id };
  const status = inspirationStatus[inspiration.status];
  const recoverable = inspiration.status === "needs_input" || inspiration.status === "failed";
  const placeCount = inspiration.placeIds.length;

  const act = (action: () => Promise<unknown>) =>
    void run(async () => {
      await action();
      setDetails("");
      onChange();
    });

  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="row between">
        <div className="row">
          <Badge>{inspiration.sourceType}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <span className="muted small">{formatTimestamp(inspiration.createdAt)}</span>
      </div>

      {inspiration.text && <p className="quote">{truncate(inspiration.text, 280)}</p>}
      {inspiration.url && (
        <a href={inspiration.url} target="_blank" rel="noopener noreferrer" className="small">
          {inspiration.url}
        </a>
      )}
      {inspiration.assetId && (
        // eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated upload
        <img src={uploadUrl(inspiration.assetId)} alt="Saved screenshot" className="thumb" />
      )}
      {inspiration.note && (
        <p className="small">
          <strong>Note:</strong> {inspiration.note}
        </p>
      )}
      {inspiration.details && (
        <p className="small">
          <strong>Added details:</strong> {inspiration.details}
        </p>
      )}

      {inspiration.status === "needs_confirmation" && (
        <p className="small">
          {placeCount} place{placeCount === 1 ? "" : "s"} found. <Link href={`/my-trip/${tripId}/places`}>Confirm them</Link>
        </p>
      )}
      {inspiration.status === "ready" && (
        <p className="small muted">
          {placeCount} place{placeCount === 1 ? "" : "s"} linked.
        </p>
      )}

      {recoverable && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="banner banner-warning small">{inspiration.failureMessage ?? "This save needs attention."}</div>
          <label>
            Add details
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Type the place names or paste the caption"
            />
          </label>
          <div className="row">
            <button
              className="btn btn-primary btn-small"
              disabled={busy || !details.trim()}
              onClick={() => act(() => api("inspirations.addDetails", { params, body: { text: details } }))}
            >
              Add details and retry
            </button>
            <button className="btn btn-small" disabled={busy} onClick={() => act(() => api("inspirations.retry", { params }))}>
              Retry
            </button>
            <button className="btn btn-small" disabled={busy} onClick={() => act(() => api("inspirations.skip", { params }))}>
              Skip
            </button>
          </div>
        </div>
      )}
      <ErrorBanner error={error} />
    </article>
  );
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
