"use client";

import type { BudgetLevel, CandidatePlace, Pace, TransportMode, Trip } from "@reel/contracts";
import { useState, type FormEvent } from "react";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSubmit } from "@/lib/use-submit";

// F3 trip setup (UI: Member 1, server: Member 3). Endpoints: trips.get, trips.update, reservations.*, places.list.

export function SetupPage({ tripId }: { tripId: string }) {
  const trip = useApi("trips.get", { params: { tripId } });
  const confirmed = useApi("places.list", { params: { tripId }, query: { status: "confirmed" } });

  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (!trip.data) return <Loading />;

  const places = confirmed.data?.places ?? [];
  const onSaved = (updated: Trip) => trip.setData({ trip: updated });
  return (
    <div className="stack">
      <TripDetailsForm trip={trip.data.trip} onSaved={onSaved} />
      <PreferencesForm trip={trip.data.trip} places={places} onSaved={onSaved} />
      <ReservationsSection trip={trip.data.trip} places={places} />
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

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => onSaved((await api("trips.update", { params: { tripId: trip.id }, body: form })).trip));
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Trip details</h2>
      <div className="form-grid">
        <label>
          Title
          <input required value={form.title} onChange={set("title")} />
        </label>
        <label>
          Destination
          <input required value={form.destination} onChange={set("destination")} />
        </label>
        <label>
          Timezone
          <input required value={form.timezone} onChange={set("timezone")} />
        </label>
        <label>
          Start
          <input type="date" required value={form.startDate} onChange={set("startDate")} />
        </label>
        <label>
          End
          <input type="date" required value={form.endDate} onChange={set("endDate")} />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Save details
        </button>
      </div>
      {done && <p className="small muted">Saved.</p>}
      <ErrorBanner error={error} />
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
  const [interests, setInterests] = useState(p.interests.join(", "));
  const [mustVisit, setMustVisit] = useState<string[]>(p.mustVisitPlaceIds);
  const [stayName, setStayName] = useState(p.accommodation?.name ?? "");
  const [stayLat, setStayLat] = useState(p.accommodation?.location?.lat.toString() ?? "");
  const [stayLng, setStayLng] = useState(p.accommodation?.location?.lng.toString() ?? "");
  const { busy, error, done, run } = useSubmit();

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const lat = Number.parseFloat(stayLat);
      const lng = Number.parseFloat(stayLng);
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
            interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
            mustVisitPlaceIds: mustVisit,
            accommodation: stayName.trim()
              ? { name: stayName.trim(), location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null }
              : null,
          },
        },
      });
      onSaved(updated);
    });
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Preferences</h2>
      <div className="form-grid">
        <label>
          Pace
          <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
            <option value="relaxed">Relaxed (3 places a day)</option>
            <option value="balanced">Balanced (4)</option>
            <option value="packed">Packed (6)</option>
          </select>
        </label>
        <label>
          Day starts
          <input type="time" required value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
        </label>
        <label>
          Day ends
          <input type="time" required value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} />
        </label>
        <label>
          Getting around
          <select value={transport} onChange={(e) => setTransport(e.target.value as TransportMode)}>
            <option value="walk">Walking</option>
            <option value="transit">Public transport</option>
            <option value="car">Car or taxi</option>
          </select>
        </label>
        <label>
          Break (minutes a day)
          <input type="number" min={0} max={240} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} />
        </label>
        <label>
          Budget
          <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetLevel | "")}>
            <option value="">Not set</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Interests
          <input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="food, temples, views" />
        </label>
        <label>
          Where you stay
          <input value={stayName} onChange={(e) => setStayName(e.target.value)} placeholder="Hotel name" />
        </label>
        <label>
          Stay latitude
          <input inputMode="decimal" value={stayLat} onChange={(e) => setStayLat(e.target.value)} />
        </label>
        <label>
          Stay longitude
          <input inputMode="decimal" value={stayLng} onChange={(e) => setStayLng(e.target.value)} />
        </label>
      </div>

      {places.length > 0 && (
        <fieldset className="stack" style={{ gap: 4 }}>
          <legend className="small">Must-visit places (scheduled first)</legend>
          {places.map((place) => (
            <label key={place.id} className="inline small">
              <input
                type="checkbox"
                checked={mustVisit.includes(place.id)}
                onChange={(e) =>
                  setMustVisit(e.target.checked ? [...mustVisit, place.id] : mustVisit.filter((id) => id !== place.id))
                }
              />
              {place.name}
            </label>
          ))}
        </fieldset>
      )}

      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          Save preferences
        </button>
        {done && <span className="small muted">Saved. Regenerate the itinerary to apply changes.</span>}
      </div>
      <ErrorBanner error={error} />
    </form>
  );
}

function ReservationsSection({ trip, places }: { trip: Trip; places: CandidatePlace[] }) {
  const reservations = useApi("reservations.list", { params: { tripId: trip.id } });
  const [form, setForm] = useState({ title: "", date: trip.startDate, start: "19:00", end: "20:30", locked: true, placeId: "" });
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
        <h2>Bookings</h2>
        <p className="muted small">Locked bookings never move when the itinerary is generated or edited.</p>
      </div>
      <ErrorBanner error={reservations.error ?? error} />
      {reservations.data && items.length === 0 && <Empty title="No bookings yet" />}
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
        {items.map((r) => (
          <li key={r.id} className="row between">
            <span>
              <strong>
                {formatDay(r.start.slice(0, 10))} {r.start.slice(11)}–{r.end.slice(11)}
              </strong>{" "}
              {r.title} {r.locked && <Badge tone="warning">Locked</Badge>}
            </span>
            <button className="btn btn-danger btn-small" disabled={busy} onClick={() => remove(r.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form className="form-grid" onSubmit={add}>
        <label>
          Title
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Dinner at…" />
        </label>
        <label>
          Date
          <input
            type="date"
            required
            min={trip.startDate}
            max={trip.endDate}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <label>
          Start
          <input type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </label>
        <label>
          End
          <input type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </label>
        <label>
          Place (optional)
          <select value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })}>
            <option value="">None</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} />
          Locked
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Add booking
        </button>
      </form>
    </section>
  );
}
