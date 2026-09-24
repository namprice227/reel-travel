"use client";

import type { PlanQuality, PublicStop } from "@reel/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";

// Dismissed advice is a per-browser convenience keyed by its text, so new advice (another trip or a regenerated
// plan with different wording) shows again. Storage may be blocked; the note then simply stays closable per visit.
const DISMISSED_KEY = "reel:dismissed-advice";
const adviceKey = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16);
};
function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function DismissibleNote({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  const key = adviceKey(text);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(readDismissed().includes(key)); }, [key]);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed().filter((item) => item !== key), key].slice(-50)));
    } catch { /* Storage may be blocked; stay hidden for this view only. */ }
  };
  return (
    <div className="banner banner-info planning-note" role="note">
      <div className="planning-note-head">
        <strong>{title}</strong>
        <button type="button" className="icon-btn planning-note-close" aria-label={`Dismiss ${title.toLowerCase()}`} title="Dismiss" onClick={dismiss}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function PlanningAdvice({ assumptions }: { assumptions: string[] }) {
  const seasonal = assumptions.find((s) => s.startsWith("Seasonal guidance"));
  const weather = assumptions.find((s) => s.startsWith("Weather outlook:"));
  return (
    <>
      {seasonal && <DismissibleNote title="Seasonal planning" text={seasonal} />}
      {weather && (
        <DismissibleNote title="Weather outlook" text={weather}>
          {weather.includes("forecast retrieved") && (
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Weather data by Open-Meteo
            </a>
          )}
        </DismissibleNote>
      )}
    </>
  );
}

export function SuggestedActivityDetails({ stop }: { stop: PublicStop }) {
  if (stop.kind !== "suggestion" && stop.kind !== "meal") return null;
  const query = stop.suggestedVenue
    ? stop.title
    : stop.kind === "meal"
      ? `restaurants ${stop.suggestedArea ?? ""}`
      : `${stop.title} ${stop.suggestedArea ?? ""}`;
  return (
    <div className="small" style={{ padding: "8px 12px" }}>
      <p>{stop.planningNote}</p>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${stop.suggestedVenue ? `&query_place_id=${encodeURIComponent(stop.suggestedVenue.providerPlaceId)}` : ""}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        Check{" "}
        {stop.suggestedVenue
          ? "venue"
          : stop.kind === "meal"
            ? "nearby restaurants"
            : "suggestion"}{" "}
        on Google Maps
      </a>
      <p className="muted">
        {stop.suggestedVenue
          ? `Suggested venue · ${stop.suggestedVenue.attribution} · retrieved ${new Date(stop.suggestedVenue.fetchedAt).toLocaleDateString()}. ${stop.hoursCheck === "unknown" ? "No hours listed; check before going" : "Regular hours checked"}; travel is estimated where locations are known. Verify special hours and availability. Not booked.`
          : "Suggested timing · location, travel and availability need checking."}
      </p>
    </div>
  );
}

/** Private saved-place diagnostics; deliberately excluded from the public share projection. */
export function PracticalAdvice({ quality }: { quality?: PlanQuality }) {
  if (!quality) return null;
  return (
    <details className="banner banner-info">
      <summary>
        <strong>Plan review</strong> · {quality.savedPlacesScheduled}/{quality.savedPlacesTotal} saved places included
        {quality.issues.length > 0 ? ` · ${quality.issues.length} trade-off${quality.issues.length === 1 ? "" : "s"} to review` : " · no practical issues flagged"}
      </summary>
      <p>Practical fit: {quality.score}/100. This is a planning estimate, separate from opening-hours and travel checks.</p>
      {quality.repairApplied && <p>The plan was automatically adjusted to improve its practical fit.</p>}
      {quality.issues.map((issue, index) => (
        <div key={`${issue.code}-${index}`}>
          <p><strong>{issue.date ? `${issue.date}: ` : ""}{issue.message}</strong></p>
          <ul>{issue.alternatives.map(option => <li key={option}>{option}</li>)}</ul>
        </div>
      ))}
      {quality.issues.length > 0 && <p>These are options to review, not automatic changes. Use Edit itinerary or Trip setup, then regenerate when ready; fixed bookings stay protected.</p>}
    </details>
  );
}
