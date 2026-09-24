"use client";

import type { CandidatePlace, Job, Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { PlaceImage } from "@/components/PlacePhoto";
import { Badge, ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

export function ChoosePlacesStep({ trip, places, verificationJobs = [], onTripSaved, onPlacesChanged, onDraftChange, onNext }: {
  trip: Trip;
  places: CandidatePlace[];
  verificationJobs?: Job[];
  onTripSaved: (trip: Trip) => void;
  onPlacesChanged: () => Promise<void>;
  onDraftChange?: (placeIds: string[]) => void;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(trip.selectedPlaceIds ?? places.filter((place) => place.status === "confirmed").map((place) => place.id));
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const active = places.filter((place) => place.status !== "rejected");
  const picked = chosen.filter((id) => active.some((place) => place.id === id));
  const withoutLocation = active.filter((place) => picked.includes(place.id) && !place.selected && place.options.length === 0);

  function choose(next: string[]) {
    setChosen(next);
    onDraftChange?.(next);
  }

  async function continuePlanning() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { trip: updated } = await api("places.select", {
        params: { tripId: trip.id },
        body: { placeIds: picked, expectedUpdatedAt: trip.updatedAt },
      });
      onTripSaved(updated);
      onNext();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function findLocation(placeId: string) {
    if (verifying) return;
    setVerifying(placeId);
    setError(null);
    try {
      await api("places.verify", { params: { tripId: trip.id, placeId } });
      await onPlacesChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setVerifying(null);
    }
  }

  return (
    <section className="builder-step-body" aria-labelledby="builder-choose-title">
      <header className="builder-head">
        <h1 id="builder-choose-title">Choose places to visit</h1>
        <p>Tick anything you want in your trip. We’ll choose a location and arrange the route when you build the days.</p>
      </header>
      <ErrorBanner error={error} />
      {active.length ? (
        <>
          <div className="builder-choose-tools">
            <strong>{picked.length} of {active.length} selected</strong>
            <button type="button" className="btn btn-small" onClick={() => choose(picked.length === active.length ? [] : active.map((place) => place.id))}>
              {picked.length === active.length ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="builder-choose-list">
            {active.map((place) => {
              const checked = picked.includes(place.id);
              const preview = place.selected ?? (place.options.length === 1 ? place.options[0] : null);
              const category = preview?.details.category ?? place.evidence.find((item) => item.classification?.category)?.classification?.category?.value ?? "Place";
              const area = place.evidence.find((item) => item.hint)?.hint ?? preview?.address ?? "Area unknown";
              const excerpt = place.evidence.find((item) => item.excerpt)?.excerpt;
              const activeLookup = verificationJobs.some((job) => job.targetId === place.id && (job.status === "queued" || job.status === "running"));
              return (
                <li key={place.id} className={`builder-choose-card${checked ? " is-on" : ""}`}>
                  <label className="builder-choose-label">
                    <input type="checkbox" checked={checked} onChange={() => choose(checked ? chosen.filter((id) => id !== place.id) : [...chosen, place.id])} />
                    {preview?.details.provider === "google" ? (
                      <PlaceImage google={{ tripId: trip.id, placeId: place.id, providerPlaceId: preview.providerPlaceId }} category={category} alt={preview.name} className="builder-choose-art" size="md" />
                    ) : <CoverArt seed={place.name} className="builder-choose-art" showLabel={false} />}
                    <span className="builder-choose-copy">
                      <strong>{place.name}</strong>
                      <small>{category} · {area}</small>
                      {excerpt && <em>“{excerpt}”</em>}
                    </span>
                    <span className="builder-choose-mark" aria-hidden="true"><Icon name={checked ? "checkCircle" : "plus"} size={22} /></span>
                  </label>
                  <div className="builder-choose-foot">
                    <span>{activeLookup ? "Finding location…" : place.status === "not_found" ? "No location found; add detail to the original save" : place.options.length === 0 && !place.selected ? "Location not looked up yet" : "Location chosen automatically for the route"}</span>
                    {place.status === "unverified" && <button type="button" className="btn btn-small" disabled={verifying === place.id || activeLookup} onClick={() => void findLocation(place.id)}>{verifying === place.id || activeLookup ? "Finding…" : "Find location"}</button>}
                    <Link href={`/my-trip/${trip.id}/place/${place.id}`}>Details</Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {withoutLocation.length > 0 && <p className="small muted" role="status">{withoutLocation.length} selected {withoutLocation.length === 1 ? "place has" : "places have"} no location yet. They’ll stay selected and appear as unresolved after planning.</p>}
          <div className="builder-confirm-actions">
            <button type="button" className="btn btn-primary btn-large" disabled={busy} onClick={() => void continuePlanning()}>
              {busy ? "Saving…" : picked.length ? `Continue with ${picked.length} ${picked.length === 1 ? "place" : "places"}` : "Save no places"} <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </>
      ) : (
        <div className="builder-progress">
          <Badge tone="neutral">No places yet</Badge>
          <p>Add a place or save first. It will appear here for selection.</p>
        </div>
      )}
    </section>
  );
}
