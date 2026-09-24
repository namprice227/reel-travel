"use client";

import type { Conflict, ItineraryEdit, PublicStop } from "@reel/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { daysBetween, todayIso } from "@/lib/trip-dates";
import { DayView, type EditHandlers } from "./DayView";
import { MapEmpty } from "./MapEmpty";
import { placeInfoFromCandidates } from "./place-info";
import { RouteMap } from "./RouteMap";
import { TripBuilder } from "@/features/trips/TripBuilder";

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
  const allPlaces = useApi("places.list", { params });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [showStaleNotice, setShowStaleNotice] = useState(false);
  const regenerateDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const reviewRegeneration = () => regenerateDialog.current?.showModal();
  const [undo, setUndo] = useState<{ message: string; edit: ItineraryEdit } | null>(null);
  const [preview, setPreview] = useState<{ edit: ItineraryEdit; itinerary: NonNullable<typeof current>; title: string } | null>(null);
  const current = itinerary.data?.itinerary ?? null;

  useEffect(() => {
    if (!itinerary.data?.stale || !current) {
      setShowStaleNotice(false);
      return;
    }
    setShowStaleNotice(true);
    const timer = window.setTimeout(() => setShowStaleNotice(false), 6000);
    return () => window.clearTimeout(timer);
  }, [itinerary.data?.stale, current?.version]);

  /** Runs one save; resolves true when it succeeded (errors are shown next to the day). */
  async function mutate(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
      setSaved(true);
      return true;
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e));
      setError(apiError);
      if (apiError.code === "STALE_VERSION") { setUndo(null); await itinerary.reload(); }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    mutate(async () => {
      const result = await api("itinerary.generate", { params, body: { expectedVersion: current?.version ?? null } });
      itinerary.setData({ itinerary: result.itinerary, stale: false });
      setUndo(null);
      await allPlaces.reload();
    });

  const applyEdit = (change: ItineraryEdit, undoable?: { message: string; edit: ItineraryEdit }) =>
    mutate(async () => {
      if (!current) return;
      const result = await api("itinerary.edit", { params, body: { expectedVersion: current.version, edit: change } });
      itinerary.setData({ itinerary: result.itinerary, stale: itinerary.data?.stale ?? false });
      setUndo(undoable ?? null);
    });

  const previewReplace = async (stop: PublicStop, placeId: string) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const edit: ItineraryEdit = { type: "replace_stop", stopId: stop.id, placeId };
      const result = await api("itinerary.edit", { params, body: { expectedVersion: current.version, edit, dryRun: true } });
      if (result.saved) throw new Error("Preview was unexpectedly saved.");
      setPreview({ edit, itinerary: result.itinerary, title: stop.title });
      previewDialog.current?.showModal();
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e));
      setError(apiError);
      if (apiError.code === "STALE_VERSION") await itinerary.reload();
    } finally {
      setBusy(false);
    }
  };

  if (itinerary.error) return <ErrorBanner error={itinerary.error} />;
  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (allPlaces.error) return <div className="stack"><ErrorBanner error={allPlaces.error} /><button className="btn" onClick={() => void allPlaces.reload()}>Retry loading places</button></div>;
  if (!itinerary.data || !trip.data || !allPlaces.data) return <Loading />;

  const t = trip.data.trip;
  const dayCount = current?.days.length ?? 0;
  const today = todayIso(new Date(), t.timezone ?? undefined);
  const defaultDay = t.startDate && t.endDate && today >= t.startDate && today <= t.endDate ? daysBetween(t.startDate, today) + 1 : 1;
  const requested = day ? Number.parseInt(day, 10) : defaultDay;
  const dayIndex = Number.isFinite(requested) ? Math.min(Math.max(requested - 1, 0), Math.max(dayCount - 1, 0)) : 0;
  const go = (index: number, editing = edit) => router.replace(`${pathname}?day=${index + 1}${editing ? "&edit=1" : ""}`, { scroll: false });
  const chosenOptions = new Map(current?.resolvedPlaces?.map((item) => [item.placeId, item.providerPlaceId]) ?? []);
  const displayCandidates = allPlaces.data.places.map((place) => {
    const providerPlaceId = chosenOptions.get(place.id);
    const routeOption = place.options.find((option) => option.providerPlaceId === providerPlaceId);
    return routeOption ? { ...place, selected: routeOption } : place;
  });
  const places = placeInfoFromCandidates(displayCandidates);
  const byId = new Map(displayCandidates.map((place) => [place.id, place]));
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
    replace: (stop, placeId) => void previewReplace(stop, placeId),
    setTime: (stopId, durationMinutes, notBefore) => {
      const stop = current?.days.flatMap((d) => d.stops).find((s) => s.id === stopId);
      const previous = stop ? { durationMinutes: stop.plannedDurationMinutes ?? null, notBefore: stop.notBefore ?? null } : null;
      return applyEdit({ type: "set_stop_time", stopId, durationMinutes, notBefore }, stop && previous?.durationMinutes ? {
        message: `${stop.title} retimed.`, edit: { type: "set_stop_time", stopId, durationMinutes: previous.durationMinutes, notBefore: previous.notBefore },
      } : undefined);
    },
    addPlace: ({ source, providerPlaceId, at }) => mutate(async () => {
      if (!current) return;
      const result = await api("itinerary.addPlace", { params, body: { expectedVersion: current.version, source, at, ...(providerPlaceId ? { providerPlaceId } : {}) } });
      itinerary.setData({ itinerary: result.itinerary, stale: itinerary.data?.stale ?? false });
      const added = result.itinerary.days.flatMap((d) => d.stops).find((s) => s.placeId === result.place.id);
      setUndo(added && at.type === "day" ? { message: `${added.title} added.`, edit: { type: "remove_stop", stopId: added.id } } : null);
      // Copies and branch choices change the trip's places.
      await allPlaces.reload();
    }),
  };

  return (
    <div className="fit-page itinerary-page">
      {showStaleNotice && itinerary.data.stale && current && (
        <div className="itin-update-toast" role="status" aria-live="polite">
          <Icon name="alert" size={18} />
          <span><strong>Planning inputs changed.</strong> Your saved schedule is unchanged.</span>
          <button className="icon-btn" type="button" aria-label="Dismiss planning update" onClick={() => setShowStaleNotice(false)}><Icon name="close" size={15} /></button>
        </div>
      )}
      {(!current || view === "map") && feedback}
      {current && ((current.unresolvedPlaceIds?.length ?? 0) > 0 || (current.duplicatePlaceIds?.length ?? 0) > 0) && (
        <div className="banner banner-warning small" role="status">
          {(current.unresolvedPlaceIds?.length ?? 0) > 0 && <span>{current.unresolvedPlaceIds!.length} selected {current.unresolvedPlaceIds!.length === 1 ? "place has" : "places have"} no location and could not be routed. </span>}
          {(current.duplicatePlaceIds?.length ?? 0) > 0 && <span>{current.duplicatePlaceIds!.length} duplicate {current.duplicatePlaceIds!.length === 1 ? "reference was" : "references were"} shown once. </span>}
          <a href={`/my-trip/${tripId}/places`}>See selected places</a>
        </div>
      )}

      {!current ? (
        // Both views land here before an itinerary exists, but they need different answers:
        // the itinerary tab lists the four steps, the map says why there is no map.
        view === "map" ? (
          <MapEmpty trip={t} places={allPlaces.data?.places ?? []} busy={busy} onGenerate={generate} />
        ) : (
          <TripBuilder trip={t} busy={busy} onGenerate={generate} onTripSaved={(updated) => trip.setData({ trip: updated })} />
        )
      ) : view === "map" ? (
        <RouteMap itinerary={current} places={places} dayIndex={dayIndex} onSelectDay={(i) => go(i)} tripId={tripId} transport={t.preferences.transport} />
      ) : (
        <>
          <DayView
            trip={t}
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
            onRegenerate={reviewRegeneration}
            regenerationRecommended={itinerary.data.stale}
            feedback={feedback}
            onUndo={undo ? () => { void applyEdit(undo.edit); } : undefined}
            saveStatus={busy ? "Saving…" : error ? "Edit not saved" : saved ? "Saved" : undefined}
          />
        </>
      )}

      <dialog ref={regenerateDialog} className="regenerate-dialog" aria-labelledby="regenerate-title" aria-describedby="regenerate-description">
        <span className="itin-update-icon"><Icon name="sparkle" size={24} /></span>
        <h2 id="regenerate-title">Make room for your latest plans</h2>
        <p id="regenerate-description">Regenerating rebuilds every day using your current places and trip details. Manual stop order and schedule edits will be replaced. Fixed booking times stay locked.</p>
        <div className="regenerate-actions">
          <button className="btn" autoFocus onClick={() => regenerateDialog.current?.close()}>Keep current schedule</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => { regenerateDialog.current?.close(); void generate(); }}>Regenerate itinerary</button>
        </div>
      </dialog>

      <dialog ref={previewDialog} className="regenerate-dialog edit-preview-dialog" aria-labelledby="edit-preview-title" onClose={() => setPreview(null)}>
        <span className="itin-update-icon"><Icon name="edit" size={24} /></span>
        <p className="kicker">Preview · not saved</p>
        <h2 id="edit-preview-title">Replace {preview?.title}</h2>
        {preview && (
          <>
            <p>The checked preview is <strong>{preview.itinerary.validationStatus.replaceAll("_", " ")}</strong> with {preview.itinerary.conflicts.length} {preview.itinerary.conflicts.length === 1 ? "reported conflict" : "reported conflicts"}. Review the result before applying it.</p>
            <ul className="preview-days">
              {preview.itinerary.days.map((previewDay, index) => <li key={previewDay.date}><strong>Day {index + 1}</strong><span>{previewDay.stops.map((stop) => stop.title).join(" · ") || "No stops"}</span></li>)}
            </ul>
          </>
        )}
        <div className="regenerate-actions">
          <button className="btn" autoFocus onClick={() => previewDialog.current?.close()}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !preview} onClick={() => {
            const editToApply = preview?.edit;
            previewDialog.current?.close();
            if (editToApply) void applyEdit(editToApply);
          }}>Apply replacement</button>
        </div>
      </dialog>

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
