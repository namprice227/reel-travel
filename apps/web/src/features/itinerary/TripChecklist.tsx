"use client";

import type { CandidatePlace, Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { getGoogleMapsRouteUrl } from "@/lib/maps";

// What a trip still needs before it has an itinerary (design "Sky 3 · 05 Trip checklist").
// Every step is read from the trip's own data: saves, place statuses, the hotel, then generate.

type State = "done" | "now" | "todo";

export function TripChecklist({
  trip,
  saves,
  places,
  busy,
  onGenerate,
}: {
  trip: Trip;
  saves: number;
  places: CandidatePlace[];
  busy: boolean;
  onGenerate: () => void;
}) {
  const confirmed = places.filter((p) => p.status === "confirmed");
  const needsChoice = places.filter((p) => p.status === "pending" || p.status === "ambiguous" || p.status === "not_found");
  const hotel = trip.preferences.accommodation?.name;
  const base = `/my-trip/${trip.id}`;

  const steps: Array<{ state: State; title: string; sub: string; action?: React.ReactNode }> = [
    {
      state: saves > 0 ? "done" : "now",
      title: "Save places",
      sub: saves > 0 ? `${saves} ${saves === 1 ? "save" : "saves"} · ${places.length} places found` : "Paste a reel, link, text or screenshot and we'll find the places.",
      action: <Link className="btn btn-small" href={`/inspiration-library?trip=${trip.id}`}><Icon name="plus" size={16} /> Add a save</Link>,
    },
    {
      state: needsChoice.length === 0 ? (confirmed.length ? "done" : "todo") : "now",
      title: "Confirm places",
      sub: needsChoice.length
        ? `${confirmed.length} of ${places.length} confirmed. ${needsChoice.length} need you to pick the right place.`
        : confirmed.length
          ? `All ${confirmed.length} places confirmed.`
          : "Nothing to confirm yet.",
      action: needsChoice.length ? <Link className="btn btn-primary btn-small" href={`${base}/places`}>Confirm {needsChoice.length} {needsChoice.length === 1 ? "place" : "places"}</Link> : undefined,
    },
    {
      state: hotel ? "done" : "todo",
      title: "Add your hotel",
      sub: hotel ? hotel : "Optional, but it makes travel times realistic.",
      action: <Link className="btn btn-small" href={`${base}/setup`}>{hotel ? "Change" : "Add hotel"}</Link>,
    },
    {
      state: confirmed.length ? "now" : "todo",
      title: "Generate itinerary",
      sub: confirmed.length ? `Builds your days from ${confirmed.length} confirmed ${confirmed.length === 1 ? "place" : "places"}.` : "Confirm at least one place first.",
      action: (
        <button className="btn btn-primary btn-small" disabled={busy || confirmed.length === 0} onClick={onGenerate}>
          <Icon name="sparkle" size={16} /> {busy ? "Generating…" : "Generate"}
        </button>
      ),
    },
  ];

  const markers: MapMarker[] = places
    .flatMap((p) => (p.selected ? [{ id: p.id, position: p.selected.location, label: p.name, provider: p.selected.details.provider, attribution: p.selected.details.attribution }] : []));

  return (
    <div className="checklist-layout fit-fill">
      <section className="checklist">
        <h2>Let&apos;s get {trip.destination.split(",")[0]} ready</h2>
        <p className="muted">Four steps and your days are planned.</p>
        {steps.map((step) => (
          <div key={step.title} className={`checklist-step is-${step.state}`}>
            <span className="checklist-mark" aria-hidden="true">
              <Icon name={(step.state === "done" ? "check" : step.state === "now" ? "arrowRight" : "clock") as IconName} size={16} />
            </span>
            <span className="checklist-text">
              <strong>{step.title}</strong>
              <small>{step.sub}</small>
            </span>
            {step.action}
          </div>
        ))}
      </section>
      <div className="card checklist-map">
        {markers.length > 0 ? (
          <div className="place-map-wrap">
            <PlaceMap renderer="google" markers={markers} height={300} interactive={false} />
            <a
              className="place-map-overlay-link"
              href={getGoogleMapsRouteUrl(markers)}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="map" size={13} /> Open in Google Maps <Icon name="external" size={11} />
            </a>
          </div>
        ) : (
          <div className="map-placeholder" style={{ height: 300 }}>Your saved places appear here once they&apos;re matched.</div>
        )}
        <p className="fineprint">{markers.length} {markers.length === 1 ? "place" : "places"} with a location · estimated positions</p>
      </div>
    </div>
  );
}
