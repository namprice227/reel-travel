"use client";

import type { CandidatePlace, Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { getGoogleMapsRouteUrl } from "@/lib/maps";

// What the Map tab shows before a trip has an itinerary. The Itinerary tab shows the four-step
// checklist here; the map needs its own answer, because "no map" has three different causes and
// each one has a different next step. Every state is read from the trip's own saves and places.

export function MapEmpty({
  trip,
  places,
  busy,
  onGenerate,
}: {
  trip: Trip;
  places: CandidatePlace[];
  busy: boolean;
  onGenerate: () => void;
}) {
  const confirmed = places.filter((p) => p.status === "confirmed");
  const needsChoice = places.filter((p) => p.status === "pending" || p.status === "ambiguous" || p.status === "not_found");
  const base = `/my-trip/${trip.id}`;

  // Only a confirmed place with a chosen match has coordinates to put on a map.
  const markers: MapMarker[] = confirmed.flatMap((p) =>
    p.selected
      ? [{ id: p.id, position: p.selected.location, label: p.selected.name ?? p.name, provider: p.selected.details.provider, attribution: p.selected.details.attribution }]
      : [],
  );

  const state = confirmed.length > 0 ? "route" : needsChoice.length > 0 ? "confirm" : "save";
  const copy = {
    save: {
      title: "No map yet",
      body: `The map draws the route between the places in this trip, and there aren't any yet. Save a reel, a link, a screenshot or a note, and we'll find the places in it.`,
      action: <Link className="btn btn-primary" href={`/inspiration-library?trip=${trip.id}`}><Icon name="plus" size={17} /> Add a save</Link>,
      secondary: <Link className="btn" href={`${base}/places`}>Go to places</Link>,
    },
    confirm: {
      title: "No map yet",
      body: `${needsChoice.length} ${needsChoice.length === 1 ? "place is" : "places are"} waiting for you to pick the right match. They appear on the map as soon as you confirm them.`,
      action: <Link className="btn btn-primary" href={`${base}/places`}><Icon name="pin" size={17} /> Confirm {needsChoice.length} {needsChoice.length === 1 ? "place" : "places"}</Link>,
      secondary: <Link className="btn" href={`/inspiration-library?trip=${trip.id}`}>Add another save</Link>,
    },
    route: {
      title: "No route yet",
      body: markers.length > 1
        ? `Your ${markers.length} confirmed places are on the map. Plan the days and we'll draw the route between them.`
        : markers.length === 1
          ? `Your one confirmed place is on the map. A route needs somewhere to go next, so confirm a few more, then plan the days.`
          : `${confirmed.length} ${confirmed.length === 1 ? "place is" : "places are"} confirmed, but none of them has a saved location yet, so there is nothing to put on the map.`,
      action: (
        <button className="btn btn-primary" disabled={busy} onClick={onGenerate}>
          <Icon name="sparkle" size={17} /> {busy ? "Planning…" : "Plan the days"}
        </button>
      ),
      secondary: <Link className="btn" href={`${base}/places`}>Go to places</Link>,
    },
  }[state];

  const panel = (
    <section className="map-empty">
        <span className="map-empty-icon" aria-hidden="true"><Icon name="map" size={30} /></span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <div className="map-empty-actions">{copy.action}{copy.secondary}</div>
        <p className="fineprint">
          {places.length === 0
            ? "Places come from your saves — the map never invents one."
            : `${confirmed.length} of ${places.length} places confirmed · ${markers.length} with a location.`}
        </p>
      </section>
  );

  // With nothing to plot, an empty map frame would be decoration that says nothing; the panel
  // already explains why. Only show the map once there is at least one place on it.
  if (markers.length === 0) return <div className="map-empty-solo fit-fill">{panel}</div>;

  return (
    <div className="checklist-layout fit-fill">
      {panel}
      <div className="card checklist-map">
        <div className="place-map-wrap">
          <PlaceMap renderer="google" markers={markers} height={300} interactive={false} />
          <a className="place-map-overlay-link" href={getGoogleMapsRouteUrl(markers)} target="_blank" rel="noreferrer noopener">
            <Icon name="map" size={13} /> Open in Google Maps <Icon name="external" size={11} />
          </a>
        </div>
        <p className="fineprint">{markers.length} {markers.length === 1 ? "place" : "places"} with a location · estimated positions</p>
      </div>
    </div>
  );
}
