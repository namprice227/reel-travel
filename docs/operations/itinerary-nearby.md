# Contextual nearby itinerary suggestions

Implemented 22 September 2026. The existing Generate action retrieves dated weather before the model,
then searches for real venues against the compiled timeline. This is provider-backed retrieval, not a
private vector database or a claim that model knowledge verifies a place.

## Configuration

The web process uses the existing `GOOGLE_PLACES_API_KEY`, `PLACES_PROVIDER=google` and AI itinerary
provider. `ITINERARY_NEARBY_ENABLED=false` disables discovery. Baseline/fake mode remains offline.
No extra worker is required; restart the web process after changing environment variables.

`ITINERARY_WEATHER_PROVIDER=open-meteo` is the default; `none` disables forecast requests.
An optional `OPEN_METEO_API_KEY` selects the paid customer endpoint. The public Open-Meteo service is
for non-commercial use; a commercial deployment needs the appropriate subscription. Attribution
appears in the itinerary. See [Open-Meteo terms](https://open-meteo.com/en/terms).

## How it chooses nearby venues

1. Resolve a geographic center only when there are no saved coordinates. A returned city/region is an
   anchor, not a confirmed attraction. Otherwise use saved places and each date's accommodation.
2. Fetch hourly apparent temperature (Celsius), rain probability and weather codes in the trip timezone,
   only if the trip overlaps the 16-day forecast horizon. Keep only the matching day at its selected
   planning location. Model prompt `itinerary-v5` receives this dated context alongside preferences.
3. Compile the model draft using the existing saved-place and booking constraints. If lunch is missing,
   add a provisional window only when a free midday gap has at least 60 minutes after basic buffers.
   Never replace rest blocks or move bookings to make lunch fit.
4. Search meal/activity slots near the **next located outing**, then the previous stop, that date's stay,
   or a provider-resolved destination center. Meals (lunch first) and the model's suggested activities have
   separate budgets: two meal and two activity searches/day, 20/generation. Meals use a 1 km radius. A
   suggested activity with an area is searched by its own title and area (English names, 25 km radius; the
   time and travel fit still decides); generic activity filler uses 1.5 km walking or 3 km otherwise.
   These are application heuristics, not Google guarantees.
5. Cuisine keywords guide restaurant search. Art, history, shopping and nature interests guide activity
   categories. Low/medium budgets exclude known price levels above 1/2; unknown prices remain labeled.
   Within a matching forecast's 25 km area and slot hours, rain probability >=60%, precipitation codes,
   apparent temperature >=32°C or <=0°C prefer indoor categories. These thresholds are planning
   heuristics, not a safety forecast. No dated data means uncertainty, not an assumption of fine weather.
6. Reject closed businesses, duplicate provider IDs (including confirmed saved places), out-of-radius
   matches, known over-budget venues, unsuitable categories and candidates without usable regular hours.
   Fit a 45-minute meal (60 for relaxed pace), or up to 60 minutes for generic activity filler, bounded by
   the original slot. A named suggestion is grounded only by a listing whose name matches it (at least 60%
   of the listing's name words appear in the idea's title or area; whole cities/regions never match). It
   keeps its title and planned length (shortened for travel, never below half), may keep unknown hours
   (labelled "hours not listed"), and is still rejected when known hours are closed. No match leaves the
   idea provisional rather than swapping in unrelated filler (24 September 2026 fix). Check inbound and outbound estimated travel with buffers; keep existing blocks fixed.
   Revalidate the full day before accepting each venue. Generic neighbours can remain unlocated and
   explicitly partially checked; an unlocated adjacent booking prevents automatic venue fitting.
7. Save optional `suggestedVenue` metadata: provider ID, retrieval time, regular hours, category, price
   level and attribution. Venue name/coordinates come from Google, never from model prose. The stop
   remains `meal`/`suggestion`, with no confirmed place ID or reservation. Later edits recheck listed hours.

The Google request uses a thin field mask and geographic bias. Local distance filtering is necessary because
bias is not a boundary. It deliberately omits `openNow`, which would describe the current time, not a future
lunch. Regular hours can differ on holidays; users still need to check special hours, dietary suitability,
seating and availability. See [Google Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search).
Weather is a changing forecast, not seasonal climate data; dates beyond the forecast horizon retain separately
labeled seasonal advice. See [Open-Meteo forecast documentation](https://open-meteo.com/en/docs).

## Bounds, fallback and limitations

At most one geographic lookup, seven deduplicated forecast requests, and 20 nearby searches. Each request
has a 2.5-second timeout, abort signal and 2 MB response bound. Forecasts run concurrently, followed by the
existing 40-second total model deadline and concurrent nearby searches: nominal external waiting ceiling
47.5 seconds, excluding database/CPU overhead, within the route's 60-second limit. No lookup retries.
The existing per-user generation quota applies before discovery. Field masks with hours/price incur the
applicable Google billing tier; request caps are not a dollar limit. No additional cache/vector index is added.

Lookup failure or no fitting result leaves an honest provisional suggestion. A city-only plan can therefore
remain partially checked. Weather and venue snapshots are dated, not refreshed automatically when reopening
an itinerary. Travel remains the existing distance-based estimate, not live directions/transit timetables.
Dietary keywords and indoor categories are hints, not independently certified facts. Searches are capped at
two meals and two suggested activities per day; this does not guarantee a restaurant for every meal, a listing
for every idea (e.g. a generic "vintage-shop walk" returns individual shops, none of which it names) or fill
every spare minute. Existing itineraries change only when regenerated.

Saved generation latency/tokens measure the model wrapper only; they exclude this new retrieval latency and
Google/Open-Meteo costs. The older provider benchmark is not rerun or rewritten by this feature.
