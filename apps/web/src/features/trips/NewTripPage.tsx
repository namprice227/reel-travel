"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// F3 trip creation at /my-trip/new. Endpoint: trips.create. New trips open Trip details next.

export const TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Bangkok", "Asia/Singapore", "Asia/Taipei", "Europe/London", "Europe/Paris"];

export function NewTripPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "", endDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { trip } = await api("trips.create", { body: form });
      router.push(`/my-trip/${trip.id}/setup`);
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  return (
    <div className="new-trip-page">
      <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={18} /> My trips</Link>
      <div className="new-trip-grid">
        <form className="card stack" onSubmit={submit}>
          <div>
            <p className="kicker">New trip</p>
            <h1 className="card-title">Start with the basics</h1>
            <p className="muted">Destination, dates and timezone. Add preferences and bookings next.</p>
          </div>
          <div className="field-grid">
            <label className="span-2">
              Title
              <input required value={form.title} onChange={set("title")} placeholder="Four days in Tokyo" />
            </label>
            <label>
              Destination
              <span className="field-icon"><Icon name="pin" size={18} /><input required value={form.destination} onChange={set("destination")} /></span>
            </label>
            <label>
              Timezone
              <span className="field-icon">
                <Icon name="globe" size={18} />
                <select required value={form.timezone} onChange={set("timezone")}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </span>
            </label>
            <label>
              Start date
              <input type="date" required value={form.startDate} onChange={set("startDate")} />
            </label>
            <label>
              End date
              <input type="date" required value={form.endDate} onChange={set("endDate")} />
            </label>
          </div>
          <p className="muted small">Trips can be up to 7 days.</p>
          <ErrorBanner error={error} />
          <div className="row">
            <button className="btn btn-primary btn-large" disabled={busy}>Create trip</button>
            <Link className="btn btn-ghost btn-large" href="/my-trip">Cancel</Link>
          </div>
        </form>
        <CoverArt seed={form.destination || "new trip"} className="new-trip-art" caption="Same saves. More places." />
      </div>
    </div>
  );
}
