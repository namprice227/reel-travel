"use client";

import type { Conflict, ItineraryEdit, PublicStop } from "@reel/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { daysBetween, todayIso } from "@/lib/trip-dates";
import { DayView, type EditHandlers } from "./DayView";
import { placeInfoFromCandidates } from "./place-info";
import { RouteMap } from "./RouteMap";
import { TripChecklist } from "./TripChecklist";

// F4/F5 for the trip owner. Routes: /my-trip/:tripId/itinerary and /map; `?day=N` keeps the day across both,
// `?edit=1` turns the itinerary into edit mode (designs "Sky 3 · 06–09"). The trip header comes from the layout.
// Both views render the SAME saved itinerary version, so they can never disagree.

export type ItineraryViewName = "itinerary" | "map";

export function ItineraryPage({ tripId, view, day, edit }: { tripId: string; view: ItineraryViewName; day?: string; edit?: boolean }) {
  const params = { tripId };
  const router = useRouter();
  const pathname = usePathname();
  const itinerary = useApi("itinerary.get", { params });
  const trip = useApi("trips.get", { params });
  const confirmed = useApi("places.list", { params, query: { status: "confirmed" } });
  const allPlaces = useApi("places.list", { params });
  const saves = useApi("inspirations.list", { params });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<{ message: string; edit: ItineraryEdit } | null>(null);
  const current = itinerary.data?.itinerary ?? null;

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
      setSaved(true);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e));
      setError(apiError);
      if (apiError.code === "STALE_VERSION") { setUndo(null); await itinerary.reload(); }
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    mutate(async () => {
      const result = await api("itinerary.generate", { params, body: { expectedVersion: current?.version ?? null } });
      itinerary.setData({ itinerary: result.itinerary, stale: false });
      setUndo(null);
    });

  const applyEdit = (change: ItineraryEdit, undoable?: { message: string; edit: ItineraryEdit }) =>
    mutate(async () => {
      if (!current) return;
      const result = await api("itinerary.edit", { params, body: { expectedVersion: current.version, edit: change } });
      itinerary.setData({ itinerary: result.itinerary, stale: itinerary.data?.stale ?? false });
      setUndo(undoable ?? null);
    });

  if (itinerary.error) return <ErrorBanner error={itinerary.error} />;
  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (!itinerary.data || !trip.data) return <Loading />;

  const t = trip.data.trip;
  const dayCount = current?.days.length ?? 0;
  const today = todayIso(new Date(), t.timezone);
  const defaultDay = today >= t.startDate && today <= t.endDate ? daysBetween(t.startDate, today) + 1 : 1;
  const requested = day ? Number.parseInt(day, 10) : defaultDay;
  const dayIndex = Number.isFinite(requested) ? Math.min(Math.max(requested - 1, 0), Math.max(dayCount - 1, 0)) : 0;
  const go = (index: number, editing = edit) => router.replace(`${pathname}?day=${index + 1}${editing ? "&edit=1" : ""}`, { scroll: false });
  const places = placeInfoFromCandidates(confirmed.data?.places ?? []);
  const byId = new Map((confirmed.data?.places ?? []).map((p) => [p.id, p]));
  const rejected = error?.code === "EDIT_REJECTED" ? ((error.details as { conflicts?: Conflict[] } | undefined)?.conflicts ?? []) : [];
  const feedback = rejected.length > 0 ? (
    <div className="banner banner-danger stack" style={{ gap: 4 }} role="alert">
      <strong>Edit not saved</strong>
      {rejected.map((conflict, i) => <span key={i}>{conflict.message} {conflict.suggestion}</span>)}
    </div>
  ) : error ? <ErrorBanner error={error} /> : null;

  const editHandlers: EditHandlers = {
    move: (stopId, toDate, toIndex) => {
      const previousDay = current?.days.find((d) => d.stops.some((s) => s.id === stopId));
      const previousIndex = previousDay?.stops.findIndex((s) => s.id === stopId) ?? -1;
      void applyEdit({ type: "move_stop", stopId, toDate, toIndex }, previousDay && previousIndex >= 0 ? {
        message: "Stop moved.", edit: { type: "move_stop", stopId, toDate: previousDay.date, toIndex: previousIndex },
      } : undefined);
    },
    remove: (stop: PublicStop) => {
      const date = current?.days.find((d) => d.stops.some((s) => s.id === stop.id))?.date;
      const index = current?.days.find((d) => d.date === date)?.stops.findIndex((s) => s.id === stop.id) ?? 0;
      void applyEdit(
        { type: "remove_stop", stopId: stop.id },
        stop.placeId && date ? { message: `${stop.title} removed.`, edit: { type: "add_place", placeId: stop.placeId, date, index } } : undefined,
      );
    },
    add: (placeId, date) => void applyEdit({ type: "add_place", placeId, date, index: Number.MAX_SAFE_INTEGER }),
  };

  return (
    <div className="fit-page itinerary-page">
      {itinerary.data.stale && current && (
        <div className="banner banner-warning itin-banner-note">
          <span>Trip details or places changed. Regenerate to update this itinerary.</span>
          <button className="btn btn-small btn-outline" disabled={busy} onClick={generate}>Regenerate</button>
        </div>
      )}
      {(!current || view === "map") && feedback}

      {!current ? (
        <TripChecklist trip={t} saves={saves.data?.inspirations.length ?? 0} places={allPlaces.data?.places ?? []} busy={busy} onGenerate={generate} />
      ) : view === "map" ? (
        <RouteMap itinerary={current} places={places} dayIndex={dayIndex} onSelectDay={(i) => go(i)} tripId={tripId} transport={t.preferences.transport} />
      ) : (
        <>
          <DayView
            itinerary={current}
            places={places}
            placeDetails={byId}
            dayIndex={dayIndex}
            onSelectDay={(i) => go(i)}
            tripId={tripId}
            transport={t.preferences.transport}
            editing={edit}
            busy={busy}
            onEdit={editHandlers}
            onEditingChange={(editing) => go(dayIndex, editing)}
            onRegenerate={generate}
            feedback={feedback}
            onUndo={undo ? () => { void applyEdit(undo.edit); } : undefined}
            saveStatus={busy ? "Saving…" : error ? "Edit not saved" : saved ? "Saved" : undefined}
          />
        </>
      )}

      {undo && !edit && (
        <div className="undo-toast" role="status">
          {undo.message}
          <button className="btn btn-small" disabled={busy} onClick={() => { void applyEdit(undo.edit); }}>Undo</button>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setUndo(null)}><Icon name="close" size={16} /></button>
        </div>
      )}
    </div>
  );
}
