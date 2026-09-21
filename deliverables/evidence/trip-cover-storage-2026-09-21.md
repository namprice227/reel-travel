# Trip cover private storage — 21 September 2026

## Request and outcome

The user asked to resolve the image/frontend-backend mismatch and store images in Supabase. The implemented
scope is app-owned trip-cover photography. User-uploaded PNG, JPEG and WebP covers are stored in the existing
private asset storage abstraction; the `Trip` document stores only `coverAssetId`. Google place photographs
remain ephemeral through `places.photo` so attribution and provider freshness are preserved.

The six destination-cover and sixteen category-fallback Unsplash URLs were removed. Trips without an uploaded
cover and places without a provider photo now render deterministic SVG artwork instead of an unrelated stock
photo. Shared links continue using illustration because private upload ids are deliberately excluded from the
public projection.

## Contract and persistence

- `Trip.coverAssetId` is nullable and defaults to null for existing rows.
- `trips.cover.upload` accepts one owner-authenticated multipart image up to 4 MiB plus an optional
  `expectedUpdatedAt` stale-write guard.
- File development mode stores bytes under `.local/dev-data/uploads` and metadata in `db.json`.
- Supabase mode stores bytes in the private `reel-private-uploads` bucket and metadata in `reel_assets`.
- `reel_set_trip_cover` atomically inserts new metadata, updates the trip reference, removes replaced metadata,
  preserves the itinerary pointer, serializes storage accounting, and enforces the existing 100 MiB owner quota.
- Bytes are written before the database transaction. Failed transactions clean up uncommitted bytes; successful
  replacements attempt to remove the old object. Ambiguous lost-response cases retain committed bytes.

## UI behavior

Trip Details now includes an upload/replace control and an immediate private preview. My Trips overview,
All Trips and the owner trip header use the uploaded cover through the authenticated `uploads.get` route.
Unsupported formats, empty files, files over 4 MiB, stale tabs and exhausted storage return explicit errors.

## Checks actually performed

- `npm run typecheck`: PASS across all workspaces.
- Targeted Vitest (`trip-cover`, Supabase adapter and contract selection): PASS, 12 tests in 2 discovered files.
- `npm test`: PASS, 395 tests in 31 files.
- `npm run docs:api`: regenerated 34 endpoints and 62 shared types.
- `node --import tsx tests/e2e/trips.mjs` with installed headless Microsoft Edge: PASS, 16 grouped checks,
  including authenticated private-cover image cropping at 1280 px and 390 px, illustrated fallback sizing,
  responsive layouts and no browser runtime errors.
- `npm run build`: PASS; Next.js production compilation, type analysis and all 14 generated pages completed.
- `npm run check`: PASS; workspace type checks, 395 tests, generated API-reference freshness and planning/link
  validation all passed.
- `git diff --check`: PASS; line-ending notices only.

`npm run test:db` was not run because `TEST_DATABASE_URL` is not configured. The disposable-PostgreSQL suite
contains atomic attach/replace, stale-write and browser-role denial coverage for the new migration, but this
document does not claim those SQL assertions ran.

The checked local `apps/web/.env.local` does not currently configure `DATA_BACKEND` or any `SUPABASE_*`
variables, so local runtime verification continues to use the file adapter. No secret values were inspected
or recorded.

## Assumptions and deferred work

- This change stores user-owned cover uploads, not Google provider images or map tiles.
- Shared-trip cover access is deferred. A future share-authorized binary endpoint may expose a selected cover
  without making the bucket public or leaking an owner asset id.
- Automatic cover selection from a confirmed place is intentionally not implemented.
- Applying `202609210001_trip_cover_assets.sql` to hosted Supabase and hosted browser verification remain pending.
- Human visual review remains pending.
