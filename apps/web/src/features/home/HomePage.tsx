"use client";

import type { Inspiration, PublicItinerary, Trip } from "@reel/contracts";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoverArt, StopArt } from "@/components/Illustration";
import { Empty, ErrorBanner, Loading } from "@/components/ui";
import { validationStatus } from "@/lib/format";
import { formatDateSpan, tripDays, tripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// Signed-in Home (/home). Arrangement follows the "Home page" reference: hero with a live trip card,
// three workflow steps, then an inspiration-to-trip strip. All content comes from the API.

export function HomePage() {
  const trips = useApi("trips.list", {});
  const list = trips.data?.trips ?? [];
  const active = list.find((t) => tripGroup(t) !== "past") ?? list[0];
  const params = active ? { params: { tripId: active.id } } : null;
  const itinerary = useApi("itinerary.get", params);
  const saves = useApi("inspirations.list", params);
  const places = useApi("places.list", params);

  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data) return <Loading />;

  if (!active) {
    return (
      <div className="home-page">
        <section className="home-hero">
          <div className="home-copy">
            <p className="kicker">Home</p>
            <h1>Your saved places.<br />A trip that works.</h1>
            <p className="home-lede">Turn travel links, notes and screenshots into places you confirm and days you can edit.</p>
            <Link className="btn btn-primary btn-large" href="/my-trip/new">Create your first trip <Icon name="arrowRight" size={18} /></Link>
          </div>
          <CoverArt seed="home" className="home-hero-art" caption="Where will your saves take you?" />
        </section>
      </div>
    );
  }

  const all = places.data?.places ?? [];
  const confirmed = all.filter((p) => p.status === "confirmed");
  const toReview = all.filter((p) => p.status === "pending" || p.status === "ambiguous").length;
  const saveList = saves.data?.inspirations ?? [];
  const needsDetails = saveList.filter((s) => s.status === "needs_input" || s.status === "failed").length;
  const plan = itinerary.data?.itinerary ?? null;
  const base = `/my-trip/${active.id}`;

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-copy">
          <p className="kicker">Home</p>
          <h1>Your saved places.<br />A trip that works.</h1>
          <p className="home-lede">Pick up {active.title}, or save something new you want to see.</p>
          <div className="row">
            <Link className="btn btn-primary btn-large" href={`${base}/itinerary`}>Continue planning <Icon name="arrowRight" size={18} /></Link>
            <Link className="btn btn-outline btn-large" href={`/inspiration-library?trip=${active.id}#add`}>Add inspiration</Link>
          </div>
          <p className="home-signature">Ideas to days, with you in control.</p>
        </div>

        <div className="home-hero-visual">
          <CoverArt seed={active.destination} className="home-hero-art" caption={`${active.destination} · illustrative`} showLabel={false} />
          <HeroTripCard trip={active} itinerary={plan} placeNames={new Map(confirmed.map((p) => [p.id, p.selected?.details.category ?? null]))} />
        </div>
      </section>

      <section className="home-steps" id="how-it-works">
        <Step n="01" icon="link" title="Save inspiration" href={`/inspiration-library?trip=${active.id}`}>
          {saves.data ? `${saveList.length} saves${needsDetails ? ` · ${needsDetails} need details` : ""}` : "Links, notes and screenshots"}
        </Step>
        <Step n="02" icon="check" title="Confirm places" href={`${base}/places`}>
          {places.data ? `${confirmed.length} confirmed${toReview ? ` · ${toReview} to review` : ""}` : "Choose the right match"}
        </Step>
        <Step n="03" icon="calendar" title="Shape your days" href={`${base}/timeline`}>
          {plan ? `Version ${plan.version} · ${validationStatus[plan.validationStatus].label}` : "Generate, then edit your days"}
        </Step>
      </section>

      <section className="home-flow card">
        <div className="row between">
          <h2>From inspiration to your trip</h2>
          <Link href={`${base}/itinerary`} className="link-arrow">See how it comes together <Icon name="arrowRight" size={16} /></Link>
        </div>
        <div className="home-flow-grid">
          <FlowCard caption="Links, notes, screenshots …" href={`/inspiration-library?trip=${active.id}`}>
            <p className="flow-title">Latest saves</p>
            {saveList.length === 0 ? <p className="muted small">Nothing saved yet.</p> : saveList.slice(0, 3).map((s) => <SaveLine key={s.id} save={s} />)}
          </FlowCard>
          <FlowCard caption="… become a clear list …" href={`${base}/places`}>
            <p className="flow-title">Your places</p>
            {confirmed.length === 0 ? <p className="muted small">No confirmed places yet.</p> : confirmed.slice(0, 3).map((p) => (
              <div key={p.id} className="flow-line">
                <StopArt category={p.selected?.details.category} size="sm" />
                <span><strong>{p.name}</strong><small>{p.selected?.address ?? p.selected?.details.category ?? "Confirmed"}</small></span>
              </div>
            ))}
          </FlowCard>
          <FlowCard caption="… that you can arrange …" href={`${base}/timeline`}>
            <p className="flow-title">Plan your days</p>
            {plan ? <DayPreview itinerary={plan} compact /> : <p className="muted small">Generate an itinerary to see your days.</p>}
          </FlowCard>
          <Link href={`${base}/itinerary`} className="flow-card flow-card-art">
            <CoverArt seed={`${active.destination}-flow`} caption="A trip that feels like you." />
            <span className="flow-caption">… into a trip that works.</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function HeroTripCard({ trip, itinerary, placeNames }: { trip: Trip; itinerary: PublicItinerary | null; placeNames: Map<string, string | null> }) {
  const [dayIndex, setDayIndex] = useState(0);
  const day = itinerary?.days[dayIndex];
  return (
    <article className="hero-trip-card">
      <div className="row between">
        <span className="pill pill-info">Your trip</span>
        {itinerary && <span className="pill"><span className={`status-dot is-${validationStatus[itinerary.validationStatus].tone}`} />{validationStatus[itinerary.validationStatus].label}</span>}
      </div>
      <h2>{trip.title}</h2>
      <p className="muted small">{tripDays(trip.startDate, trip.endDate)} days · {trip.destination} · {formatDateSpan(trip.startDate, trip.endDate)}</p>
      {!itinerary ? (
        <Empty title="No itinerary yet"><Link href={`/my-trip/${trip.id}/timeline`}>Generate your days</Link></Empty>
      ) : (
        <>
          <div className="day-pills" role="tablist" aria-label="Trip days">
            {itinerary.days.slice(0, 4).map((d, i) => (
              <button key={d.date} role="tab" aria-selected={i === dayIndex} className={i === dayIndex ? "active" : undefined} onClick={() => setDayIndex(i)}>
                Day {i + 1}
                <small>{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</small>
              </button>
            ))}
          </div>
          <ul className="hero-stops">
            {(day?.stops ?? []).filter((s) => s.kind !== "break").slice(0, 3).map((stop) => (
              <li key={stop.id}>
                <span className={`hero-check${stop.hoursCheck === "unknown" ? " is-open" : ""}`} aria-hidden="true">{stop.hoursCheck !== "unknown" && <Icon name="check" size={14} />}</span>
                <StopArt category={stop.placeId ? placeNames.get(stop.placeId) : null} kind={stop.kind} size="sm" />
                <span>
                  <strong>{stop.title}</strong>
                  <small>{stop.start}–{stop.end} · {stop.kind === "reservation" ? <em className="text-primary">Fixed booking</em> : stop.hoursCheck === "unknown" ? "Hours not checked" : "Checked"}</small>
                </span>
              </li>
            ))}
            {day && day.stops.length === 0 && <li className="muted small">Free day.</li>}
          </ul>
          <Link className="link-arrow" href={`/my-trip/${trip.id}/itinerary?day=${dayIndex + 1}`}>Open Day {dayIndex + 1} <Icon name="arrowRight" size={16} /></Link>
        </>
      )}
    </article>
  );
}

/** Static preview; it sits inside a card link, so it must not contain links itself. */
function DayPreview({ itinerary, compact }: { itinerary: PublicItinerary; compact?: boolean }) {
  const day = itinerary.days[0];
  return (
    <div className={compact ? "day-preview is-compact" : "day-preview"}>
      <div className="day-pills" aria-hidden="true">
        {itinerary.days.slice(0, 4).map((d, i) => (
          <span key={d.date} className={i === 0 ? "active" : undefined}>Day {i + 1}</span>
        ))}
      </div>
      {day?.stops.filter((s) => s.kind !== "break").slice(0, 3).map((stop) => (
        <div key={stop.id} className="flow-line">
          <span className="drag-dots" aria-hidden="true">⋮⋮</span>
          <span><strong>{stop.title}</strong><small>{stop.start}</small></span>
        </div>
      ))}
    </div>
  );
}

function SaveLine({ save }: { save: Inspiration }) {
  const icon = save.sourceType === "link" ? "link" : save.sourceType === "screenshot" ? "image" : "text";
  const label = save.url ?? save.text ?? "Screenshot";
  return (
    <div className="flow-line">
      <span className="flow-icon"><Icon name={icon} size={16} /></span>
      <span><strong className="truncate">{label}</strong><small>{save.sourceType}</small></span>
    </div>
  );
}

function Step({ n, icon, title, href, children }: { n: string; icon: "link" | "check" | "calendar"; title: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="home-step">
      <span className="step-number">{n}</span>
      <span className="step-icon"><Icon name={icon} size={24} /></span>
      <span><strong>{title}</strong><small>{children}</small></span>
    </Link>
  );
}

function FlowCard({ caption, href, children }: { caption: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flow-card">
      <div className="flow-card-body">{children}</div>
      <span className="flow-caption">{caption}</span>
    </Link>
  );
}
