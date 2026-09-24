# Inspiration library: country albums

## 24 September 2026: account place library

The user replaced the trip-save gallery with an account-owned place library. `/inspiration-library` now reads
`accountReels.list`, groups extracted places by source-supported country, and opens a country into an image-led
place grid. Reel links remain attached as evidence in the place drawer; they are not gallery cards. Reels that
produce no place are absent. Itinerary reels that became draft trips are also absent unless the traveler chooses
“Keep as ideas instead.”

Country grouping uses `AccountPlace.country`, which carries an ISO country code and the literal source excerpt.
The extraction path stores it only when the source supports the country: either the source names the country, or
it names a city on the curated supported-destination list (`SUPPORTED_COUNTRIES`, e.g. "Osaka" -> Japan), in which
case the city is the stored excerpt. Existing or new ideas without that evidence appear under **Unknown country**.
The UI does not infer a country from an area, cuisine, landmark or an unlisted city.

The current account-place model has no verified provider location or provider photo. Country covers and card
art are therefore labelled illustrative. Actual venue photos remain deferred until account ideas have a verified
provider identity and the existing owner-checked photo path can be reused.

The trip-scoped implementation below records the superseded 16 September behavior and its original evidence.

## Interaction

- `/inspiration-library` opens an overview of countries that contain saves. Country counts merge saves from all of the owner's trips; countries with no saves are not fabricated.
- `/inspiration-library?country=JP` opens Japan. Country navigation survives reload and browser history. Existing `?trip=:id` links open that trip's country collection and retain trip scoping; “Show all trips” removes that scope.
- Search at the overview searches all saves, including original text, notes, recovery details, URL, destination and category. Search inside a collection stays within it.
- Category buttons and the city selector filter the grid or compact list. Counts reflect search/city selection. One save can be in several categories without duplicating its source or its album count.
- “Add inspiration” opens the existing save composer as a modal, with the current country's trip selected when available. Users can still choose another trip. After saving, the destination collection opens and imports continue polling.
- A save opens a right-hand modal drawer containing its status, original source, trip, categories, place matches and review link. Add details, retry and skip use the existing API flows. Escape/close restore focus; Tab and Shift+Tab stay in the modal.
- “Needs review” gathers failed/unreadable sources, unresolved place matches and unknown countries. Unknown countries also remain visible in an Unsorted album with a link to edit the trip destination.
- Albums/gallery use one scroll region on laptops and a single column with normal page scrolling on phones. Category filters scroll horizontally on narrow screens.

## Data and boundaries

No API, database or auth contracts changed. The page still reads `trips.list`, `inspirations.list` and `places.list` through the typed API client. Source images use the owner-only `uploads.get` URL.

Country grouping is a **transitional lookup, not an AI/geocoding implementation**: exact explicit country names/codes at the end of comma-separated destinations are recognized; otherwise a small list of common city names is recognized. Explicit country suffixes take precedence. Unknown strings and unsupported multi-destination strings remain Unsorted. The city selector uses the trip destination, not independently extracted place cities. Country-only destinations have no city filter value.

Categories come from existing place options (selected option when confirmed; all plausible options otherwise). Rejected candidates do not contribute categories. Markets appear under Food & drink and Shopping. Category grouping does not confirm a candidate or establish place accuracy. Fixture venues remain visibly marked Sample data.

Notes show actual excerpts; links show their source domain and any supplied note; screenshots use the actual private upload with a fallback if loading fails. The contracts do not contain reel/venue thumbnails, so no unrelated image is presented as a source preview. Generated cover art is explicitly labeled illustrative. Other countries reuse the existing generated SVG skyline; Unsorted uses a neutral globe tile.

Pending product work: real AI extraction/location metadata, arbitrary city geocoding, reel thumbnails, per-save manual category/country overrides and saving without a trip. Editing the trip destination is supported through the existing setup page. No provider capability is claimed by the UI.

## Verification

See the [implementation evidence](../../deliverables/evidence/M17-2026-09-16-library.md) for commands, actual results and limits. Pure grouping acceptance cases live in [library-model.test.ts](../../tests/integration/library-model.test.ts); browser checks live in [library.mjs](../../tests/e2e/library.mjs).

## Cover asset and generation prompt

Asset: [country-covers.png](../../apps/web/public/images/library/country-covers.png), 2172 × 724 pixels. Generated using the **built-in imagegen tool**, then copied into the workspace. CSS displays the three equal panels independently; no external image host or runtime generation is required.

Exact prompt:

```text
Create a single wide photographic travel cover atlas image, aspect ratio 3:1. Exactly three equal-width square photographic panels touching edge to edge with no gaps, frames, text, typography, logos or watermarks. Left third: atmospheric traditional Kyoto style Japanese street with a pagoda roof silhouette, wooden facades, soft cherry blossoms, warm morning light, empty street. Middle third: Seoul style city skyline with a tall slender observation tower on a forested hill, layered city buildings, soft blue dusk and a blush pink horizon. Right third: Thai style ornate golden Buddhist temple surrounded by tropical palms and lush greenery in warm daylight. Editorial travel magazine photography aesthetic, realistic textures, beautiful restrained warm natural colors, elevated but authentic. These are illustrative country album covers, not evidence or photos of any saved business. Keep all important imagery within its own third so each square panel can be shown separately as a website cover using CSS. No UI, no labels, no collage overlaps. Large high quality image.
```
