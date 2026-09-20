"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatDateSpan, tripDays, todayIso } from "@/lib/trip-dates";

// Create a trip at /my-trip/new (design "Sky 3 · 03 Plan a new trip by country").
// A trip stays in one supported country, so travel times stay realistic.
// The design's "pick from your saves in this country" step needs saves that aren't tied to one trip:
// until then the page says what happens after the trip is created, rather than showing an empty picker.

export interface Country {
  name: string;
  timezone: string;
  cities: string[];
}

export const COUNTRIES: Country[] = [
  { name: "Japan", timezone: "Asia/Tokyo", cities: ["Tokyo", "Kyoto", "Osaka"] },
  { name: "South Korea", timezone: "Asia/Seoul", cities: ["Seoul", "Busan"] },
  { name: "Thailand", timezone: "Asia/Bangkok", cities: ["Bangkok", "Chiang Mai"] },
  { name: "Singapore", timezone: "Asia/Singapore", cities: ["Singapore"] },
  { name: "Taiwan", timezone: "Asia/Taipei", cities: ["Taipei", "Tainan"] },
  { name: "United Kingdom", timezone: "Europe/London", cities: ["London", "Edinburgh"] },
  { name: "France", timezone: "Europe/Paris", cities: ["Paris", "Lyon"] },
];

/** Timezones offered on the trip details page; one per supported country. */
export const TIMEZONES = COUNTRIES.map((c) => c.timezone);

const MAX_DAYS = 7;

export function CreateTripPage() {
  const router = useRouter();
  const [country, setCountry] = useState<Country>(COUNTRIES[0]!);
  const [city, setCity] = useState(COUNTRIES[0]!.cities[0]!);
  const [title, setTitle] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const days = startDate && endDate && endDate >= startDate ? tripDays(startDate, endDate) : 0;
  const tooLong = days > MAX_DAYS;
  const suggested = days ? `${days === 1 ? "A day" : `${days} days`} in ${city}` : `Four days in ${city}`;
  const ready = Boolean(city && startDate && endDate && days > 0 && !tooLong);

  function pickCountry(next: Country) {
    setCountry(next);
    setCity(next.cities[0]!);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await api("trips.create", {
        body: { title: title.trim() || suggested, destination: city, timezone: country.timezone, startDate, endDate },
      });
      router.push(`/my-trip/${trip.id}/setup`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  return (
    <form className="fit-page create-page" onSubmit={submit}>
      <header className="trips-head">
        <div>
          <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={16} /> My trips</Link>
          <h1>Plan a new trip</h1>
          <p className="trips-sub">One country, up to {MAX_DAYS} days. Hotel, pace and places come next.</p>
        </div>
      </header>

      <div className="create-layout panel-scroll fit-fill">
        <div className="create-steps">
          <section className="create-step" aria-labelledby="step-country">
            <h2 id="step-country"><span className="step-num">1</span> Country</h2>
            <ul className="country-grid">
              {COUNTRIES.map((c) => (
                <li key={c.name}>
                  <button type="button" className={`country-card${c.name === country.name ? " is-on" : ""}`} aria-pressed={c.name === country.name} onClick={() => pickCountry(c)}>
                    <strong>{c.name}</strong>
                    <span>{c.cities.join(", ")}</span>
                    {c.name === country.name && <Icon name="checkCircle" size={20} className="country-check" />}
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small"><Icon name="info" size={15} /> A trip stays in one country, so travel times stay realistic. More countries are coming.</p>
          </section>

          <section className="create-step" aria-labelledby="step-city">
            <h2 id="step-city"><span className="step-num">2</span> City</h2>
            <div className="city-chips" role="group" aria-label="City">
              {country.cities.map((c) => (
                <button key={c} type="button" aria-pressed={c === city} onClick={() => setCity(c)}>{c}</button>
              ))}
            </div>
            <label htmlFor="new-trip-city">
              Or another city in {country.name}
              <span className="field-icon"><Icon name="pin" size={18} /><input id="new-trip-city" required value={city} onChange={(e) => setCity(e.target.value)} /></span>
            </label>
          </section>

          <section className="create-step" aria-labelledby="step-when">
            <h2 id="step-when"><span className="step-num">3</span> When</h2>
            <div className="field-grid">
              <label htmlFor="new-trip-start">
                Start date
                <input id="new-trip-start" type="date" required min={todayIso()} value={startDate} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label htmlFor="new-trip-end">
                End date
                <input id="new-trip-end" type="date" required min={startDate || undefined} value={endDate} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <label className="span-2" htmlFor="new-trip-title">
                Name it (optional)
                <input id="new-trip-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} />
              </label>
            </div>
            {tooLong && <p className="banner banner-warning small">{days} days is longer than {MAX_DAYS}. Shorten the dates, or plan a second trip.</p>}
          </section>

          <section className="create-step is-next" aria-labelledby="step-next">
            <h2 id="step-next"><span className="step-num">4</span> Your places</h2>
            <p>After the trip exists, paste links, screenshots or notes into it and we look each place up. Saved places you already have live inside their own trip for now, so they can&apos;t be picked here yet.</p>
          </section>
        </div>

        <aside className="create-summary card" aria-label="Trip summary">
          <CoverArt seed={city} className="create-summary-cover" showLabel={false} caption="Illustrative cover" />
          <div className="create-summary-body">
            <h3>{title.trim() || suggested}</h3>
            <ul className="trip-facts">
              <li><Icon name="pin" size={18} /> {city}, {country.name}</li>
              <li><Icon name="calendar" size={18} /> {days ? `${formatDateSpan(startDate, endDate)} · ${days} ${days === 1 ? "day" : "days"}` : <span className="muted">Pick your dates</span>}</li>
              <li><Icon name="globe" size={18} /> {country.timezone}</li>
            </ul>
            <ErrorBanner error={error} />
            <button className="btn btn-primary btn-block btn-create" disabled={busy || !ready}>
              {busy ? "Creating…" : "Create trip"} <Icon name="arrowRight" size={18} />
            </button>
            <Link className="btn btn-ghost btn-block" href="/my-trip">Cancel</Link>
          </div>
        </aside>
      </div>
    </form>
  );
}
