import type { PublicStop } from "@reel/contracts";

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
