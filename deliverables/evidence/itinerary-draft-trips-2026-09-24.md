# Itinerary reels become draft trips

24 September 2026. User request, implemented by Claude Code (Opus 5.5) from an approved plan. Human code
review, the browser UI check and the hosted Supabase migration are pending.

## Behaviour

- **A reel saved on Home that presents itself as a day-by-day itinerary becomes a draft trip.** Examples of such
  wording: "5 day itinerary", "3 nights in Seoul", or "Day 1 / Day 2" grouping.
- **Any other reel stays account place ideas**, however many places it lists.
- **The server makes the decision** (`resolveReelFormat`). It accepts `itinerary` only when all of these hold:
  - A verbatim phrase appears in the transcript or on-screen text.
  - The phrase reads as itinerary wording.
  - The source gives a day structure or a stated length.
  - The source names the destination.
- **Detection needs no extra model call.** It is part of the existing structured extraction, and the model's own
  `trip_days` is not trusted.
- **Draft trips:**
  - `status: "draft"`, with null dates.
  - Timezone is set only when the named city or country is a supported destination.
  - `draft.tripDays` holds the source's stated length.
  - Places go through Google Places lookup with the source destination, capped at 20 searches per saved video
    (raised from 10 at the user's request on 24 September; the cap now also applies to videos saved inside a trip).
    Extra stops stay unverified and can be verified per place.
  - Each place's evidence carries `sourceDay`.
- **Setting a start date, end date and timezone makes the trip `planned`.** A partial date on a draft is rejected.
  Planning, bookings and sharing return `INVALID_STATE` until then.
- **The itinerary prompt (v7) prefers each place's source day.** The planner's checks are unchanged. Fingerprints of
  plans without source-day hints are unchanged, so existing itineraries do not turn stale.
- **Keep as ideas instead** on Home deletes a still-draft trip and stores its places as account ideas.
- **A reel saved inside an existing trip never creates a trip.** Its places still keep day hints.

Supabase: trip and reel fields are JSONB. `database/migrations/202609240001_itinerary_draft_trips.sql` adds
`reel_attach_account_reel_trip` (idempotent under the job lease) and `reel_convert_draft_to_ideas`. Apply it after
`202609230001_account_reels.sql`. It has been applied to the development Supabase project (function presence
confirmed by RPC probe). `202609240002_account_reel_format.sql` adds `reel_record_account_reel_format` for
unsupported-country itineraries and still needs applying.

## Verification

- `npm run check`: 649 tests in 62 files pass. Workspace typecheck, API docs (47 endpoints) and planning
  validation pass.
- New tests with synthetic data and no network calls:
  - `packages/ai/src/reel-format.test.ts` (8 tests): itinerary vs ranked list; quote missing from the source;
    destination not named; a bare injected "this is an itinerary" claim; day labels and spelled-out lengths.
  - Planner fingerprint and planning-input hint tests.
  - `tests/integration/itinerary-draft-trips.test.ts` (6 tests, real job runner and file store, mocked providers):
    - Exactly one draft trip across a retried job.
    - Places reel → ideas only.
    - Draft blocks planning, bookings and sharing; adding dates plans the trip, and generated days follow the
      source days.
    - Keep as ideas.
    - An in-trip save never creates a trip.
    - Legacy trips parse as planned.
- Live providers (Gemini `gemini-3.5-flash-lite`, OpenAI, Google Places), using the real server services with an
  isolated temporary file store:
  - "Top 6 Must Visit Places in Osaka" → 6 place ideas, no trip.
  - "5 Days in Tokyo | The Best Itinerary" → draft trip "5 Day Itinerary for First Timers in Tokyo", 5 days,
    Asia/Tokyo, 17 places tagged Day 1–5; 10 looked up, 7 unverified because of the lookup cap.
  - After adding 5 dates and confirming Tokyo matches: 10/10 routable places scheduled, all on their video day
    (10 s).
  - Detection stability: 8 live reads, stable classification. Osaka "places" 4/4. Tokyo "itinerary", 5 days, Tokyo
    4/4, while the stop count varied between 17 and 22.

## Not verified or deferred

- Browser rendering of the Home card, draft banner, dates card and setup changes. The local Supabase dev server
  needs the owner's sign-in. The components typecheck only.
- The SQL functions on a real Postgres (`npm run test:db` was not run).
- Stops beyond the 20-lookup cap need a manual **Verify location**. OpenStreetMap lookup stays at 10 per save.
- Unsupported countries (user decision, 24 September: keep the 7 supported countries). An itinerary whose
  source-named city or country is not supported (e.g. "3 day itinerary in Rome, Italy") creates no trip. Its
  places are saved as ideas (library album from the source-named country), the reel keeps `format: "itinerary"`,
  and Home explains that trips cover the supported countries. The destination must be named in the source, so a
  supported country's city missing from the list and named without its country (e.g. "Sapporo") also stays ideas.
  Covered by an integration test; not live-tested with a real unsupported-country video.
- Multi-city itineraries still become one trip for the first named destination.

## Follow-up: Japan places under Unknown country (24 September)

The user reported Japan places in the Inspiration Library's **Unknown country** album. The development database's
current ideas all carried `JP`, but two paths could file Japan places as unknown:

- **Intermittent country detection.** Live runs of the Osaka Short named "Japan" in 2 of 3 extractions and only
  "Osaka" in the other. Ideas had a country only when the source named the country.
- **Keep as ideas instead** read a country from the draft's destination ("Tokyo") and always failed.

**Fix.** `reelCountry` (services/account-reels.ts) uses the source-named country, or else the supported country
whose curated city list contains the source-named city, citing the city. Keep-as-ideas uses the same mapping from
the draft's supported destination. Unlisted cities with no named country stay unknown. Existing rows are not
backfilled. Integration tests: a city-only Tokyo list → JP ("Tokyo"); keep-as-ideas → JP; a Lisbon list with no
country → unknown.
