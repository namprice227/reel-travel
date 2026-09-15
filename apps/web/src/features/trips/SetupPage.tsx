"use client";

import type { BudgetLevel, CandidatePlace, Pace, TransportMode, Trip } from "@reel/contracts";
import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";
import { TIMEZONES } from "./NewTripPage";

// F3 trip setup at /my-trip/:tripId/setup (UI: Member 1, server: Member 4).
// Endpoints: trips.get, trips.update, reservations.*, places.list. Arrangement follows the "trip setup" reference.

export function SetupPage({ tripId }: { tripId: string }) {
  const trip = useApi("trips.get", { params: { tripId } });
  const confirmed = useApi("places.list", { params: { tripId }, query: { status: "confirmed" } });

  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (!trip.data) return <Loading />;

  const t = trip.data.trip;
  const places = confirmed.data?.places ?? [];
  const onSaved = (updated: Trip) => trip.setData({ trip: updated });
  return (
    <div className="setup-page">
      <section className="setup-hero">
        <CoverArt seed={t.destination} showLabel={false} />
        <div className="setup-hero-copy">
          <h1>Make room for your kind of trip</h1>
          <p>{t.destination} · Trip details</p>
        </div>
      </section>

      <div className="setup-grid">
        <div className="card setup-main">
          <TripDetailsForm trip={t} onSaved={onSaved} />
          <PreferencesForm trip={t} places={places} onSaved={onSaved} />
        </div>
        <div className="setup-side">
          <ReservationsSection trip={t} places={places} />
          <div className="callout">
            <Icon name="info" />
            <p>
              <strong>Changes to trip details require regenerating your itinerary.</strong>
              <br />
              After you save, rebuild your days from the <Link href={`/my-trip/${tripId}/timeline`}>Timeline</Link>.
            </p>
          </div>
          <CoverArt seed={`${t.destination}-setup`} className="setup-art" caption="Same links. A clearer trip." />
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
        <p>Give your trip a few basics. You can always edit these later.</p>
      </div>
      <div className="field-grid">
        <label>
          Title
          <input required value={form.title} onChange={set("title")} />
        </label>
        <label>
          Destination
          <span className="field-icon"><Icon name="pin" size={18} /><input required value={form.destination} onChange={set("destination")} /></span>
        </label>
        <label>
          Start date
          <span className="field-icon"><Icon name="calendar" size={18} /><input type="date" required value={form.startDate} onChange={set("startDate")} /></span>
        </label>
        <label>
          End date
          <span className="field-icon"><Icon name="calendar" size={18} /><input type="date" required value={form.endDate} onChange={set("endDate")} /></span>
        </label>
        <label>
          Timezone
          <span className="field-icon">
            <Icon name="globe" size={18} />
            <select required value={form.timezone} onChange={set("timezone")}>
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
        <p>Tell us what suits your travel style. We&apos;ll use this to shape your itinerary.</p>
      </div>
      <div className="field-grid">
        <fieldset className="plain-fieldset">
          <legend className="label-row">Pace</legend>
          <Segmented
            value={pace}
            onChange={setPace}
            options={[{ value: "relaxed", label: "Relaxed", hint: "3 places a day" }, { value: "balanced", label: "Balanced", hint: "4 places a day" }, { value: "packed", label: "Packed", hint: "6 places a day" }]}
          />
        </fieldset>
        <fieldset className="plain-fieldset">
          <legend className="label-row">Transport</legend>
          <Segmented
            value={transport}
            onChange={setTransport}
            options={[{ value: "walk", label: "Walk" }, { value: "transit", label: "Transit" }, { value: "car", label: "Car" }]}
          />
        </fieldset>
      </div>
      <div className="field-grid field-grid-3">
        <label>
          Day start
          <span className="field-icon"><Icon name="clock" size={18} /><input type="time" required value={dayStart} onChange={(e) => setDayStart(e.target.value)} /></span>
        </label>
        <label>
          Day end
          <span className="field-icon"><Icon name="clock" size={18} /><input type="time" required value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} /></span>
        </label>
        <label>
          Daily break time
          <span className="field-icon">
            <Icon name="pause" size={18} />
            <select value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))}>
              {[...new Set([0, 30, 45, 60, 90, 120, 180, 240, breakMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>{m === 0 ? "No break" : `${m} minutes`}</option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className="field-grid">
        <label>
          Budget
          <span className="field-icon">
            <Icon name="wallet" size={18} />
            <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetLevel | "")}>
              <option value="">Not set</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </span>
        </label>
        <label>
          Accommodation
          <span className="field-icon"><Icon name="bed" size={18} /><input value={stayName} onChange={(e) => setStayName(e.target.value)} placeholder="Not set" /></span>
        </label>
        <div className="span-2 accommodation-coords">
          <details>
            <summary className="small">Add accommodation coordinates (optional, improves travel estimates)</summary>
            <div className="field-grid" style={{ marginTop: 10 }}>
              <label>Latitude<input inputMode="decimal" value={stayLat} onChange={(e) => setStayLat(e.target.value)} /></label>
              <label>Longitude<input inputMode="decimal" value={stayLng} onChange={(e) => setStayLng(e.target.value)} /></label>
            </div>
          </details>
        </div>
        <div>
          <label htmlFor="interest-input">Interests</label>
          <div className="chip-field" style={{ marginTop: 6 }}>
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
          <label htmlFor="must-visit">Confirmed must-visit places</label>
          <div className="chip-field" style={{ marginTop: 6 }}>
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
      <div className="setup-form-foot is-start">
        <button className="btn btn-primary" disabled={busy}>Save preferences</button>
        {done && <span className="small muted" role="status">Saved. Regenerate the itinerary to apply changes.</span>}
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
    <section className="card stack">
      <div>
        <h2 className="card-title">Fixed bookings</h2>
        <p className="muted">Add anything you&apos;ve already booked so we can plan around it. Locked bookings never move.</p>
      </div>
      <ErrorBanner error={reservations.error ?? error} />
      {reservations.data && items.length === 0 && <Empty title="No bookings yet" />}
      <ul className="booking-list">
        {items.map((r) => (
          <li key={r.id} className="booking-item">
            <span className="booking-icon"><Icon name="food" /></span>
            <span>
              <strong>{r.title}</strong>
              <small>{formatDay(r.start.slice(0, 10))} · {r.start.slice(11)} – {r.end.slice(11)}</small>
              <small>{trip.destination}</small>
            </span>
            <span className="booking-side">
              {r.locked && <span className="lock-pill"><Icon name="lock" size={13} /> Fixed booking</span>}
              <button className="icon-btn" disabled={busy} onClick={() => remove(r.id)} aria-label={`Delete booking ${r.title}`}><Icon name="trash" size={17} /></button>
            </span>
          </li>
        ))}
      </ul>

      {!adding ? (
        <button className="btn btn-outline btn-block" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add booking</button>
      ) : (
        <form className="booking-form" onSubmit={add}>
          <label>
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Dinner at…" />
          </label>
          <div className="field-grid field-grid-3">
            <label>
              Date
              <input type="date" required min={trip.startDate} max={trip.endDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              Start
              <input type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label>
              End
              <input type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
          <label>
            Place (optional)
            <select value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })}>
              <option value="">None</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} />
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
