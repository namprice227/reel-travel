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
}): string {
  if (params.location) {
    const latLng = `${params.location.lat},${params.location.lng}`;
    const query = params.name ? `${params.name}` : latLng;
    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (params.placeId) {
      url += `&query_place_id=${encodeURIComponent(params.placeId)}`;
    }
    return url;
  }
  const query = [params.name, params.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "Tokyo")}`;
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
  const query = params.label
    ? `${params.label.replace(/^\d+\.\s*/, "")} @ ${params.location.lat},${params.location.lng}`
    : `${params.location.lat},${params.location.lng}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${params.zoom ?? 14}&output=embed`;
}
