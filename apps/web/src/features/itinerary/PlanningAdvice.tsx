import type { PlanQuality, PublicStop } from "@reel/contracts";

export function PlanningAdvice({ assumptions }: { assumptions: string[] }) {
  const seasonal = assumptions.find((s) => s.startsWith("Seasonal guidance"));
  const weather = assumptions.find((s) => s.startsWith("Weather outlook:"));
  return (
    <>
      {seasonal && (
        <div className="banner banner-info" role="note">
          <strong>Seasonal planning</strong>
          <p>{seasonal}</p>
        </div>
      )}
      {weather && (
        <div className="banner banner-info" role="note">
          <strong>Weather outlook</strong>
          <p>{weather}</p>
          {weather.includes("forecast retrieved") && (
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Weather data by Open-Meteo
            </a>
          )}
        </div>
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
          ? `Suggested venue · ${stop.suggestedVenue.attribution} · retrieved ${new Date(stop.suggestedVenue.fetchedAt).toLocaleDateString()}. Regular hours checked; travel is estimated where locations are known. Verify special hours and availability. Not booked.`
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
