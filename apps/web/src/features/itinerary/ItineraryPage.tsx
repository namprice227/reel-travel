"use client";

import type { Conflict, ItineraryEdit } from "@reel/contracts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { MagazineView } from "@/features/magazine/MagazineView";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys } from "@/features/notes/notes-store";
import { api, ApiError } from "@/lib/api-client";
import { formatDay } from "@/lib/format";
import { formatDateSpan } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";
import { ItineraryMap } from "./ItineraryMap";
import { placeInfoFromCandidates } from "./place-info";
import { TimelineView } from "./TimelineView";

// F4 generate/edit + F5 three views (UI: Member 2, server: Member 4).
// Routes: /my-trip/:tripId/itinerary (magazine), /timeline (edit), /map. `?day=N` keeps the selected day across views.
// All three views receive the SAME itinerary object from itinerary.get, so they always show one version.
// Layout follows the "itinerary0" reference and fits one laptop screen: compact header, one tab row, then the view.

export type ItineraryViewName = "itinerary" | "timeline" | "map";

const VIEWS: Array<{ view: ItineraryViewName; label: string; icon: "magazine" | "timeline" | "map" }> = [
  { view: "itinerary", label: "Magazine", icon: "magazine" },
  { view: "timeline", label: "Timeline", icon: "timeline" },
  { view: "map", label: "Map", icon: "map" },
];

export function ItineraryPage({ tripId, view, day }: { tripId: string; view: ItineraryViewName; day?: string }) {
  const params = { tripId };
  const router = useRouter();
  const pathname = usePathname();
  const itinerary = useApi("itinerary.get", { params });
  const trip = useApi("trips.get", { params });
  const confirmed = useApi("places.list", { params, query: { status: "confirmed" } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const current = itinerary.data?.itinerary ?? null;

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e));
      setError(apiError);
      if (apiError.code === "STALE_VERSION") await itinerary.reload();
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    mutate(async () => {
      const result = await api("itinerary.generate", { params, body: { expectedVersion: current?.version ?? null } });
      itinerary.setData({ itinerary: result.itinerary, stale: false });
    });

  const edit = (change: ItineraryEdit) =>
    mutate(async () => {
      if (!current) return;
      const result = await api("itinerary.edit", { params, body: { expectedVersion: current.version, edit: change } });
      itinerary.setData({ itinerary: result.itinerary, stale: itinerary.data?.stale ?? false });
    });

  if (itinerary.error) return <ErrorBanner error={itinerary.error} />;
  if (!itinerary.data || !trip.data) return <Loading />;

  const t = trip.data.trip;
  const dayCount = current?.days.length ?? 0;
  const requested = Number.parseInt(day ?? "1", 10);
  const dayIndex = Number.isFinite(requested) ? Math.min(Math.max(requested - 1, 0), Math.max(dayCount - 1, 0)) : 0;
  const selectDay = (index: number) => router.replace(`${pathname}?day=${index + 1}`, { scroll: false });
  const places = placeInfoFromCandidates(confirmed.data?.places ?? []);
  const placeNames = new Map((confirmed.data?.places ?? []).map((p) => [p.id, p.name]));
  const rejected = error?.code === "EDIT_REJECTED" ? ((error.details as { conflicts?: Conflict[] } | undefined)?.conflicts ?? []) : [];
  const dayQuery = `?day=${dayIndex + 1}`;

  return (
    <div className="fit-page itinerary-page">
      <header className="itin-head">
        <div className="itin-head-text">
          <Link href="/my-trip" className="back-link"><Icon name="arrowLeft" size={16} /> My trips</Link>
          <h1>{t.title}</h1>
          <p className="itin-dates">{formatDateSpan(t.startDate, t.endDate)} · {t.timezone}</p>
        </div>
        <div className="itin-banner">
          <CoverArt seed={t.destination} className="itin-cover" caption={`${t.destination} · illustrative`} showLabel={false} />
          <div className="itin-banner-actions">
            {view === "timeline" || !current ? (
              <button className="btn btn-primary btn-small" disabled={busy} onClick={generate}>
                <Icon name="sparkle" size={16} /> {current ? "Regenerate" : "Generate itinerary"}
              </button>
            ) : (
              <Link className="btn btn-primary btn-small" href={`/my-trip/${tripId}/timeline${dayQuery}`}><Icon name="edit" size={16} /> Edit</Link>
            )}
            <Link className="btn btn-small itin-banner-btn" href={`/my-trip/${tripId}/share`}><Icon name="share" size={16} /> Share</Link>
            <NoteButton tripId={tripId} noteKey={noteKeys.trip()} subject={t.title} />
            <details className="menu itin-more">
              <summary className="icon-btn itin-banner-btn" aria-label="More trip pages"><Icon name="more" /></summary>
              <div className="menu-list">
                <Link href={`/my-trip/${tripId}/places`}><Icon name="pin" size={16} /> Places</Link>
                <Link href={`/my-trip/${tripId}/setup`}><Icon name="calendar" size={16} /> Trip details</Link>
                <Link href={`/inspiration-library?trip=${tripId}`}><Icon name="library" size={16} /> Saves</Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <nav className="itin-tabbar" aria-label="Itinerary views and trip sections">
        {current && (
          <div className="tabs itin-tabs">
            {VIEWS.map((v) => (
              <Link key={v.view} href={`/my-trip/${tripId}/${v.view}${dayQuery}`} className={view === v.view ? "active" : undefined} aria-current={view === v.view ? "page" : undefined}>
                <Icon name={v.icon} size={17} /> {v.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {itinerary.data.stale && current && (
        <div className="banner banner-warning itin-banner-note">
          <span>Trip details or places changed. Regenerate to update this itinerary.</span>
          <button className="btn btn-small btn-outline" disabled={busy} onClick={generate}>Regenerate</button>
        </div>
      )}
      {error && error.code !== "EDIT_REJECTED" && <ErrorBanner error={error} />}
      {rejected.length > 0 && (
        <div className="banner banner-danger stack" style={{ gap: 4 }} role="alert">
          <strong>Edit not saved</strong>
          {rejected.map((conflict, i) => (
            <span key={i}>{conflict.message} {conflict.suggestion}</span>
          ))}
        </div>
      )}

      <div className="itin-body fit-fill">
        {!current ? (
          <Empty title="Nothing planned yet">Confirm places (and add bookings) first, then generate your itinerary.</Empty>
        ) : view === "itinerary" ? (
          <MagazineView
            trip={t}
            itinerary={current}
            places={places}
            dayIndex={dayIndex}
            onSelectDay={selectDay}
            tripId={tripId}
            mapHref={`/my-trip/${tripId}/map${dayQuery}`}
          />
        ) : view === "timeline" ? (
          <TimelineView
            itinerary={current}
            places={places}
            dayIndex={dayIndex}
            onSelectDay={selectDay}
            tripId={tripId}
            busy={busy}
            onEdit={{
              move: (stopId, toDate, toIndex) => void edit({ type: "move_stop", stopId, toDate, toIndex }),
              remove: (stopId) => void edit({ type: "remove_stop", stopId }),
            }}
            aside={
              current.unscheduledPlaceIds.length > 0 && (
                <UnscheduledPlaces
                  placeIds={current.unscheduledPlaceIds}
                  names={placeNames}
                  dates={current.days.map((d) => d.date)}
                  defaultDate={current.days[dayIndex]?.date ?? ""}
                  busy={busy}
                  onAdd={(placeId, date) => void edit({ type: "add_place", placeId, date, index: Number.MAX_SAFE_INTEGER })}
                />
              )
            }
          />
        ) : (
          <ItineraryMap
            itinerary={current}
            places={places}
            dayIndex={dayIndex}
            onSelectDay={selectDay}
            tripId={tripId}
            timelineHref={`/my-trip/${tripId}/timeline${dayQuery}`}
          />
        )}
      </div>
    </div>
  );
}

function UnscheduledPlaces({
  placeIds,
  names,
  dates,
  defaultDate,
  busy,
  onAdd,
}: {
  placeIds: string[];
  names: Map<string, string>;
  dates: string[];
  defaultDate: string;
  busy: boolean;
  onAdd: (placeId: string, date: string) => void;
}) {
  const [date, setDate] = useState(defaultDate || dates[0] || "");
  return (
    <section className="card side-card">
      <h3 className="side-card-title">Not scheduled · {placeIds.length}</h3>
      <p className="muted small">Confirmed places that didn&apos;t fit. Add one to the end of a day.</p>
      <label className="small" htmlFor="unscheduled-day">
        Add to
        <select id="unscheduled-day" value={date} onChange={(e) => setDate(e.target.value)}>
          {dates.map((d, i) => (
            <option key={d} value={d}>Day {i + 1} · {formatDay(d)}</option>
          ))}
        </select>
      </label>
      <ul className="unscheduled-list">
        {placeIds.map((id) => (
          <li key={id}>
            <Icon name="pin" size={18} />
            <span>{names.get(id) ?? id}</span>
            <button className="btn btn-small btn-outline" disabled={busy} onClick={() => onAdd(id, date)}>Add</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
