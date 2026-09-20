# My Trip cover sizing — 20 September 2026

## Scope

User-reported defect on `/my-trip`: the “Happening now” destination image became tall enough to make the trip list unnecessarily long. The change is limited to `apps/web/src/app/styles/trips.css`; Home, Inspiration Library and trip-detail layouts are unchanged.

## Cause and correction

The cover root and its `<img>` both used percentage heights while the grid row had no definite height. The browser therefore used the downloaded image's portrait aspect ratio to size the grid row. The cover measured 360×540 at a 1280×800 viewport and 352×528 at a 390×844 viewport.

The My Trip cover is now sized by the card/grid. Its photo or SVG is positioned inside that bounded frame and cropped by the existing `object-fit: cover` rule. The existing minimums remain 210px on desktop and 150px on narrow screens.

## Runtime verification

Headless Chromium against the existing local `/my-trip` route:

| Viewport | Before | After |
| --- | --- | --- |
| 1280×800 | 360×540 cover; 542px card | 360×227 cover; 229px card |
| 390×844 | 352×528 cover; 757px card | 352×150 cover; 379px card |

`npm run check` passed: TypeScript, 229 tests in 20 files, API-doc check and workspace validation. Human visual review remains pending.
