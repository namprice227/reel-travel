import type { PublicStop } from "@reel/contracts";

export function PlanningAdvice({ assumptions }: { assumptions: string[] }) {
  const seasonal = assumptions.find(s => s.startsWith("Seasonal guidance"));
  return seasonal ? <div className="banner banner-info" role="note"><strong>Seasonal planning</strong><p>{seasonal}</p></div> : null;
}

export function SuggestedActivityDetails({ stop }: { stop: PublicStop }) {
  if (stop.kind !== "suggestion" && stop.kind !== "meal") return null;
  const query = stop.kind === "meal" ? `restaurants ${stop.suggestedArea ?? ""}` : `${stop.title} ${stop.suggestedArea ?? ""}`;
  return <div className="small" style={{ padding: "8px 12px" }}>
    <p>{stop.planningNote}</p>
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer noopener">Check {stop.kind === "meal" ? "nearby restaurants" : "suggestion"} on Google Maps</a>
    <p className="muted">Suggested timing · location, travel and availability need checking.</p>
  </div>;
}
