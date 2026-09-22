# Contextual nearby discovery — 22 September 2026

Task: BE12. User requested nearby suggestions that respect the itinerary timeline, preferences and weather,
including lunch near the following afternoon outing. Implemented on `feat/BE12-contextual-nearby`.

## Changes

- Provider-backed retrieval without a new vector database. The web generation service fetches dated
  forecasts before prompt v5, then searches and fits actual venues after the draft passes compilation.
- Geography comes from saved coordinates or a Google geographic result. The next outing anchors lunch.
  Interest/cuisine keywords, price levels, date/hour-specific weather and travel constrain candidates.
- A free midday gap can receive a provisional lunch; no existing stops or bookings are moved. Regular
  opening hours and both known travel legs must fit. Duplicates and out-of-radius results are excluded.
- Retrieved stops remain suggestions with provider metadata and attribution; they are not confirmed
  places or bookings. Unknown travel/hours remain visible. Edits recheck venue hours.
- Missing provider data leaves provisional ideas. Out-of-horizon weather remains clearly distinguished
  from seasonal advice. No credentials, real user trips or private uploads are included in this evidence.

Implementation: [planner](../../packages/planner/src/nearby.ts),
[provider adapters](../../packages/ai/src/itinerary-discovery.ts),
[server orchestration](../../apps/web/src/server/itinerary-discovery.ts),
[prompt v5](../../packages/ai/prompts/itinerary-v5.ts),
[configuration and selection details](../../docs/operations/itinerary-nearby.md).

## Offline acceptance

The automated suite disables live fetch globally. New tests inject synthetic venues/forecast responses.
Coverage includes geographic bias and thin fields, invalid provider data, closed/unknown hours,
budget and distance rejection, insufficient outbound travel, duplicate IDs, fixed bookings,
weather date/hour/area matching, forecast horizon, per-stay day selection, free-gap lunch insertion,
destination-only provisional neighbours, post-edit hours, search caps and provider failure fallback.

Final verification:

- `npm run check`: PASS; typechecks, **552 tests in 48 files**, API-reference freshness and planning/link validation.
- `npm run build`: PASS; production Next.js compilation, typecheck and route generation.
- `git diff --check`: PASS.
- Local `http://127.0.0.1:3000`: HTTP 200 after the changes.

These tests are deterministic application acceptance, not an accuracy benchmark for Google or a weather forecast evaluation.

## Live read-only checks

Two development probes used local configured credentials and a synthetic Tokyo itinerary. No database
writes, real trip changes, candidate confirmations or bookings occurred. Summaries exclude venue payloads,
credentials and personal information. Standalone scripts were run locally with Node/tsx and the same
production adapters/planner; they are not HTTP/browser acceptance tests.

1. Google + Open-Meteo in parallel, 23 September synthetic trip: **1,632 ms**, 10 Google candidates,
   8 with usable regular hours; a lunch fitted **12:00–12:45**, retaining the **13:30** afternoon outing.
   Zero error conflicts. Open-Meteo returned 16 forecast dates including the requested date.
2. Full prepare → OpenAI generation/repair → enrich path: **9,480 ms**, prompt **itinerary-v5**,
   **2 model attempts**, 1 relevant forecast day. Generated lunch 12:00–12:45, saved-place visit
   14:00–15:00 and dinner 18:00–18:45; both meals received provider-listed venues. Zero error conflicts.
   Status correctly remained `partially_checked` because the synthetic saved place had unknown hours.

These are one-off development observations, not a reliability rate or comparative benchmark. The 13:30
outing in probe 1 was fixed in its supplied draft; probe 2 let the model choose a different flexible visit time.
The frozen v3 Gemini/Ollama/OpenAI benchmark artifacts were not modified or rerun.

## Limits and review

Forecasts/venue facts are dated snapshots. Regular hours do not certify holiday opening or seating;
dietary keyword matches do not certify dietary compliance. Travel uses the existing distance estimate,
not live routes. At most two suggestion slots/day are retrieved. Other ideas may remain provisional.
Commercial Open-Meteo hosting requires an appropriate subscription; the free endpoint is non-commercial.
Generation token/latency metadata still measures the model only, excluding retrieval cost and latency.

No hosted deployment or human usability review is claimed. Changes to labels were compiled in the
production build; a visual browser review and the user's own trip acceptance remain pending.

## Latest-main integration

Synced this branch with `origin/main` at `e892438` (PR #21). Resolved the shared Google Places helper
conflict while retaining all incoming details fields; retained both contribution records and regenerated
the API reference. After resolution, `npm run check` passed (552 tests, 48 files) and `npm run build` passed.
