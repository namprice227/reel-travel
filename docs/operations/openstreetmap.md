# OpenStreetMap location search

**Current selection (20 September 2026):** Google Places is active. This guide documents the optional
`PLACES_PROVIDER=openstreetmap` adapter. See [Google Places setup](google-places.md).

Selected by the user on 19 September 2026, replacing Google Places for active imports.

## Flow

Duration check -> Gemini English transcript -> OpenAI source-backed clues -> Nominatim search of OpenStreetMap
-> user confirmation -> itinerary. The two-minute/English restrictions still apply. Text skips transcription.
Only place names, source hints and trip destination go to search; the transcript and source quote do not.

Set `AI_PROVIDER=openai` and `PLACES_PROVIDER=openstreetmap` in `apps/web/.env.local`. Keep `OPENAI_API_KEY`
and `GOOGLE_AI_API_KEY` for extraction/transcription. OpenStreetMap lookup needs no API key or Google billing.
Restart the local worker after changing configuration. No database migration is needed.

## Public service limits

Read the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) before using its public
endpoint. It is a limited shared service: application-wide maximum one request/second, identifying User-Agent,
attribution, and caching are required. Recurring scripts have a stricter four-request/minute limit.
Do not use it for autocomplete, systematic POI harvesting, private/confidential addresses or large bulk jobs.

This setup is for one low-volume local worker on one machine, handling user-submitted saves. Do not scale it
to several workers/hosts or run concurrent manual import jobs against the public service. Move to a suitable
hosted/self-hosted Nominatim endpoint before scaling. Availability and coverage are not guaranteed.

The app sends an identifying ReelTravel User-Agent and uses its shared Supabase limiter to space searches
at least 15.5 seconds apart. Results, including empty searches, persist for seven days in the worker's local cache
across isolated job processes/restarts. Never use an ephemeral cache with the public endpoint.

| Setting | Default / use |
| --- | --- |
| `NOMINATIM_SEARCH_URL` | `https://nominatim.openstreetmap.org/search`; change without code changes |
| `NOMINATIM_CACHE_DIR` | `<REEL_DATA_DIR>/nominatim-cache`; normally `.local/dev-data/nominatim-cache` |
| `NOMINATIM_TIMEOUT_MS` | 20000 per request |

Rate-limiter failures prevent lookup. Capped ten-result responses request more specific input instead of silently
truncating branches. Existing per-account import quotas and worker attempt/deadline bounds remain. These are
request controls, not a monetary cap on Gemini/OpenAI calls. Repeated query/hints share one search per attempt.
An import naming more than ten distinct query/hint pairs requests a shorter source before any location search;
it is not silently truncated or automatically retried.

## Results and confirmation

Provider IDs use the OSM object type and ID (`osm:node:123`, `osm:way:123`, etc.), not unstable Nominatim row IDs.
Addresses, coordinates and category come from the returned map data. Opening hours, visit duration and prices
remain unknown: this change does not parse OSM opening-hours expressions or invent missing facts.

Zero matches asks for more detail; one match needs confirmation; multiple matches need a branch choice.
Only confirmed options enter the planner. OSM coverage can miss a venue or return a similarly named place;
source evidence and user review remain necessary. Select a trip destination matching the source location.
Older unverified saves are not bulk reprocessed. On the trip's Places page, use **Verify location** to search
an existing candidate without retranscribing its source. Progress and failures appear on the card; confirmation
is still a separate action. Verification runs through the local worker with the same OSM gate and cache.

Attribution stays attached to options and shared places. Existing Leaflet maps support OSM results. Google
records retain their existing attribution and map restrictions; they are not silently converted into OSM data.

`PLACES_PROVIDER=none` still disables lookup; fake/fake stays the synthetic demo. The old Google adapter remains
available only when explicitly selected. The manual `extract:youtube-places` runner uses the same OSM gate/cache.

## Evidence

[Implementation and verification](../../deliverables/evidence/openstreetmap-2026-09-19.md).
API reference: [Nominatim Search](https://nominatim.org/release-docs/latest/api/Search/).
Data attribution/license: [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
