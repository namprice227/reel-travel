"use client";

import type { BudgetLevel, CandidatePlace, Pace, TransportMode, Trip } from "@reel/contracts";
import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";
import { TIMEZONES } from "./CreateTrip";

// F3 trip setup at /my-trip/:tripId/setup (UI: Member 1, server: Member 4).
// Endpoints: trips.get, trips.update, reservations.*, places.list. Three columns that fit one laptop screen;
// a column scrolls inside itself if its content grows.

export function SetupPage({ tripId }: { tripId: string }) {
  const trip = useApi("trips.get", { params: { tripId } });
  const confirmed = useApi("places.list", { params: { tripId }, query: { status: "confirmed" } });

  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (!trip.data) return <Loading />;

  const t = trip.data.trip;
  const places = confirmed.data?.places ?? [];
  const onSaved = (updated: Trip) => trip.setData({ trip: updated });
  return (
    <div className="fit-page setup-page">
      <header className="page-head">
        <div className="page-head-titles">
          <h1>Trip details</h1>
          <p>
            <Icon name="info" size={16} /> Saved changes need a new itinerary. Regenerate from the{" "}
            <Link href={`/my-trip/${tripId}/itinerary`}>itinerary</Link>.
          </p>
        </div>
      </header>

      <div className="setup-grid fit-fill">
        <section className="card setup-col panel-scroll" aria-label="Trip details">
          <TripDetailsForm trip={t} onSaved={onSaved} />
        </section>
        <section className="card setup-col panel-scroll" aria-label="Preferences">
          <PreferencesForm trip={t} places={places} onSaved={onSaved} />
        </section>
        <div className="setup-col-plain panel-scroll">
          <ReservationsSection trip={t} places={places} />
        </div>
      </div>
    </div>
  );
}

function TripDetailsForm({ trip, onSaved }: { trip: Trip; onSaved: (trip: Trip) => void }) {
  const [form, setForm] = useState({
    title: trip.title,
    destination: trip.destination,
    timezone: trip.timezone,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const { busy, error, done, run } = useSubmit();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const timezones = TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES];

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => onSaved((await api("trips.update", { params: { tripId: trip.id }, body: form })).trip));
  }

  return (
    <form className="setup-section" onSubmit={submit}>
      <div>
        <h2>Trip details</h2>
        <p>The basics. You can edit these any time.</p>
      </div>
      <div className="field-grid">
        <label className="span-2" htmlFor="setup-title">
          Title
          <input id="setup-title" required value={form.title} onChange={set("title")} />
        </label>
        <label className="span-2" htmlFor="setup-destination">
          Destination
          <span className="field-icon"><Icon name="pin" size={18} /><input id="setup-destination" required value={form.destination} onChange={set("destination")} /></span>
        </label>
        <label htmlFor="setup-start">
          Start date
          <input id="setup-start" type="date" required value={form.startDate} onChange={set("startDate")} />
        </label>
        <label htmlFor="setup-end">
          End date
          <input id="setup-end" type="date" required value={form.endDate} onChange={set("endDate")} />
        </label>
        <label className="span-2" htmlFor="setup-timezone">
          Timezone
          <span className="field-icon">
            <Icon name="globe" size={18} />
            <select id="setup-timezone" required value={form.timezone} onChange={set("timezone")}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </span>
        </label>
      </div>
      <ErrorBanner error={error} />
      <div className="setup-form-foot">
        {done && <span className="small muted" role="status">Saved.</span>}
        <button className="btn btn-primary" disabled={busy}>Save details</button>
      </div>
    </form>
  );
}

function PreferencesForm({ trip, places, onSaved }: { trip: Trip; places: CandidatePlace[]; onSaved: (trip: Trip) => void }) {
  const p = trip.preferences;
  const [pace, setPace] = useState<Pace>(p.pace);
  const [dayStart, setDayStart] = useState(p.dayStart);
  const [dayEnd, setDayEnd] = useState(p.dayEnd);
  const [transport, setTransport] = useState<TransportMode>(p.transport);
  const [breakMinutes, setBreakMinutes] = useState(p.breakMinutes);
  const [budget, setBudget] = useState<BudgetLevel | "">(p.budget ?? "");
  const [interests, setInterests] = useState<string[]>(p.interests);
  const [interestDraft, setInterestDraft] = useState("");
  const [mustVisit, setMustVisit] = useState<string[]>(p.mustVisitPlaceIds);
  const [stayName, setStayName] = useState(p.accommodation?.name ?? "");
  const [stayLat, setStayLat] = useState(p.accommodation?.location?.lat.toString() ?? "");
  const [stayLng, setStayLng] = useState(p.accommodation?.location?.lng.toString() ?? "");
  const { busy, error, done, run } = useSubmit();
  const placeName = new Map(places.map((place) => [place.id, place.name]));

  const addInterest = () => {
    const value = interestDraft.trim().replace(/,$/, "");
    if (value && !interests.includes(value)) setInterests([...interests, value]);
    setInterestDraft("");
  };
  const onInterestKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addInterest();
    } else if (e.key === "Backspace" && !interestDraft && interests.length) {
      setInterests(interests.slice(0, -1));
    }
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const lat = Number.parseFloat(stayLat);
      const lng = Number.parseFloat(stayLng);
      const pending = interestDraft.trim();
      const { trip: updated } = await api("trips.update", {
        params: { tripId: trip.id },
        body: {
          preferences: {
            pace,
            dayStart,
            dayEnd,
            transport,
            breakMinutes,
            budget: budget || null,
            interests: pending && !interests.includes(pending) ? [...interests, pending] : interests,
            mustVisitPlaceIds: mustVisit,
            accommodation: stayName.trim()
              ? { name: stayName.trim(), location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null }
              : null,
          },
        },
      });
      if (pending) setInterestDraft("");
      onSaved(updated);
    });
  }

  return (
    <form className="setup-section" onSubmit={submit}>
      <div>
        <h2>Preferences</h2>
        <p>What suits your travel style. Used to shape your days.</p>
      </div>
      <div className="field-grid">
        <fieldset className="plain-fieldset">
          <legend>Pace</legend>
          <Segmented
            value={pace}
            onChange={setPace}
            options={[{ value: "relaxed", label: "Relaxed", hint: "3 places a day" }, { value: "balanced", label: "Balanced", hint: "4 places a day" }, { value: "packed", label: "Packed", hint: "6 places a day" }]}
          />
        </fieldset>
        <fieldset className="plain-fieldset">
          <legend>Transport</legend>
          <Segmented
            value={transport}
            onChange={setTransport}
            options={[{ value: "walk", label: "Walk" }, { value: "transit", label: "Transit" }, { value: "car", label: "Car" }]}
          />
        </fieldset>
        <label htmlFor="pref-start">
          Day start
          <span className="field-icon"><Icon name="clock" size={18} /><input id="pref-start" type="time" required value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></span>
        </label>
        <label htmlFor="pref-end">
          Day end
          <span className="field-icon"><Icon name="clock" size={18} /><input id="pref-end" type="time" required value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></span>
        </label>
        <label htmlFor="pref-break">
          Daily break time
          <span className="field-icon">
            <Icon name="pause" size={18} />
            <select id="pref-break" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))}>
              {[...new Set([0, 30, 45, 60, 90, 120, 180, 240, breakMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>{m === 0 ? "No break" : `${m} minutes`}</option>
              ))}
            </select>
          </span>
        </label>
        <label htmlFor="pref-budget">
          Budget
          <span className="field-icon">
            <Icon name="wallet" size={18} />
            <select id="pref-budget" value={budget} onChange={(e) => setBudget(e.target.value as BudgetLevel | "")}>
              <option value="">Not set</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </span>
        </label>
        <label className="span-2" htmlFor="pref-stay">
          Accommodation
          <span className="field-icon"><Icon name="bed" size={18} /><input id="pref-stay" value={stayName} onChange={(e) => setStayName(e.target.value)} placeholder="Hotel or area" /></span>
        </label>
        <div className="span-2 accommodation-coords">
          <details>
            <summary className="small">Add coordinates (optional, improves travel estimates)</summary>
            <div className="field-grid" style={{ marginTop: 8 }}>
              <label htmlFor="pref-lat">Latitude<input id="pref-lat" inputMode="decimal" value={stayLat} onChange={(e) => setStayLat(e.target.value)} /></label>
              <label htmlFor="pref-lng">Longitude<input id="pref-lng" inputMode="decimal" value={stayLng} onChange={(e) => setStayLng(e.target.value)} /></label>
            </div>
          </details>
        </div>
        <div>
          <label htmlFor="interest-input">Interests</label>
          <div className="chip-field">
            {interests.map((interest) => (
              <span key={interest} className="chip">
                {interest}
                <button type="button" aria-label={`Remove ${interest}`} onClick={() => setInterests(interests.filter((i) => i !== interest))}><Icon name="close" size={12} /></button>
              </span>
            ))}
            <input id="interest-input" value={interestDraft} onChange={(e) => setInterestDraft(e.target.value)} onKeyDown={onInterestKey} onBlur={addInterest} placeholder="Add interests" />
          </div>
        </div>
        <div>
          <label htmlFor="must-visit">Must-visit places</label>
          <div className="chip-field">
            {mustVisit.map((id) => (
              <span key={id} className="chip">
                {placeName.get(id) ?? "Place"}
                <button type="button" aria-label={`Remove ${placeName.get(id) ?? "place"}`} onClick={() => setMustVisit(mustVisit.filter((m) => m !== id))}><Icon name="close" size={12} /></button>
              </span>
            ))}
            <select id="must-visit" value="" onChange={(e) => e.target.value && setMustVisit([...mustVisit, e.target.value])} disabled={places.length === 0}>
              <option value="">{places.length === 0 ? "Confirm places first" : "Add places"}</option>
              {places.filter((place) => !mustVisit.includes(place.id)).map((place) => (
                <option key={place.id} value={place.id}>{place.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <ErrorBanner error={error} />
      <div className="setup-form-foot">
        {done && <span className="small muted" role="status">Saved. Regenerate to apply.</span>}
        <button className="btn btn-primary" disabled={busy}>Save preferences</button>
      </div>
    </form>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; hint?: string }> }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} title={option.hint} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReservationsSection({ trip, places }: { trip: Trip; places: CandidatePlace[] }) {
  const reservations = useApi("reservations.list", { params: { tripId: trip.id } });
  const [form, setForm] = useState({ title: "", date: trip.startDate, start: "19:00", end: "20:30", locked: true, placeId: "" });
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useSubmit();
  const items = reservations.data?.reservations ?? [];

  function add(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("reservations.create", {
        params: { tripId: trip.id },
        body: {
          title: form.title,
          start: `${form.date}T${form.start}`,
          end: `${form.date}T${form.end}`,
          locked: form.locked,
          placeId: form.placeId || null,
        },
      });
      setForm({ ...form, title: "" });
      setAdding(false);
      await reservations.reload();
    });
  }

  const remove = (reservationId: string) =>
    void run(async () => {
      await api("reservations.delete", { params: { tripId: trip.id, reservationId } });
      await reservations.reload();
    });

  return (
    <section className="card setup-col setup-section" aria-labelledby="bookings-title">
      <div>
        <h2 id="bookings-title">Fixed bookings</h2>
        <p>Anything already booked. Locked bookings never move.</p>
      </div>
      <ErrorBanner error={reservations.error ?? error} />
      {reservations.data && items.length === 0 && <Empty title="No bookings yet" />}
      <ul className="booking-list">
        {items.map((r) => (
          <li key={r.id} className="booking-item">
            <span className="booking-icon"><Icon name="food" size={20} /></span>
            <span>
              <strong>{r.title}</strong>
              <small>{formatDay(r.start.slice(0, 10))} · {r.start.slice(11)} – {r.end.slice(11)}</small>
              {r.locked && <span className="lock-pill"><Icon name="lock" size={13} /> Fixed booking</span>}
            </span>
            <button className="icon-btn" disabled={busy} onClick={() => remove(r.id)} aria-label={`Delete booking ${r.title}`}><Icon name="trash" size={17} /></button>
          </li>
        ))}
      </ul>

      {!adding ? (
        <button className="btn btn-outline btn-block" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add booking</button>
      ) : (
        <form className="booking-form" onSubmit={add}>
          <label htmlFor="booking-title">
            Title
            <input id="booking-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Dinner at…" />
          </label>
          <label htmlFor="booking-date">
            Date
            <input id="booking-date" type="date" required min={trip.startDate} max={trip.endDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <div className="field-grid">
            <label htmlFor="booking-start">
              Start
              <input id="booking-start" type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label htmlFor="booking-end">
              End
              <input id="booking-end" type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
          <label htmlFor="booking-place">
            Place (optional)
            <select id="booking-place" value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })}>
              <option value="">None</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select>
          </label>
          <label className="inline" htmlFor="booking-locked">
            <input id="booking-locked" type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} />
            Locked (never moves)
          </label>
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>Add booking</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
