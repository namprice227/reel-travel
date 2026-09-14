"use client";

import { useState } from "react";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";

// F6 sharing (UI: Member 1, server: Member 4). Endpoints: shares.list, shares.create, shares.revoke.

export function SharePage({ tripId }: { tripId: string }) {
  const shares = useApi("shares.list", { params: { tripId } });
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();

  const create = () =>
    void run(async () => {
      const { url } = await api("shares.create", { params: { tripId } });
      setCreatedUrl(url);
      await shares.reload();
    });

  const revoke = (shareId: string) =>
    void run(async () => {
      await api("shares.revoke", { params: { tripId, shareId } });
      await shares.reload();
    });

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h2>Viewing links</h2>
          <p className="muted small">
            Anyone with a link can view the current itinerary. They can&apos;t edit it or see your saves and screenshots.
            Revoking works immediately.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={create}>
            Create viewing link
          </button>
        </div>
        {createdUrl && (
          <div className="banner banner-info stack" style={{ gap: 6 }}>
            <span className="small">Copy this link now. It won&apos;t be shown again.</span>
            <div className="row">
              <code style={{ wordBreak: "break-all" }}>{createdUrl}</code>
              <button className="btn btn-small" onClick={() => void navigator.clipboard.writeText(createdUrl)}>
                Copy
              </button>
              <a href={createdUrl} target="_blank" rel="noopener noreferrer" className="small">
                Open
              </a>
            </div>
          </div>
        )}
        <ErrorBanner error={shares.error ?? error} />
      </section>

      {shares.loading && !shares.data ? (
        <Loading />
      ) : shares.data?.shares.length === 0 ? (
        <Empty title="No links yet" />
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
          {shares.data?.shares.map((share) => (
            <li key={share.id} className="card row between">
              <div className="row">
                {share.revokedAt ? <Badge>Revoked</Badge> : <Badge tone="success">Active</Badge>}
                <span className="small">Created {formatTimestamp(share.createdAt)}</span>
                {share.lastViewedAt && <span className="small muted">Last viewed {formatTimestamp(share.lastViewedAt)}</span>}
              </div>
              {!share.revokedAt && (
                <button className="btn btn-danger btn-small" disabled={busy} onClick={() => revoke(share.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
