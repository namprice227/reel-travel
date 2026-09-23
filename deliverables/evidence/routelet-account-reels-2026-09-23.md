# Routelet logo and account reel saving

Recorded 24 September 2026 for the user's Routelet logo and Home request. The supplied JPG is a visual asset. It contains no implementation instructions.

## Scope and decisions

- The supplied logo is stored as `apps/web/public/images/routelet-logo.jpg` and `apps/web/src/app/icon.jpg`. The public and signed-in headers use the Routelet logo/name; app metadata uses Routelet.
- Home submits reel links to account-owned `accountReels.create` without a trip ID or trip prerequisite. It shows saved sources, processing/recovery status, and unverified extracted place ideas in a collapsible section on Home. The existing library navigation and trip screens retain their prior behavior.
- Account reels, place ideas and jobs use separate owner-scoped records. Public YouTube Shorts can use the existing video observation and structured extraction stages without a Places lookup. Other social links remain source records with `SOURCE_INACCESSIBLE`; the user can supply names or caption text on Home. Source text is treated as data.
- Account ideas retain source clues, not canonical addresses, hours, coordinates or branch identities. There is no automatic or UI-driven copy into a trip in this slice.
- The Supabase migration `database/migrations/202609230001_account_reels.sql` must be applied before the matching web and worker are deployed. It has not been applied to a hosted database in this check.

## Acceptance evidence

- `npm run typecheck` passed after the scoped UI correction.
- `npm run docs:api` generated 46 endpoints and 71 shared types.
- `node --import tsx tests/e2e/home.mjs` passed five offline Edge checks: logo, unchanged library navigation, account endpoint with no trip ID, on-Home recovery to a fictional place idea, and no horizontal overflow at 1280 px or 375 px. Screenshots and results are in `.local/home-browser/` (ignored local files).
- `tests/integration/account-reels.test.ts` covers no-trip saving, owner isolation, inaccessible social-source recovery, deduplication of fictional extracted ideas and owner-only deletion. `packages/ai/src/map-places.test.ts` covers the no-provider-mapping path.
- `npm run check` passed TypeScript, 623 tests in 58 files, generated API documentation and planning/link validation.

## Limits and verification still needed

The local browser and integration checks use synthetic sources and fictional places. They do not measure live YouTube access, Gemini/OpenAI extraction accuracy, hosted Supabase behavior or worker concurrency. The hosted migration, live provider check and human review of the Home layout remain pending. Account ideas are not currently selectable in trip planning.
