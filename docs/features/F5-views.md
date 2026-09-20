# F5 Views: magazine, timeline and map from one version

**Story US-06 acceptance:** magazine, timeline and map read the same saved itinerary version.
**Owners:** UI Member 2 (FE10) · data Member 4 · reviewer Member 1
**Where:** route tabs `/my-trip/:tripId/itinerary` (magazine), `/my-trip/:tripId/timeline` and `/my-trip/:tripId/map` (`?day=N` keeps the day), and view tabs on the shared page `/s/:token`

## Rule

The page loads **one** itinerary (`itinerary.get`, or `shared.get` for viewers) and passes the same object to all three
views. Views never fetch their own copy, reorder stops or recalculate times. After an edit, the page replaces that
one object with the version the server returned, so every tab updates together.

Each view shows the version number so a reviewer can see they match.

## Components

| View | Component | Input type | Notes |
| --- | --- | --- | --- |
| Timeline | [TimelineView.tsx](../../apps/web/src/features/itinerary/TimelineView.tsx) | `PublicItinerary` | Edit controls only when `onEdit` is passed |
| Map | [ItineraryMap.tsx](../../apps/web/src/features/itinerary/ItineraryMap.tsx) | `PublicItinerary` | Leaflet + OSM tiles, colour per day, stop order numbers |
| Magazine | [MagazineView.tsx](../../apps/web/src/features/magazine/MagazineView.tsx) | `PublicItinerary` + trip title/dates | Presentation only |

All three accept `PublicItinerary`, the share-safe projection, so the owner page and the viewer page use the same
components. A full `Itinerary` fits that type.

## Must show

- Locked bookings, clearly marked.
- "Hours not checked" where `hoursCheck` is `unknown`.
- Travel times as estimates (`≈`, plus `assumptions`).
- Fixture places labeled as sample data until real providers are used.
- Never invent details the itinerary doesn't contain (prices, photos of real venues, hours).

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Magazine | Serif article layout, one section per day | Designed magazine (still deterministic; AI layouts are deferred) | Member 2 |
| Timeline | List with basic controls | Designed timeline, drag and drop | Member 2 |
| Map | Circles and lines | Designed markers, stop details, day filter | Member 2 |

## Acceptance checks

- [ ] After moving a stop, switch tabs: all three show the new order and the same version number.
- [ ] The shared page shows the same version as the owner's page.
- [ ] Stop ids and order in the map legend match the timeline (tests/README "Views").

20 September 2026 My Trip UX v2 owner-view update: `/itinerary` uses DayView and `/map` uses RouteMap; day/stop context survives switching views and full-details browser return. My Trip callers explicitly use selected-coordinate Google iframes with English requested and external day directions. Custom in-frame route overlays are deferred; the shared-page components described above retain their existing rendering. [Implementation and verification](../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md) record native navigation, missing-location handling and intercepted Google tests; live Google rendering is unverified.
