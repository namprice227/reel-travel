import type { LatLng } from "@reel/contracts";

export interface MapPoint {
  position: LatLng;
  label?: string;
  name?: string;
  placeId?: string;
}

/**
 * Builds a Google Maps search URL for a single location or place.
 */
export function getGoogleMapsPlaceUrl(params: {
  name?: string;
  address?: string;
  location?: LatLng;
  placeId?: string;
  providerUrl?: string;
}): string {
  if (params.providerUrl) {
    try {
      const url = new URL(params.providerUrl);
      if (url.protocol === "https:" && !url.username && !url.password && (
        ((url.hostname === "www.google.com" || url.hostname === "google.com") && url.pathname.startsWith("/maps")) ||
        url.hostname === "maps.google.com" || url.hostname === "maps.app.goo.gl" ||
        (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
      )) return url.href;
    } catch { /* Fall through to a coordinate/place-ID link. */ }
  }
  if (params.location) {
    const latLng = `${params.location.lat},${params.location.lng}`;
    const query = latLng;
    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (params.placeId) {
      url += `&query_place_id=${encodeURIComponent(params.placeId)}`;
    }
    return url;
  }
  const query = [params.name, params.address].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "https://www.google.com/maps";
}

/**
 * Builds a Google Maps directions URL between an origin and destination.
 */
export function getGoogleMapsDirectionsUrl(params: {
  destination: LatLng;
  destinationName?: string;
  origin?: LatLng;
  originName?: string;
  mode?: "walking" | "transit" | "driving";
}): string {
  const dest = `${params.destination.lat},${params.destination.lng}`;
  let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  if (params.origin) {
    url += `&origin=${params.origin.lat},${params.origin.lng}`;
  }
  if (params.mode) {
    url += `&travelmode=${params.mode}`;
  }
  return url;
}

/**
 * Builds a multi-stop itinerary route in Google Maps using origin, destination, and waypoints.
 */
export function getGoogleMapsRouteUrl(points: MapPoint[]): string | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) {
    return getGoogleMapsPlaceUrl({
      name: points[0].label || points[0].name,
      location: points[0].position,
      placeId: points[0].placeId,
    });
  }

  const origin = `${points[0].position.lat},${points[0].position.lng}`;
  const dest = `${points[points.length - 1].position.lat},${points[points.length - 1].position.lng}`;

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;

  if (points.length > 2) {
    // Google Maps allows up to 9 waypoints in standard URL scheme
    const waypoints = points
      .slice(1, -1)
      .slice(0, 9)
      .map((p) => `${p.position.lat},${p.position.lng}`)
      .join("|");
    url += `&waypoints=${encodeURIComponent(waypoints)}`;
  }

  return url;
}

/**
 * Generates an embeddable Google Maps iframe URL.
 * Works without an API key using standard web embed format.
 */
export function getGoogleMapsEmbedUrl(params: {
  location: LatLng;
  zoom?: number;
  label?: string;
}): string {
  // Coordinates preserve the selected branch and do not send fictional fixture names to Google.
  const query = `${params.location.lat},${params.location.lng}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${params.zoom ?? 14}&output=embed&hl=en`;
}
