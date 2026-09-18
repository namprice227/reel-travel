"use client";

import type { CandidatePlace, PlaceStatus } from "@reel/contracts";
import Link from "next/link";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { placeStatus } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";
import { PlaceCard } from "./PlaceCard";

// F2 place confirmation (UI: Member 1, task FE04). Endpoints: places.list, places.confirm, places.reject.

const SECTIONS: Array<{ status: PlaceStatus; title: string; hint: string }> = [
  { status: "unverified", title: "Extracted places", hint: "Verify a location to find matches, then confirm the right place before planning." },
  { status: "ambiguous", title: "Choose the right branch", hint: "Several real places match. Pick the one from your save." },
  { status: "pending", title: "Confirm matches", hint: "One match found. Check it's the place you meant." },
  { status: "not_found", title: "No match found", hint: "Add details to the save in the Inbox, or reject it." },
  { status: "confirmed", title: "Confirmed", hint: "Used for planning." },
  { status: "rejected", title: "Rejected", hint: "Ignored for planning. Evidence is kept." },
];

const MARKER_COLORS: Partial<Record<PlaceStatus, string>> = {
  confirmed: "#15803d",
  pending: "#b45309",
  ambiguous: "#7c3aed",
};

export function PlacesPage({ tripId }: { tripId: string }) {
  const places = useApi("places.list", { params: { tripId } }, {
    pollMs: data => data.verificationJobs?.some(j => j.status === "queued" || j.status === "running") ? 3000 : false,
  });
  const { busy, error, run } = useSubmit();
  const all = places.data?.places ?? [];
  const pending = all.filter((p) => p.status === "pending");

  const act = (action: () => Promise<unknown>) =>
    void run(async () => {
      try {
        await action();
      } finally {
        await places.reload();
      }
    });

  const confirm = (place: CandidatePlace, providerPlaceId: string) =>
    act(() => api("places.confirm", { params: { tripId, placeId: place.id }, body: { providerPlaceId } }));

  const confirmAllSingle = () =>
    act(async () => {
      for (const place of pending) {
        try {
          await api("places.confirm", {
            params: { tripId, placeId: place.id },
            body: { providerPlaceId: place.options[0]!.providerPlaceId },
          });
        } catch (e) {
          // An earlier confirmation may have merged this place away.
          if (!(e instanceof ApiError && e.code === "NOT_FOUND")) throw e;
        }
      }
    });

  const markers: MapMarker[] = all.flatMap((place) => {
    if (place.status === "rejected" || place.status === "not_found") return [];
    return (place.selected ? [place.selected] : place.options).map((option) => ({
      id: `${place.id}:${option.providerPlaceId}`,
      position: option.location,
      label: option.name,
      provider: option.details.provider,
      attribution: option.details.attribution,
      color: MARKER_COLORS[place.status],
      popup: (
        <p className="small">
          {placeStatus[place.status].label} · {place.evidence.length} source{place.evidence.length === 1 ? "" : "s"}
        </p>
      ),
    }));
  });

  if (places.loading && !places.data) return <Loading />;

  return (
    <div className="fit-page places-page">
      <header className="page-head">
        <div className="page-head-titles">
          <h1>Review places</h1>
          <p>Review extracted names and source evidence. Places with verified options can be confirmed for your trip.</p>
        </div>
      </header>
      <div className="places-body fit-fill panel-scroll">
      <ErrorBanner error={places.error ?? error} />
      {all.length === 0 ? (
        <Empty title="No places yet">
          Add inspiration in your <Link href={`/inspiration-library?trip=${tripId}`}>Inspiration library</Link>. Places appear here once they&apos;re found.
        </Empty>
      ) : (
        <>
          <div className="card">
            <PlaceMap markers={markers} />
          </div>
          {pending.length > 0 && (
            <div className="row">
              <button className="btn" disabled={busy} onClick={confirmAllSingle}>
                Confirm all single matches ({pending.length})
              </button>
            </div>
          )}
          {SECTIONS.map((section) => {
            const items = all.filter((p) => p.status === section.status);
            if (items.length === 0) return null;
            return (
              <section key={section.status} className="stack">
                <div>
                  <h2>
                    {section.title} <Badge>{items.length}</Badge>
                  </h2>
                  <p className="muted small">{section.hint}</p>
                </div>
                <div className="grid">
                  {items.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      busy={busy}
                      onConfirm={(providerPlaceId) => confirm(place, providerPlaceId)}
                      onReject={() => act(() => api("places.reject", { params: { tripId, placeId: place.id } }))}
                      onVerify={() => act(() => api("places.verify", { params: { tripId, placeId: place.id } }))}
                      verificationJob={places.data?.verificationJobs?.find(j => j.targetId === place.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
      </div>
    </div>
  );
}
