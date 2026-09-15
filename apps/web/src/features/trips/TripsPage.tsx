"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Empty, ErrorBanner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatRange } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// F3 trip list (UI: Member 1). Endpoints: trips.list, trips.create.

const TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Bangkok", "Asia/Singapore", "Asia/Taipei", "Europe/London", "Europe/Paris"];

export function TripsPage() {
  const trips = useApi("trips.list", {});

  return (
    <div className="stack trips-page">
      <div className="page-heading row between">
        <div><p className="kicker">My trips</p><h1>Where are you going?</h1><p className="muted">Open a plan or start a new one.</p></div>
        <a className="btn btn-primary btn-large" href="#new-trip">Create a trip</a>
      </div>
      <ErrorBanner error={trips.error} />
      {trips.loading && !trips.data ? (
        <Loading />
      ) : trips.data?.trips.length === 0 ? (
        <Empty title="No trips yet">Create one to start saving inspiration.</Empty>
      ) : (
        <div className="trip-grid">
          {trips.data?.trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}/itinerary`} className="card trip-card">
              <div className="trip-card-cover" aria-hidden="true"><span>{trip.destination}</span></div>
              <h3>{trip.title}</h3>
              <p className="muted">
                {trip.destination} · {formatRange(trip.startDate, trip.endDate)}
              </p>
              <div className="row between">{trip.currentItineraryVersion ? <Badge tone="success">Itinerary v{trip.currentItineraryVersion}</Badge> : <Badge>Setup</Badge>}<strong className="open-trip">Open →</strong></div>
            </Link>
          ))}
        </div>
      )}
      <CreateTripForm />
    </div>
  );
}

function CreateTripForm() {
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
      router.push(`/trips/${trip.id}/setup`);
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  return (
    <form id="new-trip" className="card stack create-trip-form" onSubmit={submit}>
      <div><p className="kicker">New trip</p><h2>Start with the basics.</h2></div>
      <div className="form-grid">
        <label>
          Title
          <input required value={form.title} onChange={set("title")} placeholder="Tokyo long weekend" />
        </label>
        <label>
          Destination
          <input required value={form.destination} onChange={set("destination")} />
        </label>
        <label>
          Timezone
          <input required list="timezones" value={form.timezone} onChange={set("timezone")} />
          <datalist id="timezones">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
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
          Create trip
        </button>
      </div>
      <ErrorBanner error={error} />
    </form>
  );
}
