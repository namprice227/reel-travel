"use client";

import { isDatedTrip, MAX_TRIP_DAYS, type Accommodation, type DatedTrip, type Inspiration, type LatLng, type Pace, type StayPlace, type TransportMode, type Trip } from "@reel/contracts";
import { STAY_FAR_FROM_PLACES_KM, stayDistanceToPlaces } from "@reel/planner";
import { useCallback, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Badge, ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { addDays, daysBetween, formatShortDate, tripDays } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { DraftDatesCard, DraftTripBanner } from "./DraftTripDates";
import { PickPlacesStep } from "./PickPlacesStep";
import { StayPlaceSearch } from "./StayPlaceSearch";

/**
 * A trip with no itinerary, as a three-step builder: pick places ("P-B"), add your stay ("S-A"),
 * plan the days ("D-A"). Every step acts here — none of them navigates to another screen.
 *
 * Which step is current is derived from the trip's own data, so it is right after a reload and
 * cannot claim progress that isn't there; clicking a step overrides that until the next change.
 */

const ACTIVE_SAVE: Inspiration["status"][] = ["queued", "processing"];
const STEPS = ["Pick Places", "Add your stay", "Plan the days"] as const;

export function TripBuilder({
  trip,
  busy,
  onGenerate,
  onTripSaved,
}: {
  trip: Trip;
  busy: boolean;
  onGenerate: () => void;
  onTripSaved: (trip: Trip) => void;
}) {
  const params = { tripId: trip.id };
  const saves = useApi("inspirations.list", { params }, {
    pollMs: (data) => (data.inspirations.some((s) => ACTIVE_SAVE.includes(s.status)) ? 1500 : false),
  });
  const places = useApi("places.list", { params }, {
    pollMs: (data) => (saves.data?.inspirations.some((s) => ACTIVE_SAVE.includes(s.status)) ? 1500 :
      data.verificationJobs?.some((job) => job.status === "queued" || job.status === "running") ? 3000 : false),
  });
  const [chosen, setChosen] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const onDraftChange = useCallback((count: number) => setDraftCount(count), []);

  const live = (places.data?.places ?? []).filter((p) => p.status !== "rejected");
  const selectedIds = new Set(trip.selectedPlaceIds ?? live.filter((p) => p.status === "confirmed").map((p) => p.id));
  const selected = live.filter((p) => selectedIds.has(p.id));
  const stays = trip.preferences.accommodations;
  const placeLocations = selected.flatMap((p) => { const at = p.selected?.location ?? p.options[0]?.location; return at ? [at] : []; });

  // The first thing the trip is missing. Clicking a step wins until the data moves on.
  const suggested = selected.length === 0 ? 1 : stays.length === 0 ? 2 : 3;
  const step = chosen ?? suggested;

  const reload = async () => {
    await Promise.all([saves.reload(), places.reload()]);
  };

  // A trip drafted from a video has no dates yet: stays and planning wait for them.
  const dated = isDatedTrip(trip) ? trip : null;
  const pickedCount = step === 1 && draftCount !== null ? draftCount : selected.length;
  const sub = [
    pickedCount ? `${pickedCount} selected` : "Choose what interests you",
    stays.length ? (stays.length > 1 ? `${stays.length} stays` : stays[0]!.name) : "Optional",
    selected.length ? "Ready" : "Not started",
  ];

  return (
    <div className="builder fit-fill">
      <nav className="builder-bar" aria-label="Planning steps">
        {STEPS.map((name, i) => {
          const n = i + 1;
          const state = n < suggested ? "done" : n === step ? "now" : "todo";
          return (
            <div key={name} className="builder-bar-item">
              <button
                type="button"
                className={`builder-bar-step is-${state}${n === step ? " is-current" : ""}`}
                aria-current={n === step ? "step" : undefined}
                onClick={() => { setDraftCount(null); setChosen(n); }}
              >
                <span className="builder-mark" aria-hidden="true">{state === "done" && n !== step ? <Icon name="check" size={15} /> : n}</span>
                <span className="builder-bar-text"><strong>{name}</strong>{i === 1 && <small>{sub[i]}</small>}</span>
              </button>
              {n < STEPS.length && <span className={`builder-bar-line${n < suggested ? " is-done" : ""}`} aria-hidden="true" />}
            </div>
          );
        })}
      </nav>

      {!dated && step === 1 && <DraftTripBanner trip={trip} onAddDates={() => setChosen(2)} />}
      {places.error && <ErrorBanner error={places.error} />}
      {step === 1 && (
        places.loading && !places.data ? <p className="builder-loading muted">Loading places…</p> : (
          <PickPlacesStep
            trip={trip}
            places={live}
            saves={saves.data?.inspirations ?? []}
            onTripSaved={onTripSaved}
            onPlacesChanged={reload}
            onDraftChange={onDraftChange}
            onNext={() => { setDraftCount(null); setChosen(2); }}
          />
        )
      )}
      {step > 1 && !dated && <DraftDatesCard trip={trip} onSaved={onTripSaved} />}
      {step === 2 && dated && <StaysStep key={trip.updatedAt} trip={dated} placeLocations={placeLocations} onSaved={onTripSaved} onNext={() => setChosen(3)} />}
      {step === 3 && dated && (
        <PlanStep
          trip={dated}
          selected={selected.length}
          routable={selected.some((place) => Boolean(place.selected) || place.options.length > 0)}
          busy={busy}
          onSaved={onTripSaved}
          onGenerate={onGenerate}
          onBack={() => setChosen(1)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- step 2: stays ("S-A") */

/** checkIn is the first night, checkOut the last night, as in the Accommodation contract. */
interface StayDraft { name: string; checkIn: string; checkOut: string; place?: StayPlace; location: LatLng | null }
const EMPTY_STAY: StayDraft = { name: "", checkIn: "", checkOut: "", location: null };

const nightsIn = (s: StayDraft) => (s.checkIn && s.checkOut && s.checkOut >= s.checkIn ? daysBetween(s.checkIn, s.checkOut) + 1 : 0);

function StaysStep({ trip, placeLocations, onSaved, onNext }: { trip: DatedTrip; placeLocations: LatLng[]; onSaved: (trip: Trip) => void; onNext: () => void }) {
  const firstNight = trip.startDate;
  const lastNight = addDays(trip.endDate, -1);
  const totalNights = Math.max(0, tripDays(trip.startDate, trip.endDate) - 1);
  const [stays, setStays] = useState<StayDraft[]>(() => {
    const saved = trip.preferences.accommodations.map((s): StayDraft =>
      ({ name: s.name, checkIn: s.checkIn ?? "", checkOut: s.checkOut ?? "", location: s.location, ...(s.place ? { place: s.place } : {}) }));
    return saved.length ? saved : [EMPTY_STAY];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const named = stays.filter((s) => s.name.trim());
  const dated = named.filter((s) => s.checkIn && s.checkOut);
  const halfDated = named.some((s) => Boolean(s.checkIn) !== Boolean(s.checkOut));
  const backwards = named.some((s) => s.checkIn && s.checkOut && s.checkOut < s.checkIn);
  const outside = dated.some((s) => s.checkIn < firstNight || s.checkOut > lastNight);
  const overlap = dated.some((a, i) => dated.some((b, j) => j > i && a.checkIn <= b.checkOut && b.checkIn <= a.checkOut));
  const undated = named.filter((s) => !s.checkIn && !s.checkOut).length;
  const blocked = halfDated || backwards || outside || overlap;

  const coveredNights = undated > 0 ? totalNights : new Set(dated.flatMap((s) => {
    const out: string[] = [];
    for (let d = s.checkIn; d <= s.checkOut && d <= lastNight; d = addDays(d, 1)) if (d >= firstNight) out.push(d);
    return out;
  })).size;

  const farKm = (stay: StayDraft) => {
    const km = stayDistanceToPlaces(stay.place ? stay.location : null, placeLocations);
    return km !== null && km > STAY_FAR_FROM_PLACES_KM ? km : null;
  };

  function update(index: number, patch: Partial<StayDraft>) {
    setStays((current) => current.map((s, i) => {
      if (i === index) return { ...s, ...patch };
      // Moving a stay's last night carries the next stay's first night with it, while they touch.
      const before = current[index]!;
      if (i === index + 1 && patch.checkOut && before.checkOut && s.checkIn === addDays(before.checkOut, 1)) {
        const checkIn = addDays(patch.checkOut, 1);
        return s.checkOut && checkIn > s.checkOut ? s : { ...s, checkIn };
      }
      return s;
    }));
  }

  function addStay() {
    setStays((current) => {
      const prev = current.at(-1);
      if (!prev || totalNights < 2) return [...current, EMPTY_STAY];
      const prevStart = prev.checkIn || firstNight;
      let prevEnd = prev.checkOut || lastNight;
      // The new hotel starts the night after the last one ends; if that one runs to the end, it gives up its last night.
      if (prevEnd >= lastNight) prevEnd = addDays(lastNight, -1);
      if (prevEnd < prevStart) return [...current, EMPTY_STAY];
      return [...current.slice(0, -1), { ...prev, checkIn: prevStart, checkOut: prevEnd }, { ...EMPTY_STAY, checkIn: addDays(prevEnd, 1), checkOut: lastNight }];
    });
  }

  async function save() {
    if (busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const accommodations: Accommodation[] = named.map((s) => ({
        name: s.name.trim(),
        // A linked stay's location comes from the provider (the server re-checks it). An unlinked one keeps
        // coordinates typed on the Trip details screen; a name alone still names the stay.
        location: s.place ? s.location : trip.preferences.accommodations.find((old) => !old.place && old.name === s.name.trim())?.location ?? null,
        checkIn: s.checkIn || null,
        checkOut: s.checkOut || null,
        ...(s.place ? { place: s.place } : {}),
      }));
      const { trip: updated } = await api("trips.update", {
        params: { tripId: trip.id },
        body: { expectedUpdatedAt: trip.updatedAt, preferences: { accommodations } },
      });
      onSaved(updated);
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  return (
    <section className="builder-page" aria-labelledby="builder-stay-title">
      <header className="builder-head">
        <div className="builder-head-row"><h1 id="builder-stay-title">Add your stay</h1><Badge tone="neutral">Optional</Badge></div>
        <p>Choose your first and last hotel nights. Check-out is the next morning.</p>
      </header>

      <ErrorBanner error={error} />

      <div className="hotel-table card">
        <div className="hotel-row hotel-row-head" aria-hidden="true">
          <span />
          <span>Hotel or area</span>
          <span>Nights</span>
          <span />
        </div>
        {stays.map((stay, index) => {
          const nights = nightsIn(stay);
          return (
            <div key={index} className="hotel-row">
              <span className={`hotel-swatch is-${index % 4}`} aria-hidden="true" />
              <StayPlaceSearch trip={trip} id={`stay-name-${index}`} label={`Hotel ${index + 1}`} value={stay}
                farFromPlacesKm={farKm(stay)}
                onChange={(link) => setStays((current) => current.map((s, i) => i === index
                  ? { name: link.name, checkIn: s.checkIn, checkOut: s.checkOut, location: link.location, ...(link.place ? { place: link.place } : {}) } : s))} />
              <div className="hotel-range">
                <Icon name="calendar" size={17} />
                <label htmlFor={`stay-in-${index}`}>
                  <span className="sr-only">First night at hotel {index + 1}</span>
                  <input id={`stay-in-${index}`} type="date" min={firstNight} max={lastNight} value={stay.checkIn} onChange={(e) => update(index, { checkIn: e.target.value })} />
                </label>
                <Icon name="arrowRight" size={15} className="hotel-range-arrow" />
                <label htmlFor={`stay-out-${index}`}>
                  <span className="sr-only">Last night at hotel {index + 1}</span>
                  <input id={`stay-out-${index}`} type="date" min={stay.checkIn || firstNight} max={lastNight} value={stay.checkOut} onChange={(e) => update(index, { checkOut: e.target.value })} />
                </label>
                <span className="hotel-nights">
                  {nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : stays.length === 1 && !stay.checkIn && !stay.checkOut ? "All nights" : "Pick nights"}
                </span>
              </div>
              <button type="button" className="icon-btn is-danger" aria-label={`Remove ${stay.name || `hotel ${index + 1}`}`} onClick={() => setStays(stays.length === 1 ? [EMPTY_STAY] : stays.filter((_, i) => i !== index))}>
                <Icon name="trash" size={17} />
              </button>
            </div>
          );
        })}
        <div className="hotel-foot">
          <button type="button" className="btn btn-small" disabled={stays.length >= MAX_TRIP_DAYS} onClick={addStay}>
            <Icon name="plus" size={16} /> Add another hotel
          </button>
          <span className="small muted">It starts the night after the one before it ends. One hotel with no dates covers the whole trip.</span>
        </div>
      </div>

      {totalNights > 0 && named.length > 0 && (
        <div className="hotel-cover">
          <div className="hotel-cover-bar" aria-hidden="true">
            {undated > 0 && dated.length === 0 ? <span className="is-0" style={{ flexGrow: totalNights }} /> : (
              <>
                {named.map((s, i) => nightsIn(s) ? <span key={i} className={`is-${stays.indexOf(s) % 4}`} style={{ flexGrow: nightsIn(s) }} /> : null)}
                {coveredNights < totalNights && <span className="is-gap" style={{ flexGrow: totalNights - coveredNights }} />}
              </>
            )}
          </div>
          <div className="hotel-cover-meta">
            <span>{formatShortDate(firstNight)}</span>
            <strong className={coveredNights >= totalNights ? "is-ok" : "is-gap"}>
              <Icon name={coveredNights >= totalNights ? "checkCircle" : "alert"} size={15} /> {Math.min(coveredNights, totalNights)} of {totalNights} {totalNights === 1 ? "night" : "nights"} covered
            </strong>
            <span>{formatShortDate(lastNight)}</span>
          </div>
        </div>
      )}
      {halfDated && <p className="banner banner-warning small" role="status">Give a hotel both its first and last night, or neither.</p>}
      {backwards && <p className="banner banner-warning small" role="status">A hotel’s last night can’t be before its first.</p>}
      {outside && <p className="banner banner-warning small" role="status">Keep each hotel’s nights inside the trip dates.</p>}
      {overlap && <p className="banner banner-warning small" role="status">Two hotels share a night. Give each night one hotel.</p>}
      {undated > 1 && <p className="small muted" role="status">Only the first hotel without dates is used. Give the others their nights.</p>}

      <div className="builder-actions">
        <button type="button" className="btn btn-primary" disabled={busy || blocked} onClick={() => void save()}>
          {busy ? "Saving…" : "Save and continue"} <Icon name="arrowRight" size={16} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={onNext}>Skip</button>
        <span className="small muted">Skipping is fine: days start from your first place instead.</span>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- step 3: plan ("D-A") */

const PACES: Array<{ value: Pace; label: string; hint: string; dots: number }> = [
  { value: "relaxed", label: "Relaxed", hint: "2–3 stops a day, long breaks", dots: 3 },
  { value: "balanced", label: "Balanced", hint: "4–5 stops a day", dots: 5 },
  { value: "packed", label: "Packed", hint: "6+ stops, see the most", dots: 6 },
];
const MODES: Array<{ value: TransportMode; label: string; hint: string; icon: IconName }> = [
  { value: "walk", label: "Walk", hint: "Short hops only", icon: "walk" },
  { value: "transit", label: "Transit", hint: "Trains and buses", icon: "transit" },
  { value: "car", label: "Car", hint: "Taxi or drive", icon: "car" },
];
const START_TIMES = ["08:00", "09:00", "10:00", "11:00"];

function PlanStep({
  trip,
  selected,
  routable,
  busy,
  onSaved,
  onGenerate,
  onBack,
}: {
  trip: DatedTrip;
  selected: number;
  routable: boolean;
  busy: boolean;
  onSaved: (trip: Trip) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const prefs = trip.preferences;
  const [pace, setPace] = useState<Pace>(prefs.pace);
  const [transport, setTransport] = useState<TransportMode>(prefs.transport);
  const [dayStart, setDayStart] = useState(prefs.dayStart);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const days = tripDays(trip.startDate, trip.endDate);
  const times = [...new Set([...START_TIMES, prefs.dayStart])].filter((t) => t < prefs.dayEnd).sort();
  const changed = pace !== prefs.pace || transport !== prefs.transport || dayStart !== prefs.dayStart;
  const stays = prefs.accommodations;

  async function build() {
    if (busy || saving) return;
    setError(null);
    if (changed) {
      setSaving(true);
      try {
        const { trip: updated } = await api("trips.update", {
          params: { tripId: trip.id },
          body: { expectedUpdatedAt: trip.updatedAt, preferences: { pace, transport, dayStart } },
        });
        onSaved(updated);
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onGenerate();
  }

  return (
    <section className="builder-page is-centered" aria-labelledby="builder-plan-title">
      <div className="plan-card card">
        <header className="builder-head">
          <h1 id="builder-plan-title">Plan the days</h1>
          <p>{selected} {selected === 1 ? "place" : "places"} · {days} {days === 1 ? "day" : "days"}</p>
        </header>

        <div className="plan-group" role="group" aria-labelledby="plan-pace">
          <h2 id="plan-pace">Pace</h2>
          <div className="plan-paces">
            {PACES.map((p) => (
              <button key={p.value} type="button" className="plan-pace" aria-pressed={pace === p.value} onClick={() => setPace(p.value)}>
                <span className="plan-dots" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className={i < p.dots ? "is-on" : undefined} />)}</span>
                <strong>{p.label}</strong>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="plan-group" role="group" aria-labelledby="plan-transport">
          <h2 id="plan-transport">Getting around</h2>
          <div className="plan-modes">
            {MODES.map((m) => (
              <button key={m.value} type="button" className="plan-mode" aria-pressed={transport === m.value} onClick={() => setTransport(m.value)}>
                <span className="plan-mode-mark"><Icon name={m.icon} size={20} /></span>
                <span><strong>{m.label}</strong><small>{m.hint}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div className="plan-group is-inline" role="group" aria-labelledby="plan-start">
          <h2 id="plan-start">Start each day around</h2>
          <div className="plan-times">
            {times.map((t) => <button key={t} type="button" className="pick-chip" aria-pressed={dayStart === t} onClick={() => setDayStart(t)}>{t}</button>)}
          </div>
        </div>

        <ErrorBanner error={error} />
        {selected === 0 || !routable ? (
          <div className="builder-actions plan-foot">
            <p className="small muted">{selected === 0 ? "Tick at least one place and we can build the days." : "Your selected places have no usable location yet. Add more detail or wait for location lookup."}</p>
            <button type="button" className="btn btn-primary" onClick={onBack}>Pick places</button>
          </div>
        ) : (
          <div className="builder-actions plan-foot">
            <button type="button" className="btn btn-primary btn-large" disabled={busy || saving} onClick={() => void build()}>
              <Icon name="sparkle" size={19} /> {saving ? "Saving…" : busy ? "Building…" : "Build my days"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
