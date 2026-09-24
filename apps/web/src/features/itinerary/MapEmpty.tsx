"use client";

import type { CandidatePlace, Trip } from "@reel/contracts";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { getGoogleMapsRouteUrl } from "@/lib/maps";

// What the Map tab shows before a trip has an itinerary. The Itinerary tab shows the four-step
// checklist here; this preview uses only unambiguous locations. The route builder can resolve
// ambiguous provider matches when planning. Every state is read from this trip's saves and places.

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
  const selectedIds = new Set(trip.selectedPlaceIds ?? places.filter((p) => p.status === "confirmed").map((p) => p.id));
  const selected = places.filter((p) => p.status !== "rejected" && selectedIds.has(p.id));
  const base = `/my-trip/${trip.id}`;

  // Ambiguous branches wait for the route builder; this preview never guesses a pin.
  const routable = selected.some((p) => Boolean(p.selected) || p.options.length > 0);
  const markers: MapMarker[] = selected.flatMap((p) => {
    const option = p.selected ?? (p.options.length === 1 ? p.options[0] : null);
    return option
      ? [{ id: p.id, position: option.location, label: option.name, provider: option.details.provider, attribution: option.details.attribution }]
      : [];
  });

  const state = selected.length > 0 ? "route" : "save";
  const copy = {
    save: {
      title: "No map yet",
      body: `The map draws the route between the places in this trip, and there aren't any yet. Save a reel, a link, a screenshot or a note, and we'll find the places in it.`,
      action: <Link className="btn btn-primary" href={`${base}/itinerary`}><Icon name="check" size={17} /> Choose places</Link>,
      secondary: <Link className="btn" href={`${base}/places`}>Go to places</Link>,
    },
    route: {
      title: "No route yet",
      body: markers.length > 1
        ? `Your ${markers.length} selected places with known locations are on the map. Build the days and we'll draw the route between them.`
        : markers.length === 1
          ? `Your one selected place has a location. Add more if you want a route between stops, or plan the days now.`
          : routable
            ? "Your selected places have possible locations. Build the days and we'll choose a location for the route."
            : `${selected.length} selected ${selected.length === 1 ? "place needs" : "places need"} a location before a route can be drawn.`,
      action: (
        <button className="btn btn-primary" disabled={busy || !routable} onClick={onGenerate}>
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
            : `${selected.length} of ${places.length} places selected · ${markers.length} with a preview location.`}
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
