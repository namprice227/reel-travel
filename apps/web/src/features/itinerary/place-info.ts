import type { CandidatePlace, PublicStop, SharedPlace } from "@reel/contracts";
import type { Tone } from "@/components/ui";

// Display facts for itinerary stops. Stops only carry a placeId, so views look up category and address
// from confirmed places (owner) or the shared projection (viewer). Never invented.

export interface PlaceInfo {
  category: string | null;
  provider?: string;
  attribution?: string;
  address: string | null;
}

export type PlaceInfoMap = Map<string, PlaceInfo>;

export const placeInfoFromCandidates = (places: CandidatePlace[]): PlaceInfoMap =>
  new Map(places.map((p) => [p.id, { provider: p.selected?.details.provider, attribution: p.selected?.details.attribution, category: p.selected?.details.category ?? null, address: p.selected?.address ?? null }]));

export const placeInfoFromShared = (places: SharedPlace[]): PlaceInfoMap =>
  new Map(places.map((p) => [p.id, { category: p.category, address: p.address, provider: p.provider, attribution: p.attribution }]));

export const infoFor = (stop: PublicStop, places: PlaceInfoMap): PlaceInfo | undefined => (stop.placeId ? places.get(stop.placeId) : undefined);

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Secondary line under a stop title: address, else category, else what kind of stop it is. */
export function stopSubtitle(stop: PublicStop, places: PlaceInfoMap): string {
  if (stop.kind === "break") return "Time to rest at your own pace";
  const info = infoFor(stop, places);
  const attribution = info?.attribution ? ` - ${info.attribution}` : "";
  if (info?.address) return info.address + attribution;
  if (info?.category) return capitalize(info.category) + attribution;
  if (stop.kind === "reservation") return "Your booking";
  return (stop.location ? "Location from your saved place" : "Location unavailable") + attribution;
}

/** Status chip for a stop, or null when there is nothing to flag. */
export function stopStatus(stop: PublicStop): { label: string; tone: Tone; icon: "lock" | "clock" | "alert" | "checkCircle" } | null {
  if (stop.kind === "reservation") return { label: stop.locked ? "Fixed booking" : "Booking", tone: "info", icon: "lock" };
  if (stop.hoursCheck === "unknown") return { label: "Hours not checked", tone: "neutral", icon: "clock" };
  if (stop.hoursCheck === "closed") return { label: "Closed at this time", tone: "danger", icon: "alert" };
  if (stop.hoursCheck === "open") return { label: "Open at this time", tone: "success", icon: "checkCircle" };
  return null;
}
