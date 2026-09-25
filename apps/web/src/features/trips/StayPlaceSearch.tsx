"use client";

import type { LatLng, StayPlace, StaySearchResult, StaySuggestion, Trip } from "@reel/contracts";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

/** A stay's name, and its provider link once the traveler picked a suggestion. */
export interface StayLink {
  name: string;
  place?: StayPlace;
  location: LatLng | null;
}

const MIN_CHARS = 3;
const PAUSE_MS = 250;
const newSession = () => crypto.randomUUID().replace(/-/g, "");

/**
 * The hotel name field of a stay row, with suggestions while typing (the provider's autocomplete). Picking one
 * looks it up and checks it against the destination: a hotel there links at once, a nearby town needs a second
 * click, and one in another city or country can't be picked. The server checks the link again on save.
 * Renders two grid items: the field, and the suggestions under the row.
 */
export function StayPlaceSearch({
  trip,
  id,
  label,
  value,
  farFromPlacesKm,
  onChange,
}: {
  trip: Trip;
  id: string;
  label: string;
  value: StayLink;
  /** Median km to the trip's places when the stay is far from them; null otherwise. */
  farFromPlacesKm: number | null;
  onChange: (next: StayLink) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ query: string; items: StaySuggestion[]; attribution: string } | null>(null);
  const [active, setActive] = useState(-1);
  const [checked, setChecked] = useState<Record<string, StaySearchResult>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // One provider session covers a run of keystrokes and the lookup that ends it.
  const session = useRef<string | null>(null);
  const latest = useRef(0);
  const city = trip.destination.split(",")[0]!.trim();
  const query = value.name.trim();

  // Ask for suggestions after a short pause in typing; only the newest answer is shown.
  useEffect(() => {
    if (value.place || unavailable || !open || query.length < MIN_CHARS) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      session.current ??= newSession();
      try {
        const { suggestions, attribution } = await api("stays.suggest", { params: { tripId: trip.id }, query: { q: query, session: session.current } });
        if (request !== latest.current) return;
        setList({ query, items: suggestions, attribution });
        setActive(-1);
        setError(null);
      } catch (cause) {
        if (request !== latest.current) return;
        const err = cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause));
        // Without a hotel provider, stays are saved by name and nothing is suggested.
        if (err.code === "INVALID_STATE") setUnavailable(true);
        else setError(err);
      }
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query, open, unavailable, value.place, trip.id]);

  function link(result: StaySearchResult) {
    if (result.fit === "elsewhere" || result.fit === "other_country") return;
    onChange({
      name: result.option.name.slice(0, 200),
      location: result.option.location,
      place: {
        provider: result.option.details.provider,
        providerPlaceId: result.option.providerPlaceId,
        query: (list?.query ?? query).slice(0, 120),
        address: result.option.address,
        locality: result.locality,
        fit: result.fit,
        checkedFor: trip.destination,
      },
    });
    setOpen(false);
    setList(null);
    setChecked({});
  }

  async function pick(suggestion: StaySuggestion) {
    const known = checked[suggestion.providerPlaceId];
    if (known) return link(known);
    if (checking) return;
    setChecking(suggestion.providerPlaceId);
    setError(null);
    try {
      const { result } = await api("stays.place", {
        params: { tripId: trip.id },
        query: { id: suggestion.providerPlaceId, ...(session.current ? { session: session.current } : {}) },
      });
      // Looking a place up ends the provider session; later typing starts a new one.
      session.current = null;
      if (result.fit === "inside" || result.fit === "unchecked") link(result);
      else setChecked((current) => ({ ...current, [suggestion.providerPlaceId]: result }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
    } finally {
      setChecking(null);
    }
  }

  const answered = Boolean(list && list.query === query);
  const items = answered ? list!.items : [];
  const showList = open && !unavailable && query.length >= MIN_CHARS && (answered || Boolean(error));
  const blockedFit = (s: StaySuggestion) => {
    const fit = checked[s.providerPlaceId]?.fit;
    return fit === "elsewhere" || fit === "other_country";
  };

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && showList) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!showList || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      const chosen = items[active];
      if (chosen && !blockedFit(chosen)) void pick(chosen);
    }
  }

  if (value.place) {
    const { place } = value;
    return (
      <div className="stay-linked">
        <Icon name="pin" size={18} className="stay-linked-pin" />
        <span className="stay-linked-text">
          <strong title={value.name}>{value.name}</strong>
          <span className="small muted">{place.locality ?? place.address ?? city}</span>
        </span>
        {place.fit === "nearby" && <Badge tone="warning">Outside {city}</Badge>}
        {farFromPlacesKm !== null && <Badge tone="warning">{Math.round(farFromPlacesKm)} km from your places</Badge>}
        <button type="button" className="btn btn-small btn-ghost" aria-label={`Change ${value.name}`}
          onClick={() => onChange({ name: value.name, location: null })}>
          Change
        </button>
      </div>
    );
  }

  const listId = `${id}-suggestions`;
  const optionId = (i: number) => `${id}-option-${i}`;
  return (
    <>
      <div className="stay-search">
        <label className="field-icon" htmlFor={id}>
          <span className="sr-only">{label}</span>
          <Icon name="bed" size={18} />
          <input id={id} value={value.name} maxLength={200} placeholder="Hotel name or area" autoComplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
            aria-activedescendant={showList && active >= 0 && active < items.length ? optionId(active) : undefined}
            onKeyDown={onKey}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => { onChange({ name: e.target.value, location: null }); setOpen(true); setChecked({}); }} />
        </label>
      </div>
      {showList && (
        // Pressing inside the list must not blur the field, which would close it before the click lands.
        <div className="stay-results" onMouseDown={(e) => e.preventDefault()}>
          <ul id={listId} role="listbox" aria-label={`Hotels matching ${query}`} className="stay-suggestions">
            {items.map((suggestion, i) => {
              const result = checked[suggestion.providerPlaceId];
              const blocked = blockedFit(suggestion);
              const pending = result?.fit === "nearby";
              return (
                <li key={suggestion.providerPlaceId} id={optionId(i)} role="option" aria-selected={i === active} aria-disabled={blocked || undefined}
                  className={`stay-result${blocked ? " is-blocked" : ""}${pending ? " is-pending" : ""}${i === active ? " is-active" : ""}`}>
                  <button type="button" className="stay-result-main" tabIndex={-1} disabled={blocked} onClick={() => void pick(suggestion)}>
                    <span className="stay-result-text">
                      <strong>{suggestion.name}</strong>
                      <span className="small muted">{result?.option.address ?? suggestion.secondary ?? ""}</span>
                    </span>
                    {checking === suggestion.providerPlaceId
                      ? <span className="small muted">Checking…</span>
                      : result ? <FitBadge result={result} city={city} />
                      : suggestion.distanceKm !== null && <span className="small muted">{Math.round(suggestion.distanceKm)} km</span>}
                  </button>
                  {pending && <button type="button" className="btn btn-small btn-primary" onClick={() => link(result)}>Use anyway</button>}
                </li>
              );
            })}
          </ul>
          {error && <p className="small stay-results-empty" role="alert">{error.message}</p>}
          {!error && items.length === 0 && <p className="small muted stay-results-empty">No matches</p>}
          {items.length > 0 && list?.attribution && <p className="stay-results-attribution">{list.attribution}</p>}
        </div>
      )}
    </>
  );
}

function FitBadge({ result, city }: { result: StaySearchResult; city: string }) {
  switch (result.fit) {
    case "inside": return <Badge tone="success"><Icon name="check" size={12} /> In {city}</Badge>;
    case "nearby": return <Badge tone="warning">{Math.round(result.distanceKm ?? 0)} km from {city}</Badge>;
    case "elsewhere": return <Badge tone="danger">Not in {city}</Badge>;
    case "other_country": return <Badge tone="danger">Another country</Badge>;
    default: return null;
  }
}
