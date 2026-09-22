# Transcript-to-place imports

**Current selection (20 September 2026):** Google Places is active again after a successful live access check.
OpenStreetMap remains an explicitly configured alternative; existing records are preserved.

## Current flow (2026-09-20)

Google Places lookup is restored at the user's request. Real imports now run:

YouTube duration check -> Gemini English transcript -> OpenAI structured extraction
-> source-reference validation and original passage evidence -> Google Places matches
-> explicit user confirmation -> planning.

`PLACES_PROVIDER=google` enables lookup and is the default when `AI_PROVIDER=openai` and the lookup setting is absent or blank.
Explicit `openstreetmap` remains supported; `none` deliberately keeps extraction-only output.
The default fake/fake demo remains offline.
Google facts remain separate from model clues. A returned match is not proof that it is the place in the video.
The fake/fake demo still uses explicitly fictional fixtures; mixing real extraction with fake lookup is rejected.

## Configure and run

Set `AI_PROVIDER=openai` and `PLACES_PROVIDER=google` in `apps/web/.env.local`.
Keep `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` and `GOOGLE_PLACES_API_KEY` there, server-side.
Enable Places API (New) and billing in the key's Google Cloud project. Its restrictions must allow server-side
Text Search calls from the Node worker. A `403` is an access failure, not an empty search.
Use the [Supabase setup](supabase-vercel.md), then run `npm run dev` and the separate
`npm run worker` process. Restart processes after configuration changes.

OpenAI defaults to gpt-4o-mini; existing model/timeout overrides remain supported.
Video inputs must be English and at most 120 seconds. Unverifiable duration blocks
transcription. See [video restrictions](youtube-transcript.md).

The manual runner (does not save to a trip) is:

```powershell
npm run extract:youtube-places -- "https://www.youtube.com/shorts/cW2Lu-N98B0" "Tokyo"
```

The destination is search context, not evidence, and does not fill missing transcript facts.
This command calls the duration API, Gemini, OpenAI and the configured Google lookup. Output includes transcript
provenance, validated clues and match options with null selection. `none` still returns unverified candidates.
Keep transcripts and provider content out of commits and shared logs.

## Save in the app

1. Sign in and select your trip in Inspiration library.
2. Add a supported public YouTube URL without notes, or paste a transcript as text.
   Text needs only OpenAI. Link notes/details remain the existing text recovery path.
3. The worker searches using extracted names, source-supported hints and trip destination, preserving literal evidence.
4. Open Review places: zero matches is `not_found`, one is `pending`, and multiple matches are `ambiguous`.
5. Select the intended returned branch and confirm. Only confirmed places enter the planner.

Provider IDs, addresses, coordinates and available hours come from Google; missing facts remain unknown.
Existing confirmed records remain usable. Saves remain `needs_confirmation` while candidates are unresolved.
Older extraction-only saves are not automatically reprocessed. Use **Verify location** on an unverified place
to search its saved clue without repeating transcription/extraction. Alternatively add the source again with lookup enabled;
matching unverified names/hints gain options while retaining their IDs and both source references.
Failed imports use the existing retry/add-details flow. The upgrade does not replace confirmed selections
or overwrite rejected suggestions. No new database migration is required.

Same names and matching hints can merge source evidence; conflicting hints stay separate.
The LLM cites numbered source passages; the server copies the original text instead of accepting rewritten quotes.
Schema validation and literal quotes do not prove real-world identity or transcript accuracy.
Malformed output retries through the bounded worker; empty clues request more details.
Instagram/TikTok without supplied text still return SOURCE_INACCESSIBLE.

## Resources and verification

Imports with more than ten distinct query/hint pairs request a shorter source before lookup.
Repeated query/hint pairs share a search within each attempt. Each distinct search is bounded to three pages
of 20 results and a timeout (default 60 seconds; `GOOGLE_PLACES_TIMEOUT_MS` overrides it). Excess results fail
instead of silently truncating branches. Existing worker and account quotas remain. Retries can repeat
transcription/extraction/lookup because transcript checkpointing is not implemented.

The existing field mask requests IDs, names, addresses, coordinates, primary type, hours, price level, attribution
and business status. Fields affect billing; no dollar cap is claimed. See Google's
[Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search).

[Restoration evidence](../../deliverables/evidence/google-places-restored-2026-09-19.md).
Existing attribution and Google-data map restrictions remain. A Google Maps renderer, production content
retention/refresh and independent human review remain outstanding; see Google's
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
Transactional merging remains with [Member 3, issue #9](https://github.com/namprice227/reel-travel/issues/9).

## UI photos (21 September 2026)

Keep GOOGLE_PLACES_API_KEY on the web host as well as the worker. Photo requests run in the authenticated
web API, not in the import worker. Each visible place requests fresh Details (`photos,googleMapsUri`), then
one Photo URI with maxWidthPx=640, maxHeightPx=480 and skipHttpRedirect=true. The browser receives a Google
image URL plus attribution, never the API key. No photo names, URLs or image bytes are persisted in Supabase
or a server cache. No bulk photo downloads during import. Photos load when a card approaches the viewport.

The UI displays Google Maps and author/source links. Missing/error images have a fallback. Existing Google
records work immediately; OSM/fixture records keep their current display. Photos add billed provider requests;
60/minute and 300/day per user bound application requests (up to two Google calls each), not a dollar budget.
See [Google Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos)
and [attribution requirements](https://developers.google.com/maps/documentation/places/web-service/policies).

## Two-Phase Field Mask and 30-Day Caching Strategy (22 September 2026)

To minimize Google Maps Platform API costs and strictly adhere to Google Maps Platform Terms of Service §3.2.3:

1. **Lightweight Text Search (Discovery Phase)**:
   - Worker queries `https://places.googleapis.com/v1/places:searchText` using `GOOGLE_PLACES_FIELDS`.
   - Field mask is restricted strictly to basic identity fields: `places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.types,places.attributions,places.businessStatus`.
   - Rich atmosphere/contact fields (`rating`, `reviews`, `userRatingCount`, `priceRange`, `websiteUri`, `nationalPhoneNumber`, `regularOpeningHours`, etc.) are NEVER requested during Text Search.
   - Cost: Basic search tier only (~$0.005/request instead of Enterprise/Atmosphere tier ~$0.035/request).

2. **On-Demand Place Details with 30-Day Cache (Inspection Phase)**:
   - Rich fields are requested lazily only when a user navigates to the specific Place Page via `GET /api/trips/:tripId/places/:placeId/details?providerPlaceId=...`.
   - Field mask `GOOGLE_PLACE_DETAILS_FIELDS` requests: `id,displayName,formattedAddress,location,primaryType,primaryTypeDisplayName,types,businessStatus,rating,userRatingCount,reviews,priceLevel,priceRange,regularOpeningHours,nationalPhoneNumber,websiteUri,googleMapsUri,editorialSummary,paymentOptions,parkingOptions,accessibilityOptions,allowsDogs,goodForChildren,goodForGroups,restroom,outdoorSeating,liveMusic,menuForChildren,servesCocktails,servesDessert,servesCoffee,servesBeer,servesWine,servesBrunch,servesLunch,servesDinner,servesVegetarianFood,dineIn,takeout,delivery,curbsidePickup,reservable,goodForWatchingSports`.
   - **30-Day Caching Compliance**: Google Maps Platform Terms of Service §3.2.3 explicitly permits ephemeral caching of place content for up to 30 consecutive calendar days for performance improvement. `place-details.ts` evaluates the `fetchedAt` timestamp against a 30-day TTL (`MAX_PLACE_DETAILS_CACHE_MS = 30 * 24 * 60 * 60 * 1000`). If within 30 days, cached data is served with zero external API calls.
   - Per-user rate limits of 60/min and 300/day protect against abuse.

3. **Map Rendering Compliance**:
   - In accordance with Google Maps Platform policies, Google-derived places and coordinates are rendered exclusively using `GoogleMapView` (interactive or embedded iframe).
   - `MapView.tsx` strictly routes any markers with `provider === "google"` to `GoogleMapView`, preventing Google-derived coordinates from being plotted on OpenStreetMap or other non-Google map tiles.
   - Attribution badge "Powered by Google" and verbatim review author disclosures are rendered on the Place Details page.

