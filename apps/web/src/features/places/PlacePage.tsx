"use client";

import { useMemo, useState } from "react";
import type { CandidatePlace, OpeningHours, PublicStop } from "@reel/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { PlaceImage, photoCredit } from "@/components/PlacePhoto";
import { PlaceMap, type MapMarker } from "@/components/PlaceMap";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { NoteButton } from "@/features/notes/NoteButton";
import { noteKeys, useNotes } from "@/features/notes/notes-store";
import { formatDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api-client";

/** 0 = Sunday, matching OpeningWindow.day. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SOURCE_LABEL: Record<string, string> = {
  link: "A link you saved",
  screenshot: "A screenshot you saved",
  text: "A note you saved",
  audio: "An audio memo you saved",
  video: "A video clip you saved",
};
const SOURCE_ICON: Record<string, IconName> = {
  link: "link",
  screenshot: "image",
  text: "text",
  audio: "sparkle",
  video: "image",
};

export function PlacePage({ tripId, placeId }: { tripId: string; placeId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const params = useMemo(() => ({ tripId }), [tripId]);
  const places = useApi("places.list", { params });
  const trip = useApi("trips.get", { params });
  const itinerary = useApi("itinerary.get", { params });
  const { notes, remove } = useNotes(tripId);

  const place = places.data?.places.find((p) => p.id === placeId);
  const routeId = itinerary.data?.itinerary?.resolvedPlaces?.find((item) => item.placeId === placeId)?.providerPlaceId;
  const option = place?.selected ?? place?.options.find((item) => item.providerPlaceId === routeId) ?? (place?.options.length === 1 ? place.options[0] : undefined);
  const detailsReq = useMemo(
    () => (option ? { params: { tripId, placeId }, query: { providerPlaceId: option.providerPlaceId } } : null),
    [tripId, placeId, option],
  );
  const detailsApi = useApi("places.details", detailsReq);

  async function deletePlace() {
    if (!place || deleting) return;
    if (!window.confirm(`Delete “${place.name}” from this trip? Its source save and copies in other trips will stay. A booking linked to it keeps its time but loses the place link.`)) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api("places.delete", { params: { tripId, placeId } });
      remove(noteKeys.place(placeId));
      router.push(`/my-trip/${tripId}/itinerary`);
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause : new ApiError(0, "INTERNAL", String(cause)));
      setDeleting(false);
    }
  }

  if (places.error) return <ErrorBanner error={places.error} />;
  if (!places.data || !trip.data) return <Loading />;

  if (!place) {
    return (
      <div className="empty">
        <strong>Place not found</strong>
        <p>It may have been removed from this trip. <Link href={`/my-trip/${tripId}/itinerary`}>Open itinerary</Link></p>
      </div>
    );
  }

  const details = detailsApi.data?.details ?? option?.details;
  const scheduled = findStop(itinerary.data?.itinerary?.days ?? [], place.id);
  const returnDay = Number(search.get("day")) || scheduled?.dayNumber || 1;
  const returnStop = search.get("stop") ?? scheduled?.stop.id;
  const returnUrl = `/my-trip/${tripId}/itinerary?day=${returnDay}${returnStop ? `&stop=${encodeURIComponent(returnStop)}` : ""}`;
  const marker: MapMarker[] = option ? [{ id: place.id, position: option.location, label: place.name, provider: details?.provider, attribution: details?.attribution }] : [];
  const note = notes[noteKeys.place(place.id)];
  const photos = details?.photos ?? [];

  // Key contact and location facts
  const facts: Array<[IconName, string, React.ReactNode]> = [];
  if (option?.address) facts.push(["pin", "Address", option.address]);
  if (details?.phone) facts.push(["phone", "Phone", <a href={`tel:${details.phone}`}>{details.phone}</a>]);
  if (details?.websiteUrl) facts.push(["globe", "Website", <a href={details.websiteUrl} target="_blank" rel="noreferrer noopener">Official website <Icon name="external" size={12} /></a>]);
  if (details?.typicalVisitMinutes) facts.push(["clock", "Typical visit", `About ${details.typicalVisitMinutes} min`]);

  // Opening hours state
  const hoursUnknown = details != null && details.openingHours.status === "unknown";
  const week = details?.openingHours.status === "known" ? details.openingHours.windows : null;
  const openNow = details && scheduled
    ? openDuringVisit(details.openingHours, scheduled.isoDate, scheduled.stop.start, scheduled.stop.end)
    : null;
  const liveStatus = details ? getLiveOpeningStatus(details.openingHours) : null;
  const lead = place.evidence.find((item) => item.excerpt);

  // Filter and display cuisine & category pills
  const cuisineTags = details?.types?.length
    ? details.types
    : details?.category
    ? [details.category]
    : [];

  // Price tier display
  const priceDisplay = details?.priceRange
    ? details.priceRange
    : details?.priceLevel != null
    ? priceLabel(details.priceLevel)
    : null;

  return (
    <article className="place-page fit-page">
      {/* 1. Breadcrumb navigation */}
      <nav aria-label="Breadcrumb" className="place-crumbs">
        <Link href={returnUrl}><Icon name="arrowLeft" size={14} /> Back to day {returnDay}</Link>
        <Icon name="chevronRight" size={14} />
        <Link href={`/my-trip/${tripId}/itinerary`}>Itinerary</Link>
        <Icon name="chevronRight" size={14} />
        <span>{place.name}</span>
      </nav>
      <div className="place-delete-row">
        <button type="button" className="btn btn-ghost btn-danger" disabled={deleting} onClick={() => void deletePlace()}>
          <Icon name="trash" size={16} /> {deleting ? "Deleting…" : "Delete place"}
        </button>
      </div>
      <ErrorBanner error={deleteError} />

      {/* 2. Hero Header Bar (TripAdvisor structure + Routelet styling) */}
      <header className="place-hero-header card">
        <div className="place-hero-content">
          <div className="place-hero-badges-top">
            <Badge tone={details?.provider === "google" ? "success" : "neutral"}>
              <Icon name="checkCircle" size={13} /> {details?.provider === "google" ? "Verified Google Venue" : "Curated venue"}
            </Badge>
            {details?.provider === "google" && (
              <span className="powered-by-google-badge" title="Verified via Google Maps Platform">
                Powered by <strong>Google</strong>
              </span>
            )}
            <Badge tone={place.status === "confirmed" ? "success" : place.status === "rejected" ? "neutral" : "warning"}>
              {scheduled ? "In itinerary · location chosen automatically" : place.status === "confirmed" ? "Previously confirmed" : place.status === "rejected" ? "Excluded" : "Saved idea"}
            </Badge>
            {scheduled && (
              <Badge tone="info">
                <Icon name="calendar" size={13} /> Day {scheduled.dayNumber} · {scheduled.stop.start} – {scheduled.stop.end}
              </Badge>
            )}
          </div>

          <h1 className="place-hero-title">{place.name}</h1>

          {/* TripAdvisor-style rating & category metadata line */}
          <div className="place-hero-meta-row">
            {details?.rating != null && (
              <div className="place-bubble-rating" title={`${details.rating.toFixed(1)} out of 5 stars`}>
                <span className="bubble-score">{details.rating.toFixed(1)}</span>
                <span className="bubble-stars" aria-hidden="true">
                  {"★".repeat(Math.round(details.rating))}
                  {"☆".repeat(5 - Math.round(details.rating))}
                </span>
                {details.ratingCount != null && (
                  <span className="bubble-count">({details.ratingCount.toLocaleString()} Google reviews)</span>
                )}
              </div>
            )}

            {cuisineTags.length > 0 && (
              <div className="place-tags-list">
                {cuisineTags.map((tag) => (
                  <span key={tag} className="place-tag-pill">{tag}</span>
                ))}
              </div>
            )}

            {priceDisplay && (
              <span className="place-price-pill" title="Price tier">
                {priceDisplay}
              </span>
            )}

            {/* Live Open/Closed badge */}
            {liveStatus?.status === "open" && (
              <Badge tone="success">
                <span className="live-indicator-dot" /> Open now · Closes {liveStatus.window?.close}
              </Badge>
            )}
            {liveStatus?.status === "closed" && (
              <Badge tone="neutral">
                Closed {liveStatus.upcoming ? `· Opens ${liveStatus.upcoming.open}` : ""}
              </Badge>
            )}
            {openNow === true && (
              <Badge tone="success"><Icon name="clock" size={13} /> Open during trip visit</Badge>
            )}
            {openNow === false && (
              <Badge tone="warning"><Icon name="alert" size={13} /> Closed during trip visit</Badge>
            )}
            {hoursUnknown && (
              <Badge tone="neutral"><Icon name="clock" size={13} /> Hours unverified</Badge>
            )}
          </div>

          {option?.address && (
            <p className="place-hero-address">
              <Icon name="pin" size={15} /> {option.address}
            </p>
          )}

          {/* TripAdvisor-style prominent Action Bar */}
          <div className="place-hero-actions">
            {option && (
              <a
                className="btn btn-primary"
                href={`https://www.google.com/maps/dir/?api=1&destination=${option.location.lat},${option.location.lng}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="route" size={17} /> Directions
              </a>
            )}
            {details?.websiteUrl && (
              <a className="btn btn-outline" href={details.websiteUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="globe" size={17} /> Website
              </a>
            )}
            {details?.phone && (
              <a className="btn btn-outline" href={`tel:${details.phone}`}>
                <Icon name="phone" size={17} /> Call venue
              </a>
            )}
            {details?.providerUrl && (
              <a className="btn btn-outline" href={details.providerUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="map" size={17} /> View on Maps
              </a>
            )}
            <NoteButton tripId={tripId} noteKey={noteKeys.place(place.id)} subject={place.name} variant="chip" />
          </div>
        </div>

        {/* Lead Photo / Visual showcase in the hero */}
        <div className="place-hero-art-frame">
          <PlaceImage
            google={option?.details.provider === "google" ? { tripId, placeId, providerPlaceId: option.providerPlaceId } : undefined}
            photo={photos[0]}
            category={details?.category}
            size="lg"
            className="place-hero-art-img"
            width={480}
            alt={place.name}
          />
        </div>
      </header>

      {/* 3. TripAdvisor-style Quick Amenities & Features Bar */}
      {details && (
        <section className="place-amenities-bar card" aria-label="Venue amenities and features">
          <div className="amenities-scroll-track">
            {details.dineIn !== null && (
              <div className={`amenity-chip ${details.dineIn ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">🍽️</span>
                <span>Dine-in: {details.dineIn ? "Yes" : "No"}</span>
              </div>
            )}
            {details.takeout !== null && (
              <div className={`amenity-chip ${details.takeout ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">🥡</span>
                <span>Takeout: {details.takeout ? "Available" : "No"}</span>
              </div>
            )}
            {details.delivery !== null && (
              <div className={`amenity-chip ${details.delivery ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">🛵</span>
                <span>Delivery: {details.delivery ? "Available" : "No"}</span>
              </div>
            )}
            {details.reservable !== null && (
              <div className={`amenity-chip ${details.reservable ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">📅</span>
                <span>Reservations: {details.reservable ? "Reservable" : "Walk-in only"}</span>
              </div>
            )}
            {details.servesBeer !== null && details.servesBeer && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">🍺</span>
                <span>Serves Beer</span>
              </div>
            )}
            {details.servesWine !== null && details.servesWine && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">🍷</span>
                <span>Serves Wine</span>
              </div>
            )}
            {details.servesVegetarianFood !== null && (
              <div className={`amenity-chip ${details.servesVegetarianFood ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">🥗</span>
                <span>Vegetarian: {details.servesVegetarianFood ? "Options available" : "Limited / None"}</span>
              </div>
            )}
            {details.goodForGroups !== null && details.goodForGroups && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">👥</span>
                <span>Good for Groups</span>
              </div>
            )}
            {details.goodForChildren !== null && (
              <div className={`amenity-chip ${details.goodForChildren ? "is-supported" : "is-unsupported"}`}>
                <span className="amenity-icon">👶</span>
                <span>Kid-friendly: {details.goodForChildren ? "Yes" : "Casual / Adult-focused"}</span>
              </div>
            )}
            {details.outdoorSeating !== null && details.outdoorSeating && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">🌿</span>
                <span>Outdoor Seating</span>
              </div>
            )}
            {details.restroom !== null && details.restroom && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">🚻</span>
                <span>Restrooms</span>
              </div>
            )}
            {details.paymentOptions?.acceptsCreditCards && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">💳</span>
                <span>Credit Cards Accepted</span>
              </div>
            )}
            {details.paymentOptions?.acceptsCashOnly && (
              <div className="amenity-chip is-warning">
                <span className="amenity-icon">💴</span>
                <span>Cash Only</span>
              </div>
            )}
            {details.accessibilityOptions?.wheelchairAccessibleEntrance && (
              <div className="amenity-chip is-supported">
                <span className="amenity-icon">♿</span>
                <span>Wheelchair Accessible</span>
              </div>
            )}
            {details.typicalVisitMinutes && (
              <div className="amenity-chip is-neutral">
                <span className="amenity-icon">⏱️</span>
                <span>Typical visit: ~{details.typicalVisitMinutes} min</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. Two-Column Layout (Main Left Column + Sidebar Right Column) */}
      <div className="place-body">
        <div className="place-main">
          {/* About & Editorial Overview */}
          {details?.summary && (
            <section className="place-section card">
              <h2>About &amp; Overview</h2>
              <p className="place-summary-lead">{details.summary}</p>
            </section>
          )}

          {/* Routelet Unique Section: Saved Inspiration & Provenance */}
          <section className="place-section card place-inspiration-card">
            <div className="section-head-with-badge">
              <h2>Why It&apos;s in Your Trip</h2>
              <Badge tone="info">{place.evidence.length} saved inspiration{place.evidence.length === 1 ? "" : "s"}</Badge>
            </div>
            <p className="muted small">
              Routelet links verified venues directly to the social reels, screenshots, or notes you saved.
            </p>

            <div className="place-sources-list">
              {place.evidence.map((item) => (
                <div key={`${item.inspirationId}:${item.clue}`} className="place-source-item">
                  <span className="place-source-icon">
                    <Icon name={SOURCE_ICON[item.sourceType] ?? "link"} size={20} />
                  </span>
                  <div className="place-source-content">
                    <div className="place-source-meta">
                      <strong>{SOURCE_LABEL[item.sourceType] ?? "A save"}</strong>
                      <span className="source-clue-pill">Queried as &ldquo;{item.clue}&rdquo;</span>
                    </div>
                    {item.excerpt ? (
                      <blockquote className="place-source-quote">
                        &ldquo;{item.excerpt}&rdquo;
                      </blockquote>
                    ) : (
                      <p className="place-source-no-quote">Matched from your saved media inspiration.</p>
                    )}
                    {item.hint && <p className="source-hint small muted">Context clue: {item.hint}</p>}
                  </div>
                  <Link
                    className="btn btn-outline btn-small place-source-link"
                    href={`/inspiration-library?save=${encodeURIComponent(item.inspirationId)}`}
                  >
                    Open save <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* TripAdvisor-Style "Details" Specifications Grid */}
          {details && (
            <section className="place-section card">
              <h2>Details &amp; Specifications</h2>
              <div className="place-specs-grid">
                {/* Block 1: Cuisine & Categories */}
                <div className="spec-card">
                  <span className="spec-icon">🍱</span>
                  <div className="spec-text">
                    <h4>Cuisine &amp; Dining Type</h4>
                    <p>{cuisineTags.length ? cuisineTags.join(", ") : "Standard establishment"}</p>
                  </div>
                </div>

                {/* Block 2: Price & Payments */}
                <div className="spec-card">
                  <span className="spec-icon">💳</span>
                  <div className="spec-text">
                    <h4>Pricing &amp; Payments</h4>
                    <p>
                      {priceDisplay ? `Tier: ${priceDisplay}` : "Standard pricing"}
                      {details.paymentOptions?.acceptsCreditCards ? " · Credit cards accepted" : ""}
                      {details.paymentOptions?.acceptsCashOnly ? " · Cash only" : ""}
                    </p>
                  </div>
                </div>

                {/* Block 3: Features & Services */}
                <div className="spec-card">
                  <span className="spec-icon">🛎️</span>
                  <div className="spec-text">
                    <h4>Dining &amp; Features</h4>
                    <p>
                      {[
                        details.dineIn ? "Dine-in" : null,
                        details.takeout ? "Takeout" : null,
                        details.delivery ? "Delivery" : null,
                        details.reservable ? "Reservations" : null,
                        details.outdoorSeating ? "Outdoor seating" : null,
                      ].filter(Boolean).join(", ") || "Standard service"}
                    </p>
                  </div>
                </div>

                {/* Block 4: Dietary & Atmosphere */}
                <div className="spec-card">
                  <span className="spec-icon">🌿</span>
                  <div className="spec-text">
                    <h4>Dietary &amp; Atmosphere</h4>
                    <p>
                      {[
                        details.servesVegetarianFood ? "Vegetarian friendly" : null,
                        details.servesBeer || details.servesWine ? "Alcohol served" : null,
                        details.goodForGroups ? "Group friendly" : null,
                        details.goodForChildren ? "Child friendly" : null,
                      ].filter(Boolean).join(", ") || "Casual atmosphere"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Authentic Google Maps Reviews (TripAdvisor verbatim review cards) */}
          {details?.reviews && details.reviews.length > 0 && (
            <section className="place-section card">
              <div className="section-head-with-badge">
                <h2>Verified Visitor Reviews</h2>
                <span className="muted small">{details.reviews.length} authentic Google reviews</span>
              </div>
              <div className="place-reviews">
                {details.reviews.map((r, i) => (
                  <blockquote key={i} className="place-review-card">
                    <div className="review-meta">
                      {r.authorPhotoUrl ? (
                        <img
                          src={r.authorPhotoUrl}
                          alt={r.authorName}
                          className="review-author-avatar"
                          width={36}
                          height={36}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="review-author-initial" aria-hidden="true">
                          {r.authorName.charAt(0) || "G"}
                        </div>
                      )}
                      <div className="review-author-info">
                        <span className="review-author">{r.authorName}</span>
                        <div className="review-stars-row">
                          {r.rating && (
                            <span className="review-stars" aria-label={`${r.rating} stars`}>
                              {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                            </span>
                          )}
                          {r.relativeTime && <span className="review-time muted small">{r.relativeTime}</span>}
                        </div>
                      </div>
                    </div>
                    <p className="review-text">{r.text}</p>
                    {r.googleMapsUri && (
                      <a className="link-arrow small review-link" href={r.googleMapsUri} target="_blank" rel="noreferrer noopener">
                        Read on Google Maps <Icon name="external" size={13} />
                      </a>
                    )}
                  </blockquote>
                ))}
              </div>
              <div className="google-attribution-disclosure">
                {details.provider === "google" && (
                  <span className="powered-by-google-text">Powered by <strong>Google</strong></span>
                )}
                <p className="fineprint">
                  Reviews and place data provided by Google Maps contributors and displayed verbatim without AI summarisation or editing.
                  Content is cached for up to 30 days in compliance with Google Maps Platform policies.
                </p>
              </div>
            </section>
          )}

          {/* User's Personal Note */}
          {note && (
            <section className="place-section card">
              <h2>Your Private Note</h2>
              <p className="place-note">{note.text}</p>
            </section>
          )}

          {/* Alternative branches / ambiguous matches */}
          {place.options.length > 1 && (
            <section className="place-section card">
              <h2>Other Venue Matches</h2>
              <p className="muted small">
                {routeId ? "The route uses the location shown above. You can change your places and rebuild the days." : "The route will choose a location when you plan the days."}
              </p>
              <ul className="place-options">
                {place.options.map((o) => (
                  <li key={o.providerPlaceId}>
                    <strong>{o.name}</strong>
                    <small>{o.address ?? "No address"}</small>
                    {o.providerPlaceId === option?.providerPlaceId && (
                      <Badge tone="success"><Icon name="check" size={13} /> Used for route</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right Sidebar Column */}
        <aside className="place-side">
          {/* Location & Navigation Card */}
          <div className="card place-map-card">
            <div className="card-header-simple">
              <h3>Location &amp; Contact</h3>
            </div>
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
                <li key={i}>
                  <Icon name={icon} size={15} />
                  <span>
                    {label}
                    <strong>{value}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Hours of Operation Card */}
          {details && (
            <div className="card place-hours-card">
              <div className="hours-head">
                <h3>Opening Hours</h3>
                {liveStatus?.status === "open" && (
                  <Badge tone="success"><span className="live-indicator-dot" /> Open</Badge>
                )}
                {liveStatus?.status === "closed" && (
                  <Badge tone="neutral">Closed</Badge>
                )}
              </div>

              {week ? (
                <>
                  <ul className="place-hours">
                    {WEEKDAYS.map((name, day) => {
                      const windows = week.filter((w) => w.day === day);
                      const isToday = new Date().getDay() === day;
                      const visiting = scheduled != null && weekdayOf(scheduled.isoDate) === day;
                      return (
                        <li key={name} className={`${visiting ? "is-visiting" : ""} ${isToday ? "is-today" : ""}`}>
                          <span className="day-name">{name}</span>
                          <strong className="day-hours">
                            {windows.length ? windows.map((w) => `${w.open} – ${w.close}`).join(", ") : "Closed"}
                          </strong>
                          {isToday && <span className="today-chip">Today</span>}
                          {visiting && <em className="visiting-chip">Trip visit</em>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="fineprint">
                    Source: {details.provider === "google" ? "Google Maps (New)" : details.provider} · checked {formatDay(details.fetchedAt.slice(0, 10))}
                  </p>
                </>
              ) : (
                <p className="muted small">The provider didn&apos;t supply schedule hours for this place.</p>
              )}
            </div>
          )}

          {/* Transparency & Integrity Card */}
          <div className="card place-transparency-card">
            <h3>Data Provenance</h3>
            <p className="fineprint">{details?.attribution ?? "Verified data"}</p>
            {details && details.unknownFields.length > 0 && (
              <p className="fineprint">
                Not supplied by provider: <code>{details.unknownFields.join(", ")}</code>
              </p>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

function findStop(days: Array<{ date: string; stops: PublicStop[] }>, placeId: string) {
  for (const [index, day] of days.entries()) {
    const stop = day.stops.find((s) => s.placeId === placeId);
    if (stop) return { stop, dayNumber: index + 1, date: formatDay(day.date), isoDate: day.date };
  }
  return null;
}

/** Google's levels: 0 is free, 4 is very expensive. Repeating a symbol for level 0 would say the opposite. */
function priceLabel(level: number): string {
  return level === 0 ? "Free" : "¥".repeat(level);
}

/** Calendar dates carry no timezone, so read the weekday in UTC like the rest of the app does. */
const weekdayOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

/**
 * Whether the venue is open for the whole of a scheduled visit. Returns null when the provider gave
 * no hours — "we didn't check" and "it is closed" are different answers and must not look the same.
 */
function openDuringVisit(hours: OpeningHours, isoDate: string, start: string, end: string): boolean | null {
  if (hours.status !== "known") return null;
  const day = weekdayOf(isoDate);
  const windows = hours.windows.filter((w) => w.day === day);
  if (windows.length === 0) return false;
  return windows.some((w) => w.open <= start && end <= w.close);
}

/** Check if venue is currently open based on user's current clock. */
function getLiveOpeningStatus(hours: OpeningHours): {
  status: "open" | "closed" | "unknown";
  window?: { open: string; close: string };
  upcoming?: { open: string; close: string };
} {
  if (hours.status !== "known") return { status: "unknown" };
  const now = new Date();
  const day = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todaysWindows = hours.windows.filter((w) => w.day === day);
  if (todaysWindows.length === 0) return { status: "closed" };
  const current = todaysWindows.find((w) => w.open <= currentTime && currentTime <= w.close);
  if (current) return { status: "open", window: current };
  const upcoming = todaysWindows.find((w) => w.open > currentTime);
  return { status: "closed", upcoming };
}

export type { CandidatePlace };
