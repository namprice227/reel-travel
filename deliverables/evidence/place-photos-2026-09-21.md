# Google place photos - 21 September 2026

## Implemented

Owner-authorized photo endpoint tied to an existing candidate/provider match. Fresh Details metadata and
one bounded Photo request; no stored photo names or media URLs, no API key in browser responses. Shared
rate limits, strict resource identity, safe HTTPS URLs, Google image-host checks, sanitized failures and
no-store responses. Lazy UI photos in place cards, inspiration details, the ready list and owner magazine;
branch-specific display and photographer/Google Maps attribution. No migration or existing-data rewrite.

## Validation

- 20 targeted provider/service tests passed: fresh metadata, bounded requests, attribution, absent photos,
  unsafe/foreign resources, missing keys, invalid image URLs, ownership, stored-match checks, quotas and
  failure recovery. All fixtures offline and explicitly synthetic.
- Live Google lookup + photo: Tokyo Tower returned a JPEG (67,114 bytes) and one author attribution. Media
  response retrieved successfully; key absent from display response. No provider content saved to disk/DB.
- Nine Chromium checks passed with intercepted synthetic place/photo responses: branch selection and
  switching, attribution, missing/broken images, quota failure, ready list, mobile layout, owner magazine
  and inspiration details. A disposable
  confirmed Supabase test account/trip/session was created for local page access and deleted afterward;
  browser photo tests made zero Google calls. Desktop/mobile screenshots stay in ignored .local.
- `npm run check` passed: type checks, all 378 tests, API documentation freshness and workspace validation.
- `npm run build` passed: optimized Next.js production build and route generation.

## Limits

Photos depend on Google availability and add Details/Photos usage. No image cache or automatic retry loop;
reloading requests fresh metadata. Public shares remain outside this owner-only endpoint. Existing OSM
records do not gain Google photos automatically. UI browser images were synthetic; live media retrieval
was checked separately. This does not claim photo relevance/accuracy or complete Google-platform compliance.

Sources: [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos),
[Places attribution](https://developers.google.com/maps/documentation/places/web-service/policies).

## Integration with latest main

Merged `bc9d6d3`, preserving the redesigned Places/day/detail screens and moving the photo and AI-label
behavior into them. `PlacePhotoResponse` is separate from the legacy stored `PlacePhoto` contract, so old
candidate documents remain readable. New Google imports no longer store expiring photo names; the old
unscoped image proxy returns 410 without provider calls. Full place pages show one fresh photo; map-list
thumbnails keep fallback imagery. No new migration or stored-data rewrite.

Final integration: `npm run check` passed all 391 tests across 30 files, type checks, API documentation
freshness and workspace validation. `npm run build` passed. Eleven Chromium checks passed against the
merged UI, including AI labels/evidence on redesigned rows and full place details. The temporary Supabase
account/trip/session was deleted afterward. Google image retrieval was tested separately before the merge;
these browser checks used intercepted synthetic images and made no Google calls. Independent human review
and hosted deployment remain pending.
