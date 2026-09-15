"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// F3 trip creation (Member 1). Endpoint: trips.create. /my-trip/new opens this as a panel over My trips;
// a new trip goes straight to Trip details.

export const TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Bangkok", "Asia/Singapore", "Asia/Taipei", "Europe/London", "Europe/Paris"];

export function CreateTripDrawer() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const close = () => dialog.current?.close();
  // A click on the backdrop lands on the dialog element itself.
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <dialog ref={dialog} className="create-drawer" aria-labelledby="create-trip-title" onClose={() => router.push("/my-trip")} onClick={onBackdrop}>
      <div className="create-drawer-body">
        <div className="create-drawer-head">
          <h2 id="create-trip-title">Create trip</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close create trip"><Icon name="close" /></button>
        </div>
        <p className="muted">Start with the basics. You'll add preferences and bookings next.</p>
        <CreateTripForm onCancel={close} />
      </div>
    </dialog>
  );
}

export function CreateTripForm({ onCancel }: { onCancel: () => void }) {
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
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  return (
    <form className="create-trip-form" onSubmit={submit}>
      <div className="field-grid">
        <label className="span-2" htmlFor="new-trip-title">
          Title
          <input id="new-trip-title" required autoFocus value={form.title} onChange={set("title")} placeholder="Four days in Tokyo" />
        </label>
        <label htmlFor="new-trip-destination">
          Destination
          <span className="field-icon"><Icon name="pin" size={18} /><input id="new-trip-destination" required value={form.destination} onChange={set("destination")} /></span>
        </label>
        <label htmlFor="new-trip-timezone">
          Timezone
          <span className="field-icon">
            <Icon name="globe" size={18} />
            <select id="new-trip-timezone" required value={form.timezone} onChange={set("timezone")}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </span>
        </label>
        <label htmlFor="new-trip-start">
          Start date
          <input id="new-trip-start" type="date" required value={form.startDate} onChange={set("startDate")} />
        </label>
        <label htmlFor="new-trip-end">
          End date
          <input id="new-trip-end" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={set("endDate")} />
        </label>
      </div>
      <p className="muted small">Trips can be up to 7 days.</p>
      <ErrorBanner error={error} />
      <div className="create-trip-actions">
        <button className="btn btn-primary" disabled={busy}>Create and add details</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
