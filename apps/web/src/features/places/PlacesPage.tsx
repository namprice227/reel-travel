"use client";

import type { CandidatePlace, PlaceOption, PlaceStatus } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PlaceImage } from "@/components/PlacePhoto";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { describeHours, placeStatus } from "@/lib/format";
import { getGoogleMapsRouteUrl } from "@/lib/maps";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";

// F2 place confirmation (task FE04, endpoints places.list, places.confirm, places.reject), in the Sky 3 look:
// the places on the left, the map and how ready the trip is on the right. What needs you comes first.

type Filter = "todo" | "confirmed" | "rejected" | "all";

const NEEDS_YOU: PlaceStatus[] = ["ambiguous", "pending", "not_found"];
const FILTERS: Array<{ id: Filter; label: string; match: (p: CandidatePlace) => boolean }> = [
  { id: "todo", label: "Needs you", match: (p) => NEEDS_YOU.includes(p.status) },
  { id: "confirmed", label: "Confirmed", match: (p) => p.status === "confirmed" },
  { id: "rejected", label: "Rejected", match: (p) => p.status === "rejected" },
  { id: "all", label: "All", match: () => true },
];
const HINT: Record<PlaceStatus, string> = {
  ambiguous: "Several real places match. Pick the one from your save.",
  pending: "One match found. Check it's the place you meant.",
  not_found: "Nothing matched. Add detail to the save, or reject it.",
  confirmed: "Used for planning.",
  rejected: "Left out of planning. The save is kept.",
};
const MARKER_COLORS: Partial<Record<PlaceStatus, string>> = { confirmed: "#1a6ad0", pending: "#b8341f", ambiguous: "#b8341f" };

export function PlacesPage({ tripId }: { tripId: string }) {
  const places = useApi("places.list", { params: { tripId } });
  const { busy, error, run } = useSubmit();
  const [filter, setFilter] = useState<Filter>("todo");
  const all = places.data?.places ?? [];
  const pending = all.filter((p) => p.status === "pending");
  const confirmed = all.filter((p) => p.status === "confirmed");
  const todo = all.filter((p) => NEEDS_YOU.includes(p.status));

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
          await api("places.confirm", { params: { tripId, placeId: place.id }, body: { providerPlaceId: place.options[0]!.providerPlaceId } });
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
      popup: <p className="small">{placeStatus[place.status].label} · {place.evidence.length} source{place.evidence.length === 1 ? "" : "s"}</p>,
    }));
  });

  if (places.loading && !places.data) return <Loading />;

  const shown = all.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <div className="fit-page places-page">
      <header className="page-head">
        <div className="page-head-titles">
          <h1>Places</h1>
          <p>{todo.length > 0 ? `${todo.length} ${todo.length === 1 ? "place needs" : "places need"} a decision before planning.` : "Every place has been checked against its source."}</p>
        </div>
        {pending.length > 0 && (
          <button className="btn btn-primary" disabled={busy} onClick={confirmAllSingle}>
            <Icon name="check" size={18} /> Confirm {pending.length} single {pending.length === 1 ? "match" : "matches"}
          </button>
        )}
      </header>

      <ErrorBanner error={places.error ?? error} />
      {all.length === 0 ? (
        <Empty title="No places yet">
          Add inspiration in your <Link href={`/inspiration-library?trip=${tripId}`}>Inspiration library</Link>. Places appear here once they&apos;re found.
        </Empty>
      ) : (
        <div className="places-layout fit-fill">
          <div className="places-main panel-scroll">
            <div className="filter-chips" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label} · {all.filter(f.match).length}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="trips-none">Nothing in this list.</p>
            ) : (
              <ul className="place-rows">
                {shown.map((place) => (
                  <PlaceRow
                    key={place.id}
                    place={place}
                    tripId={tripId}
                    busy={busy}
                    onConfirm={(providerPlaceId) => confirm(place, providerPlaceId)}
                    onReject={() => act(() => api("places.reject", { params: { tripId, placeId: place.id } }))}
                  />
                ))}
              </ul>
            )}
          </div>

          <aside className="places-side panel-scroll" aria-label="Map and progress">
            <div className="card place-map-card">
              <div className="place-map-wrap">
                <PlaceMap renderer="google" markers={markers} height={280} />
                {markers.length > 0 && (
                  <a
                    className="place-map-overlay-link"
                    href={getGoogleMapsRouteUrl(markers)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="map" size={13} /> Open in Google Maps <Icon name="external" size={11} />
                  </a>
                )}
              </div>
              <ul className="panel-facts">
                <li><Icon name="checkCircle" size={15} /> <span>Confirmed<strong>{confirmed.length} of {all.length} places</strong></span></li>
                <li><Icon name="alert" size={15} /> <span>Still to check<strong>{todo.length === 0 ? "Nothing left" : `${todo.length} ${todo.length === 1 ? "place" : "places"}`}</strong></span></li>
              </ul>
            </div>
            <Link className="btn btn-outline btn-block" href={`/my-trip/${tripId}/itinerary`}>Back to the itinerary <Icon name="arrowRight" size={18} /></Link>
            <p className="fineprint">Blue pins are confirmed. Red pins still need a decision.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function PlaceRow({
  place, tripId, busy, onConfirm, onReject,
}: {
  place: CandidatePlace; tripId: string; busy: boolean; onConfirm: (providerPlaceId: string) => void; onReject: () => void;
}) {
  const [choice, setChoice] = useState(place.options.length === 1 ? place.options[0]!.providerPlaceId : "");
  const status = placeStatus[place.status];
  const choosable = place.options.length > 1 && (place.status === "ambiguous" || place.status === "rejected");
  const option = place.selected ?? place.options[0];

  return (
    <li className={`place-row card is-${place.status}`}>
      <PlaceImage photo={option?.details.photos[0]} category={option?.details.category} className="place-row-art" width={200} alt={option ? `${option.name}` : ""} />
      <div className="place-row-main">
        <div className="place-row-head">
          <h3>{place.name}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="muted small">{HINT[place.status]}</p>
        {choosable ? (
          <fieldset className="place-options-pick">
            <legend className="sr-only">Which {place.name}?</legend>
            {place.options.map((o) => (
              <label key={o.providerPlaceId}>
                <input type="radio" name={`choice-${place.id}`} checked={choice === o.providerPlaceId} onChange={() => setChoice(o.providerPlaceId)} />
                <OptionSummary option={o} />
              </label>
            ))}
          </fieldset>
        ) : option ? (
          <OptionSummary option={option} />
        ) : (
          <p className="small muted">No real place matched &ldquo;{place.name}&rdquo;.</p>
        )}
        <details className="place-row-why">
          <summary>Why this was suggested · {place.evidence.length} {place.evidence.length === 1 ? "save" : "saves"}</summary>
          {place.evidence.map((item) => (
            <blockquote key={`${item.inspirationId}:${item.clue}`} className="quote">
              {item.excerpt ?? `(${item.sourceType} save)`}
              <br />
              <span className="small">From a {item.sourceType} save, looked up as &ldquo;{item.clue}&rdquo;</span>
            </blockquote>
          ))}
        </details>
        <div className="place-row-actions">
          {place.status === "pending" && (
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => onConfirm(place.options[0]!.providerPlaceId)}>Confirm</button>
          )}
          {place.status === "ambiguous" && (
            <button className="btn btn-primary btn-small" disabled={busy || !choice} onClick={() => onConfirm(choice)}>Confirm selected</button>
          )}
          {place.status === "rejected" && place.options.length > 0 && (
            <button className="btn btn-small" disabled={busy || !choice} onClick={() => onConfirm(choice)}>Restore and confirm</button>
          )}
          {place.status !== "rejected" && (
            <button className="btn btn-small btn-danger" disabled={busy} onClick={onReject}>Reject</button>
          )}
          {place.status === "confirmed" && (
            <Link className="link-arrow" href={`/my-trip/${tripId}/place/${place.id}`}>Full details <Icon name="arrowRight" size={15} /></Link>
          )}
        </div>
      </div>
    </li>
  );
}

function OptionSummary({ option }: { option: PlaceOption }) {
  return (
    <span className="place-option-summary">
      <strong>{option.name}</strong>
      {option.details.summary && <span className="place-option-desc">{option.details.summary}</span>}
      <span className="muted">{option.address ?? "No address"}</span>
      <span className="muted small">
        {option.details.category ?? "Place"}
        {option.details.rating != null && ` · ★ ${option.details.rating.toFixed(1)}`}
        {" · "}
        {describeHours(option.details.openingHours)}
        {option.details.provider === "fixture" ? " · sample data" : ""}
      </span>
    </span>
  );
}
