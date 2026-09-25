"use client";

import { MAX_TRIP_DAYS, SUPPORTED_COUNTRIES, type Trip } from "@reel/contracts";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Badge, ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { addDays, todayIso, tripDays } from "@/lib/trip-dates";

/**
 * A trip drafted automatically from a video itinerary has places but no dates. Planning, stays and sharing
 * wait for the traveler's dates; the video's day grouping is kept as a hint for the itinerary.
 */
export function DraftTripBanner({ trip, onAddDates }: { trip: Trip; onAddDates: () => void }) {
  const days = trip.draft?.tripDays;
  return (
    <div className="banner banner-info small" role="status">
      <Icon name="sparkle" size={16} />
      <span>
        Drafted from a video itinerary{days ? ` (${days} ${days === 1 ? "day" : "days"})` : ""}. Review the places,
        then add your travel dates to plan it. The video&apos;s day plan is used as a starting point.
      </span>
      <button type="button" className="btn btn-small" onClick={onAddDates}>Add dates</button>
    </div>
  );
}

export function DraftDatesCard({ trip, onSaved }: { trip: Trip; onSaved: (trip: Trip) => void }) {
  const today = todayIso();
  const sourceDays = trip.draft?.tripDays ?? null;
  const length = Math.min(sourceDays ?? 3, MAX_TRIP_DAYS);
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [timezone, setTimezone] = useState(trip.timezone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const days = startDate && endDate && endDate >= startDate ? tripDays(startDate, endDate) : 0;
  const invalid = !startDate || !endDate || endDate < startDate || days > MAX_TRIP_DAYS || !timezone;

  function pickStart(value: string) {
    setStartDate(value);
    // Follow the video's length until the traveler picks an end date themselves.
    if (value && (!endDate || endDate < value)) setEndDate(addDays(value, length - 1));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const { trip: updated } = await api("trips.update", {
        params: { tripId: trip.id },
        body: { expectedUpdatedAt: trip.updatedAt, startDate, endDate, timezone },
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  return (
    <section className="builder-page" aria-labelledby="draft-dates-title">
      <header className="builder-head">
        <div className="builder-head-row"><h1 id="draft-dates-title">Choose dates</h1><Badge tone="neutral">Draft</Badge></div>
        <p>
          This trip was drafted from a video itinerary{sourceDays ? ` covering ${sourceDays} ${sourceDays === 1 ? "day" : "days"}` : ""}.
          Add your dates to choose stays and plan the days.
          {sourceDays && sourceDays > MAX_TRIP_DAYS ? ` Trips plan up to ${MAX_TRIP_DAYS} days, so pick the part you will travel.` : ""}
        </p>
      </header>

      <ErrorBanner error={error} />

      <form className="card stack" onSubmit={save}>
        <div className="hotel-range">
          <Icon name="calendar" size={17} />
          <label htmlFor="draft-start">
            <span className="sr-only">First day</span>
            <input id="draft-start" type="date" min={today} value={startDate} onChange={(e) => pickStart(e.target.value)} required />
          </label>
          <Icon name="arrowRight" size={15} className="hotel-range-arrow" />
          <label htmlFor="draft-end">
            <span className="sr-only">Last day</span>
            <input id="draft-end" type="date" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
          <span className="hotel-nights">{days ? `${days} ${days === 1 ? "day" : "days"}` : "Pick dates"}</span>
        </div>
        {!trip.timezone && (
          <label htmlFor="draft-timezone">
            Country
            <span className="field-icon">
              <Icon name="globe" size={18} />
              <select id="draft-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
                <option value="">Choose the country</option>
                {SUPPORTED_COUNTRIES.map((country) => <option key={country.name} value={country.timezone}>{country.name}</option>)}
              </select>
            </span>
          </label>
        )}
        {days > MAX_TRIP_DAYS && <p className="small muted">Trips can be at most {MAX_TRIP_DAYS} days.</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || invalid}>
            {busy ? "Saving…" : "Save dates"}
          </button>
        </div>
      </form>
    </section>
  );
}
