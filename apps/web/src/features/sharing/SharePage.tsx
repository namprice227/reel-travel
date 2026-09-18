"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt, StopArt } from "@/components/Illustration";
import { ErrorBanner, Loading } from "@/components/ui";
import { infoFor, placeInfoFromCandidates } from "@/features/itinerary/place-info";
import { api } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import { tripDays } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";

// F6 sharing at /my-trip/:tripId/share (UI: Member 2, server: Member 4). Endpoints: shares.list, shares.create, shares.revoke.
// Arrangement follows the "theme" reference and fits one laptop screen. The token URL is only returned at creation,
// so it is shown once.

const dayPart = (time: string) => (time < "12:00" ? "Morning" : time < "17:00" ? "Afternoon" : "Evening");

export function SharePage({ tripId }: { tripId: string }) {
  const params = { tripId };
  const shares = useApi("shares.list", { params });
  const trip = useApi("trips.get", { params });
  const itinerary = useApi("itinerary.get", { params });
  const confirmed = useApi("places.list", { params, query: { status: "confirmed" } });
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const { busy, error, run } = useSubmit();

  const create = () =>
    void run(async () => {
      const { url } = await api("shares.create", { params });
      setCreatedUrl(url);
      setCopied(false);
      await shares.reload();
    });

  const revoke = (shareId: string) =>
    void run(async () => {
      await api("shares.revoke", { params: { tripId, shareId } });
      await shares.reload();
    });

  const copy = async () => {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
  };

  const ordered = [...(shares.data?.shares ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const stale = itinerary.data?.stale ?? false;
  const plan = stale ? null : itinerary.data?.itinerary ?? null;
  const t = trip.data?.trip;
  const day = plan?.days[dayIndex];
  const places = placeInfoFromCandidates(confirmed.data?.places ?? []);

  return (
    <div className="fit-page share-page">
      <header className="page-head">
        <div className="page-head-titles">
          <h1>Share the trip, keep your saves private</h1>
          <p>Anyone with a viewing link can read the itinerary. Only you can edit it.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" disabled={busy} onClick={create}><Icon name="link" size={18} /> Create viewing link</button>
        </div>
      </header>

      <div className="share-layout fit-fill">
        <div className="share-main panel-scroll">
          <section className="card stack" style={{ gap: 12 }} aria-labelledby="your-link-title">
            <h2 id="your-link-title" className="card-title">Your viewing link</h2>
            <div className="link-panel">
              {createdUrl ? (
                <>
                  <strong>New link</strong>
                  <div className="link-row">
                    <input id="share-link" readOnly value={createdUrl} aria-label="Viewing link" onFocus={(e) => e.target.select()} />
                    <button className="btn btn-primary" onClick={() => void copy()}><Icon name="copy" size={18} /> {copied ? "Copied" : "Copy link"}</button>
                    <a className="btn btn-outline" href={createdUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={18} /> Open</a>
                  </div>
                  <p className="link-panel-note small"><Icon name="info" size={18} /> Copy this link now. It is only shown when created.</p>
                </>
              ) : (
                <p className="link-panel-note"><Icon name="info" size={18} /> Create a link to share a read-only view. For privacy, each link is shown only once, right after you create it.</p>
              )}
            </div>
            <ErrorBanner error={error} />
          </section>

          <section className="card" aria-labelledby="links-title">
            <h2 id="links-title" className="card-title" style={{ marginBottom: 8 }}>Viewing links</h2>
            <ErrorBanner error={shares.error} />
            {shares.loading && !shares.data ? (
              <Loading />
            ) : ordered.length === 0 ? (
              <p className="muted">No links yet.</p>
            ) : (
              <div className="links-table-wrap">
                <table className="links-table">
                  <thead>
                    <tr><th>Name</th><th>Status</th><th>Created</th><th>Last viewed</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {ordered.map((share, i) => (
                      <tr key={share.id}>
                        <td>Link {i + 1}</td>
                        <td>
                          {share.revokedAt
                            ? <span className="link-status is-revoked"><span className="status-dot" />Revoked</span>
                            : <span className="link-status is-active"><span className="status-dot is-success" />Active</span>}
                        </td>
                        <td>{formatTimestamp(share.createdAt)}</td>
                        <td className="muted">{share.lastViewedAt ? formatTimestamp(share.lastViewedAt) : "—"}</td>
                        <td>
                          {share.revokedAt ? "—" : <button className="btn btn-outline btn-small" disabled={busy} onClick={() => revoke(share.id)}>Revoke</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card privacy-card">
            <span className="privacy-icon"><Icon name="lock" /></span>
            <p>
              <strong>Saved sources, private uploads and your notes are not included.</strong>
              <br />
              <span className="muted small">Only the itinerary is shared through the viewing link. Revoking works immediately.</span>
            </p>
          </section>
        </div>

        <aside className="card share-preview panel-scroll" aria-label="Preview of the shared view">
          <div className="share-preview-head">
            <strong>Your trip · View only</strong>
            {plan && <span className="muted">Version {plan.version}</span>}
          </div>
          <div className="share-preview-cover">
            <CoverArt seed={t?.destination ?? tripId} showLabel={false} />
            {t && (
              <div className="share-preview-copy">
                <h2>{t.destination}</h2>
                <p>{tripDays(t.startDate, t.endDate)} days · {t.title}</p>
              </div>
            )}
          </div>
          <div className="share-preview-body">
            {!plan ? (
              <p className="muted" style={{ paddingTop: 12 }}>{stale ? "Viewers cannot see the outdated plan. Regenerate to update this link." : "Generate an itinerary to preview what viewers will see."} <Link href={`/my-trip/${tripId}/timeline`}>Go to Timeline</Link></p>
            ) : (
              <>
                <div className="tabs" role="tablist" aria-label="Preview days">
                  {plan.days.slice(0, 4).map((d, i) => (
                    <button key={d.date} role="tab" aria-selected={i === dayIndex} className={i === dayIndex ? "active" : undefined} onClick={() => setDayIndex(i)}>Day {i + 1}</button>
                  ))}
                </div>
                <ul className="preview-stops">
                  {(day?.stops ?? []).filter((s) => s.kind !== "break").slice(0, 3).map((stop) => (
                    <li key={stop.id}>
                      <StopArt category={infoFor(stop, places)?.category} kind={stop.kind} size="sm" />
                      <span className="preview-ring" aria-hidden="true" />
                      <span>
                        <small>{dayPart(stop.start)}</small>
                        <strong>{stop.title}</strong>
                        <small>{stop.start} – {stop.end}{stop.kind === "reservation" ? " · Fixed booking" : ""}</small>
                      </span>
                    </li>
                  ))}
                  {day && day.stops.length === 0 && <li className="muted">Free day.</li>}
                </ul>
              </>
            )}
            <div className="callout callout-neutral">
              <Icon name="map" />
              <p className="small">This is a read-only view of your trip. Use the link to share it with anyone.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
