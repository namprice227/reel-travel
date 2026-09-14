"use client";

import type { Conflict, ItineraryEdit } from "@reel/contracts";
import { useState } from "react";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { MagazineView } from "@/features/magazine/MagazineView";
import { api, ApiError } from "@/lib/api-client";
import { formatDay, validationStatus } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { ConflictList } from "./ConflictList";
import { ItineraryMap } from "./ItineraryMap";
import { TimelineView } from "./TimelineView";

// F4 generate/edit + F5 three views (UI: Member 1, server: Member 3).
// All three views receive the SAME itinerary object from itinerary.get, so they always show one version.

const VIEWS = ["timeline", "map", "magazine"] as const;
type View = (typeof VIEWS)[number];

export function ItineraryPage({ tripId }: { tripId: string }) {
  const params = { tripId };
  const itinerary = useApi("itinerary.get", { params });
  const trip = useApi("trips.get", { params });
  const confirmed = useApi("places.list", { params, query: { status: "confirmed" } });
  const [view, setView] = useState<View>("timeline");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const current = itinerary.data?.itinerary ?? null;

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e));
      setError(apiError);
      if (apiError.code === "STALE_VERSION") await itinerary.reload();
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    mutate(async () => {
      const result = await api("itinerary.generate", { params, body: { expectedVersion: current?.version ?? null } });
      itinerary.setData({ itinerary: result.itinerary, stale: false });
    });

  const edit = (change: ItineraryEdit) =>
    mutate(async () => {
      if (!current) return;
      const result = await api("itinerary.edit", { params, body: { expectedVersion: current.version, edit: change } });
      itinerary.setData({ itinerary: result.itinerary, stale: itinerary.data?.stale ?? false });
    });

  if (itinerary.error) return <ErrorBanner error={itinerary.error} />;
  if (!itinerary.data) return <Loading />;

  const rejected = error?.code === "EDIT_REJECTED" ? ((error.details as { conflicts?: Conflict[] } | undefined)?.conflicts ?? []) : [];
  const placeNames = new Map((confirmed.data?.places ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          {current ? (
            <>
              <Badge tone="info">Version {current.version}</Badge>
              <Badge tone={validationStatus[current.validationStatus].tone}>
                {validationStatus[current.validationStatus].label}
              </Badge>
              <span className="muted small">Last change: {current.change}</span>
            </>
          ) : (
            <span className="muted">No itinerary yet.</span>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={generate}>
          {current ? "Regenerate" : "Generate itinerary"}
        </button>
      </div>

      {itinerary.data.stale && (
        <div className="banner banner-warning">
          Places, bookings, dates or preferences changed since this version was generated. Regenerate to include them.
        </div>
      )}
      {error && error.code !== "EDIT_REJECTED" && <ErrorBanner error={error} />}
      {rejected.length > 0 && (
        <div className="banner banner-danger stack" style={{ gap: 4 }}>
          <strong>Edit not saved</strong>
          {rejected.map((conflict, i) => (
            <span key={i}>
              {conflict.message} {conflict.suggestion}
            </span>
          ))}
        </div>
      )}

      {!current ? (
        <Empty title="Nothing planned yet">Confirm places (and add bookings) first, then generate.</Empty>
      ) : (
        <>
          <ConflictList conflicts={current.conflicts} />
          <div className="tabs">
            {VIEWS.map((v) => (
              <button key={v} className={view === v ? "active" : undefined} onClick={() => setView(v)}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {view === "timeline" && (
            <TimelineView
              itinerary={current}
              busy={busy}
              onEdit={{
                move: (stopId, toDate, toIndex) => void edit({ type: "move_stop", stopId, toDate, toIndex }),
                remove: (stopId) => void edit({ type: "remove_stop", stopId }),
              }}
            />
          )}
          {view === "map" && <ItineraryMap itinerary={current} />}
          {view === "magazine" && trip.data && <MagazineView trip={trip.data.trip} itinerary={current} />}

          {current.unscheduledPlaceIds.length > 0 && (
            <UnscheduledPlaces
              placeIds={current.unscheduledPlaceIds}
              names={placeNames}
              dates={current.days.map((d) => d.date)}
              busy={busy}
              onAdd={(placeId, date) => void edit({ type: "add_place", placeId, date, index: Number.MAX_SAFE_INTEGER })}
            />
          )}
          {view !== "magazine" && <p className="muted small">{current.assumptions.join(" ")}</p>}
        </>
      )}
    </div>
  );
}

function UnscheduledPlaces({
  placeIds,
  names,
  dates,
  busy,
  onAdd,
}: {
  placeIds: string[];
  names: Map<string, string>;
  dates: string[];
  busy: boolean;
  onAdd: (placeId: string, date: string) => void;
}) {
  const [date, setDate] = useState(dates[0] ?? "");
  return (
    <section className="card stack">
      <div>
        <h3>Not scheduled</h3>
        <p className="muted small">Confirmed places that didn&apos;t fit. Add one to the end of a day.</p>
      </div>
      <label className="inline small">
        Day
        <select value={date} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d, i) => (
            <option key={d} value={d}>
              Day {i + 1} · {formatDay(d)}
            </option>
          ))}
        </select>
      </label>
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}>
        {placeIds.map((id) => (
          <li key={id} className="row between">
            <span>{names.get(id) ?? id}</span>
            <button className="btn btn-small" disabled={busy} onClick={() => onAdd(id, date)}>
              Add to day
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
