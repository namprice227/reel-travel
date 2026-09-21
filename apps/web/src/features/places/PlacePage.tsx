"use client";

import type { CandidatePlace, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { PlaceImage, photoCredit } from "@/components/PlacePhoto";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys, useNotes } from "@/features/notes/notes-store";
import { describeHours, formatDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";

// Everything the app knows about one place (design "Sky 3 · 10 Place page"), opened from a stop or the places list.
// Only real data: provider photos and facts, the saves that mentioned it, where it sits in the trip, and your own note.
// Ratings and guides are still not shown: nothing supplies them yet. Fixture places have no photos.

const SOURCE_LABEL: Record<string, string> = { link: "A link you saved", screenshot: "A screenshot you saved", text: "A note you saved" };
const SOURCE_ICON: Record<string, IconName> = { link: "link", screenshot: "image", text: "text" };

export function PlacePage({ tripId, placeId }: { tripId: string; placeId: string }) {
  const search = useSearchParams();
  const params = { tripId };
  const places = useApi("places.list", { params });
  const trip = useApi("trips.get", { params });
  const itinerary = useApi("itinerary.get", { params });
  const { notes } = useNotes(tripId);

  if (places.error) return <ErrorBanner error={places.error} />;
  if (!places.data || !trip.data) return <Loading />;

  const place = places.data.places.find((p) => p.id === placeId);
  if (!place) {
    return (
      <div className="empty">
        <strong>Place not found</strong>
        <p>It may have been removed from this trip. <Link href={`/my-trip/${tripId}/places`}>See all places</Link></p>
      </div>
    );
  }

  const option = place.selected ?? (place.options.length === 1 ? place.options[0] : undefined);
  const details = option?.details;
  const scheduled = findStop(itinerary.data?.itinerary?.days ?? [], place.id);
  const returnDay = Number(search.get("day")) || scheduled?.dayNumber || 1;
  const returnStop = search.get("stop") ?? scheduled?.stop.id;
  const returnUrl = `/my-trip/${tripId}/itinerary?day=${returnDay}${returnStop ? `&stop=${encodeURIComponent(returnStop)}` : ""}`;
  const marker: MapMarker[] = option ? [{ id: place.id, position: option.location, label: place.name, provider: details?.provider, attribution: details?.attribution }] : [];
  const note = notes[noteKeys.place(place.id)];
  const photos = details?.photos ?? [];

  const facts: Array<[IconName, string, React.ReactNode]> = [];
  if (scheduled) facts.push(["calendar", "In your trip", `Day ${scheduled.dayNumber} · ${scheduled.stop.start} – ${scheduled.stop.end}`]);
  if (option?.address) facts.push(["pin", "Address", option.address]);
  if (details) facts.push(["clock", "Opening hours", details.openingHours.status === "unknown" ? <span className="is-warning">Not checked</span> : describeHours(details.openingHours)]);
  if (details?.phone) facts.push(["phone", "Phone", <a href={`tel:${details.phone}`}>{details.phone}</a>]);
  if (details?.websiteUrl) facts.push(["globe", "Website", <a href={details.websiteUrl} target="_blank" rel="noreferrer noopener">Official site <Icon name="external" size={12} /></a>]);
  if (details?.providerUrl) facts.push(["map", "Google Maps", <a href={details.providerUrl} target="_blank" rel="noreferrer noopener">Open in Google Maps <Icon name="external" size={12} /></a>]);
  if (details?.typicalVisitMinutes) facts.push(["clock", "Time to spend", `About ${details.typicalVisitMinutes} min`]);
  if (details?.priceLevel != null) facts.push(["wallet", "Price level", "¥".repeat(Math.max(details.priceLevel, 1))]);

  return (
    <article className="place-page fit-page">
      <nav aria-label="Breadcrumb" className="place-crumbs">
        <Link href={returnUrl}><Icon name="arrowLeft" size={14} /> Back to day {returnDay}</Link>
        <Icon name="chevronRight" size={14} />
        <Link href={`/my-trip/${tripId}/places`}>Places</Link>
        <Icon name="chevronRight" size={14} />
        <span>{place.name}</span>
      </nav>

      <header className="place-head">
        <PlaceImage google={option?.details.provider === "google" ? { tripId, placeId, providerPlaceId: option.providerPlaceId } : undefined} photo={photos[0]} category={details?.category} size="md" className="place-art" width={400} alt={place.name} />
        <div>
          <h1>{place.name}</h1>
          <p className="place-meta">
            {details?.category && <>{details.category}<span aria-hidden="true">·</span></>}
            {option?.address ?? "Location not matched yet"}
          </p>
          {details?.summary && <p className="place-summary">{details.summary}</p>}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={place.status === "confirmed" ? "success" : place.status === "rejected" ? "neutral" : "warning"}>
              {place.status === "confirmed" ? "Confirmed" : place.status === "rejected" ? "Rejected" : "Not confirmed yet"}
            </Badge>
            {scheduled && <Badge tone="info"><Icon name="calendar" size={13} /> Day {scheduled.dayNumber} · {scheduled.stop.start}</Badge>}
            {details?.rating != null && (
              <span className="place-rating">
                <Icon name="star" size={15} className="star-icon" />
                <strong>{details.rating.toFixed(1)}</strong>
                {details.ratingCount != null && (
                  <span className="muted small"> ({details.ratingCount.toLocaleString()} on Google Maps)</span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="place-actions">
          {option && (
            <a className="btn btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${option.location.lat},${option.location.lng}`} target="_blank" rel="noreferrer noopener">
              <Icon name="route" size={18} /> Directions
            </a>
          )}
          {details?.websiteUrl && (
            <a className="btn btn-outline" href={details.websiteUrl} target="_blank" rel="noreferrer noopener">
              <Icon name="globe" size={18} /> Official site
            </a>
          )}
          <NoteButton tripId={tripId} noteKey={noteKeys.place(place.id)} subject={place.name} variant="chip" />
        </div>
      </header>

      <div className="place-body">
        <div className="place-main">
          {details?.provider !== "google" && photos.length > 0 && (
            <section className="place-section">
              <h2>Photos</h2>
              <div className="place-gallery">
                {photos.map((photo, i) => (
                  <figure key={photo.ref} className={i === 0 ? "is-lead" : undefined}>
                    <PlaceImage photo={photo} category={details?.category} width={i === 0 ? 800 : 400} alt={`${place.name}, photo ${i + 1}`} />
                    <figcaption>{photoCredit(photo)}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="fineprint">Photos come from {details?.provider === "google" ? "Google Maps" : details?.provider} and stay with them; the app doesn&apos;t keep copies.</p>
            </section>
          )}

          <section className="place-section">
            <h2>Why it&apos;s in your trip · {place.evidence.length} {place.evidence.length === 1 ? "save" : "saves"}</h2>
            {place.evidence.map((item) => (
              <div key={`${item.inspirationId}:${item.clue}`} className="place-source">
                <span className="place-source-icon"><Icon name={SOURCE_ICON[item.sourceType] ?? "link"} size={18} /></span>
                <span>
                  <strong>{SOURCE_LABEL[item.sourceType] ?? "A save"}</strong>
                  <small>Looked up as &ldquo;{item.clue}&rdquo;</small>
                  {item.excerpt && <q>{item.excerpt}</q>}
                </span>
                <Link className="link-arrow" href={`/inspiration-library?save=${encodeURIComponent(item.inspirationId)}`}>Open save <Icon name="arrowRight" size={15} /></Link>
              </div>
            ))}
          </section>

          {details?.reviews && details.reviews.length > 0 && (
            <section className="place-section">
              <h2>What visitors say · {details.reviews.length} {details.reviews.length === 1 ? "review" : "reviews"}</h2>
              <div className="place-reviews">
                {details.reviews.map((r, i) => (
                  <blockquote key={i} className="place-review-card">
                    <div className="review-meta">
                      <span className="review-author">{r.authorName}</span>
                      {r.rating && (
                        <span className="review-stars">
                          {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                        </span>
                      )}
                      {r.relativeTime && <span className="review-time muted small">{r.relativeTime}</span>}
                    </div>
                    <p className="review-text">{r.text}</p>
                    {r.googleMapsUri && (
                      <a className="link-arrow small" href={r.googleMapsUri} target="_blank" rel="noreferrer noopener">
                        View on Google Maps <Icon name="external" size={13} />
                      </a>
                    )}
                  </blockquote>
                ))}
              </div>
              <p className="fineprint">Reviews come from Google Maps contributors and are shown verbatim without editing or summarisation.</p>
            </section>
          )}

          {note && (
            <section className="place-section">
              <h2>Your note</h2>
              <p className="place-note">{note.text}</p>
            </section>
          )}

          {place.options.length > 1 && (
            <section className="place-section">
              <h2>Other matches</h2>
              <p className="muted small">{place.status === "confirmed" ? "You chose the first of these." : "Pick the right one on the Places page."}</p>
              <ul className="place-options">
                {place.options.map((o) => (
                  <li key={o.providerPlaceId}>
                    <strong>{o.name}</strong>
                    <small>{o.address ?? "No address"}</small>
                    {o.providerPlaceId === place.selected?.providerPlaceId && <Badge tone="success"><Icon name="check" size={13} /> Chosen</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="place-side">
          <div className="card place-map-card">
            {marker.length ? (
              <div className="place-map-wrap">
                <PlaceMap renderer="google" markers={marker} height={240} interactive={false} />
                {option && (
                  <a
                    className="place-map-overlay-link"
                    href={details?.providerUrl ?? `https://www.google.com/maps/search/?api=1&query=${option.location.lat},${option.location.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="map" size={13} /> Open in Google Maps <Icon name="external" size={11} />
                  </a>
                )}
              </div>
            ) : (
              <div className="map-placeholder" style={{ height: 240 }}>No location matched yet</div>
            )}
            <ul className="panel-facts">
              {facts.map(([icon, label, value], i) => (
                <li key={i}><Icon name={icon} size={15} /> <span>{label}<strong>{value}</strong></span></li>
              ))}
            </ul>
          </div>
          {details && <p className="fineprint">{details.attribution}</p>}
          {details && details.unknownFields.length > 0 && (
            <p className="fineprint">Not supplied by the provider: {details.unknownFields.join(", ")}.</p>
          )}
        </aside>
      </div>
    </article>
  );
}

function findStop(days: Array<{ date: string; stops: PublicStop[] }>, placeId: string) {
  for (const [index, day] of days.entries()) {
    const stop = day.stops.find((s) => s.placeId === placeId);
    if (stop) return { stop, dayNumber: index + 1, date: formatDay(day.date) };
  }
  return null;
}

export type { CandidatePlace };
