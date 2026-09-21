# Practical itinerary generation — 21 September 2026

User requested a reasonable timeline with meals, day trips, seasonal context and nearby suggestions for sparse inputs.

## Implemented

- Prompt itinerary-v3 plans coherent neighbourhood outings around saved inputs, interests, budget, dates and daily availability.
- Pace counts and the single mandatory break are now soft preferences. Visit durations are flexible planning estimates (15–480 minutes), retained across edits. Meals/suggestions retain their earliest proposed start when preceding activities are removed.
- Meal and suggestion stops carry an area and rationale, no confirmed-place IDs or invented coordinates. Destination-only AI planning is supported. Fixed bookings and known facts remain protected; automatic repair is retained.
- Owner day view, timeline and magazine display seasonal advice, suggestion labels and Google Maps search links. Suggestion/meal cards use illustrations rather than unrelated venue photos. Stops without coordinates remain unmapped and partially checked.
- Climate text is AI seasonal guidance, not a live forecast or sourced climate dataset. Recommendations are not automatically verified with Google Places or added to the confirmed library.
- The fingerprint version changed so existing schedules require regeneration. No database migration is required; use matching code on all readers of the new stop kinds.

## Verification

- 443 automated tests across 35 files, workspace typechecks and production build pass.
- Tests exercise destination-only generation, meals, suggested activities, planned duration edits, optional/split rests, fixed bookings, schema/identity checks and preservation of meal timing.
- A live synthetic two-day Tokyo trip with no saved places generated meals and nearby activities plus October seasonal advice in one OpenAI call, using 1,294 input and 485 output tokens. It correctly remained partially checked. This is a development example, not a measured quality benchmark.
- Browser inspected the real DayView component with that synthetic result in an isolated preview. Seasonal label, meal blocks, unverified suggestions, map-search links and absence of invented markers were visible. Fonts/navigation in the preview were test substitutes.

## Limits

No real user trip was overwritten. Authenticated browser-to-Supabase regeneration and independent human review remain pending. Suggestions/seasonal advice need checking; there is no weather API or automatic suggestion lookup. Daily time windows still apply to every date; individual arrival/departure availability is not modeled. Hosted release is pending.
