"use client";

import Link from "next/link";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import { AddInspirationForm } from "./AddInspirationForm";
import { InspirationCard } from "./InspirationCard";

// F1 import inbox (UI: Member 1, task A02). Endpoints: inspirations.* (see docs/features/F1-import.md).

export function InboxPage({ tripId }: { tripId: string }) {
  const saves = useApi(
    "inspirations.list",
    { params: { tripId } },
    { pollMs: (data) => (data.inspirations.some((i) => i.status === "queued" || i.status === "processing") ? 1500 : false) },
  );
  const items = saves.data?.inspirations ?? [];

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Add inspiration</h2>
        <AddInspirationForm tripId={tripId} onSaved={saves.reload} />
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Saves</h2>
          <Link href={`/trips/${tripId}/places`}>Review places →</Link>
        </div>
        <ErrorBanner error={saves.error} />
        {saves.loading && !saves.data ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty title="Nothing saved yet">Paste a caption, a link or a screenshot of somewhere you want to go.</Empty>
        ) : (
          items.map((inspiration) => (
            <InspirationCard key={inspiration.id} tripId={tripId} inspiration={inspiration} onChange={saves.reload} />
          ))
        )}
      </section>
    </div>
  );
}
