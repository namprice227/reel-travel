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
