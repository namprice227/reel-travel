# Home reference redesign — 16 September 2026

Task: FE01, with the existing FE02 import form. User requested implementation of the supplied reference with the existing side navigation and no Home trip selector.

## Implemented

- Centered greeting, large Newsreader headline, wide save composer (approximately two thirds of the available desktop canvas), tilted photographic postcards and pale blue accents.
- Four equal quick-access cards with generated watercolor decoration; mobile uses two columns. Handwritten decoration uses Caveat through Next's font loader, with a system handwriting fallback.
- Existing link, note and screenshot import endpoints remain connected. Home hides the trip selector; library forms keep it. Existing loading, no-trip, validation, failure and success states remain available.
- Continue planning uses the existing upcoming-trip selection and actual trip title/link. Its neutral landscape illustration avoids implying that every trip is to Japan.
- Generated decoration is stored locally as optimized WebP, approximately 589 KB total. [Assets and exact built-in imagegen prompts](../../../apps/web/public/images/home/README.md).

## Actual verification

- `npm run check`: PASS — workspace type checks, 91 tests, API documentation consistency and planning/link validation.
- `node --import tsx tests/e2e/home.mjs`: PASS — [13 browser checks](results.json). Uses separately installed Playwright and Chromium via `PLAYWRIGHT_MODULE_PATH` / `PLAYWRIGHT_EXECUTABLE_PATH` when needed.
- Browser checks cover 1586, 1366, 820, 375 and 320 px widths; composer width; clipped controls; input modes; default-trip submission and confirmation; failed-save retry; screenshot validation and multipart upload; keyboard access; shared library picker; no-trip and API-error states. No browser runtime errors.
- Agent visually inspected desktop, laptop and mobile screenshots and corrected the laptop annotation overlap and small-screen button clipping.
- [Desktop preview](desktop.png) and [mobile preview](mobile.png) use synthetic trip data. Mobile's existing fixed navigation appears at viewport height in the full-page capture; content scrolls behind it.

## Limits and pending verification

### Compact-layout follow-up

The user requested a desktop Home that fits without scrolling, with quick-access titles beside their icons. Home-only CSS now reduces composer spacing, aligns card icons and titles horizontally, caps postcard size to avoid the Quick access heading, and compresses footer decoration. On short desktop windows the save helper sits beside the button and the screenshot field uses a compact layout. The subtitle's zero line-height from an intervening user edit was restored to readable spacing; unrelated global styles and the smaller headline were preserved.

`node --import tsx tests/e2e/home.mjs`: **16 checks PASS** after this CSS change. The full initial Home (including footer) fits without vertical scrolling at 1586×992, 1366×768, 1280×630 and 1280×600; all three import modes fit at 1280×600. The fixture now includes a longer sample trip title. Tablet/mobile checks and save/retry regressions also pass. [Compact preview](compact.png), [recorded results](compact-results.json). These remain isolated browser checks, not live server verification. No server was started and the full unit suite was not rerun for this CSS-only follow-up.

Mobile, extreme zoom, expanded textareas and additional error/status content may scroll so content stays accessible. The layout uses natural sizing rather than hiding overflow to force a fit.

No development server was started. Browser acceptance bundles the real components, hooks, API client and styles, substitutes Next navigation with anchors, and intercepts API calls. It does not verify Next server rendering, live authentication, Supabase persistence, extraction providers or real destinations. Cached Inter/Newsreader are used in the screenshots; handwriting uses Segoe Print in the isolated preview. The new Caveat font's download and rendering in Next need a normal development/build run.

The API still requires a trip ID. Home retains the existing choice: earliest upcoming/draft trip, otherwise the most recently updated trip. A save confirmation names that trip. Automatic AI trip assignment and saving before creating any trip are **not implemented** by this visual change. A first-time user sees the create-trip prompt. No provider capabilities are newly added.

Human visual acceptance and live application verification remain pending. Existing unrelated user changes to library, trips and lockfile were preserved.
