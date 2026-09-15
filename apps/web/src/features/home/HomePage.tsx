"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { AddInspirationForm } from "@/features/inbox/AddInspirationForm";
import { formatRange } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export function HomePage() {
  const trips = useApi("trips.list", {});
  const [saved, setSaved] = useState(false);
  const activeTrip = trips.data?.trips[0];

  return (
    <div className="home-page stack">
      <section className="page-heading row between">
        <div>
          <p className="kicker">Home</p>
          <h1>Plan your next trip.</h1>
          <p className="muted">Continue a plan or save a new idea.</p>
        </div>
        <Link className="btn btn-primary btn-large" href="/trips#new-trip">Create a trip</Link>
      </section>

      <ErrorBanner error={trips.error} />
      {trips.loading && !trips.data ? <Loading /> : (
        <div className="home-grid">
          <section className="card continue-card">
            <p className="kicker">Continue planning</p>
            {activeTrip ? (
              <>
                <div className="continue-visual" aria-hidden="true"><span>Tokyo</span></div>
                <div className="continue-copy">
                  <h2>{activeTrip.title}</h2>
                  <p className="muted">{activeTrip.destination} · {formatRange(activeTrip.startDate, activeTrip.endDate)}</p>
                  <div className="row">
                    <Link className="btn btn-primary" href={`/trips/${activeTrip.id}/itinerary`}>Open itinerary</Link>
                    <Link className="btn" href={`/trips/${activeTrip.id}/setup`}>Trip details</Link>
                  </div>
                </div>
              </>
            ) : (
              <Empty title="No trips yet">Create a trip to start planning.</Empty>
            )}
          </section>

          <section className="card quick-save-card">
            <div>
              <p className="kicker">Quick save</p>
              <h2>Add inspiration</h2>
              <p className="muted small">Reel, link, note, or screenshot.</p>
            </div>
            {activeTrip ? (
              <>
                <p className="save-destination small">Saving to <strong>{activeTrip.title}</strong></p>
                <AddInspirationForm compact tripId={activeTrip.id} onSaved={() => setSaved(true)} />
                {saved && <p className="save-success" role="status">Saved. We’ll look for places next.</p>}
                <Link className="small" href={`/trips/${activeTrip.id}/inbox`}>View saved inspiration →</Link>
              </>
            ) : (
              <p className="muted">Create a trip before saving inspiration.</p>
            )}
          </section>
        </div>
      )}

      <section className="home-shortcuts">
        <Link href="/trips" className="shortcut-card"><span>01</span><strong>My trips</strong><small>All plans</small></Link>
        {activeTrip && <Link href={`/trips/${activeTrip.id}/inbox`} className="shortcut-card"><span>02</span><strong>Saved inspiration</strong><small>Ideas and sources</small></Link>}
        {activeTrip && <Link href={`/trips/${activeTrip.id}/places`} className="shortcut-card"><span>03</span><strong>Confirm places</strong><small>Review matches</small></Link>}
      </section>
    </div>
  );
}

