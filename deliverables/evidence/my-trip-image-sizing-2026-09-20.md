# My Trip provider-image sizing — 20 September 2026

## Scope

User-reported frontend defect: Google Places photos have different intrinsic sizes and aspect ratios, which could stretch or collapse image slots in My Trip.

The implementation is limited to the shared place-photo renderer used by My Trip place, itinerary, map and owner-share screens. No Home or Inspiration Library component or stylesheet was changed.

## Cause and change

- Provider `<img>` elements did not receive the `stop-art-sm`, `stop-art-md` or `stop-art-lg` frame class used by the illustrated fallback.
- A later `.place-photo { width: 100%; height: 100% }` rule overrode fixed dimensions such as the 120×96 place header and 88×66 place row.
- `PlaceImage` now applies the requested size class to provider and category-fallback images.
- `.place-photo` keeps centered `object-fit: cover` cropping but no longer overrides the dimensions owned by each My Trip slot.

## Verification performed

- `npm run check` — PASS: TypeScript, 229 tests in 20 files, API-doc check and workspace validation.
- Headless Chromium at 1280×800 against the existing local Google-backed trip — PASS:
  - itinerary photos with different natural sizes (including 800×1067 and 800×1200) all rendered at 96×68;
  - place header photo rendered at 120×96;
  - the lead gallery frame rendered 320px high and the two secondary frames rendered 180px high;
  - every inspected photo reported `object-fit: cover` and centered positioning.

## Remaining verification

Human visual review is pending. The check used existing local provider-backed data and did not make a new Google Places search or modify Home/Library behavior.
