# OpenStreetMap location search

19 September 2026. Explicit user request supersedes the earlier Google Places restoration for active imports.

## Implemented

- Server-only Nominatim adapter behind the existing PlaceLookup contract. OSM object type/id creates a stable
  provider identifier; source evidence stays separate. Zero/one/multiple options retain existing confirmation rules.
- Addresses, coordinates and category come from OSM. Hours, prices and duration stay unknown. Attribution is
  retained in options and public shares. The magazine labels OSM data as provider-backed rather than sample data.
- Seven-day persistent cache includes negative results and survives job-process restarts. Shared Supabase rate
  limiter spaces attempts at least 15.5 seconds apart; failures prevent lookup. Identifying User-Agent and
  configurable endpoint follow the public service's requirements. One low-volume local worker is supported.
- Maximum ten distinct clues per import; oversized sources request more input before lookup. Capped search
  responses fail rather than silently accepting incomplete branch lists. No autocomplete or area-wide harvesting.
- Manual runner shares the same gate/cache. Local `.env.local` now selects `openstreetmap`; keys were not changed,
  printed or committed. Google adapter remains optional, with existing Google map restrictions preserved.

## Checks

- `npm run check` passed: 329 tests in 26 files, workspace type checks, generated API documentation and planning/link validation.
- `npm run build` passed on Node 24 (Next.js production build).
- Live public-venue search returned one OSM result with coordinates and attribution. No new trip or candidate
  was saved by this probe; only local cache and the shared rate-limit counter were updated.
- Synthetic integration covers extraction -> OSM option -> explicit confirmation -> generated itinerary and
  shared attribution, with no Google Places request. Unit tests cover negative caching, restart reuse, expiry,
  invalid coordinates/IDs, endpoint separation, duplicate IDs, result caps and gate/provider failures.
- Local worker restarted with OpenStreetMap selected (PID 13608); after 109 seconds the process was running,
  its startup marker was present, stderr was empty and polling errors were zero. This is a startup/polling check,
  not a live import acceptance test. No new live video transcript, hosted web deployment, broad browser
  acceptance or human venue-identity/accuracy review is claimed.

## Limits

Public Nominatim is not a production-scale geocoding service; follow [setup and policy](../../docs/operations/openstreetmap.md).
The cache must stay on persistent local storage, and the app must not be scaled across workers/hosts using the
public endpoint. Cache and provider-match coverage do not establish identity accuracy. Google billing is no
longer required for location lookup; Gemini/OpenAI still have their separate costs.

Transactional place merging remains Member 3 issue #9. No new migration was introduced. Existing immutable
itinerary versions and confirmed Google selections are preserved. Hours parsing and real routing are deferred.
