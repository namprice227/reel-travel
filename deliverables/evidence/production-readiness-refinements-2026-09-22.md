# Production-readiness refinements — 22 September 2026

Scope: user-requested follow-up to the MVP/production audit. Work was performed on
`fix/production-readiness-refinements` after a clean fast-forward pull of `main`.

## Implemented

- Google Places Text Search is one request with at most 10 candidates and an identity/branch-only field mask.
  Rich ratings, reviews, contacts, hours and atmosphere fields are no longer bulk-fetched or persisted; every
  omitted fact is listed in `unknownFields`. Fresh owner-only photos remain the only on-demand rich display path.
- Google-derived coordinates render on Google Maps rather than OpenStreetMap tiles.
- Production Google lookup fails closed until an operator explicitly records completion of the current policy,
  retention, attribution and billing review with `GOOGLE_PLACES_POLICY_REVIEWED=true`.
- Place labels now distinguish provider matching, confirmation and actual scheduling. Browser-clock “Open now”
  claims were removed; planned-visit checks correctly handle 24-hour/overnight windows.
- Provider URLs are HTTPS-only and provider-authored strings/arrays are bounded by shared contracts.
- `replace_stop` now has a server-validated `dryRun` preview marked “not saved”; applying is a separate write using
  the saved version. Locked bookings still have no controls.
- The Gemini schema adapter preserves JSON Schema `const`, with discriminated-union regression coverage.
- A bounded analytics endpoint and optional server-side HTTPS webhook sink were added. Product events carry only
  allowlisted names and small scalar metadata. The router no longer executes post-response work twice.
- Public Privacy and Terms pages, sitemap/footer links, CSP and baseline response security headers were added.
- The offline browser harness now has an npm command, system-browser discovery and repaired CSS bundling/mocks.

## Verification actually run

- `npm test`: PASS — 46 files, 542 tests.
- `npm run test:e2e:offline`: PASS — saved-place checks plus My Trip desktop/tablet/390px/320px checks; no runtime
  errors or unexpected requests. The replace preview remained unsaved until Apply, and Google-derived owner maps
  made no OpenStreetMap tile request.
- `npm run build`: PASS — Next.js 16.3.5 production build, including `/privacy` and `/terms`.
- `npm run check`: PASS — typecheck, 542 tests, generated API reference check and planning validator.
- `git diff --check`: PASS; only repository line-ending warnings were printed.

All provider responses in automated tests were synthetic. No live Google, AI, analytics, Supabase or deployed-host
call was claimed by this run.

## Deployment and product gates still requiring people/accounts

- Deploy the existing Render worker blueprint (or another always-on Node host), configure secrets, then perform the
  documented crash-recovery and queue-age checks. A local test cannot prove hosted worker availability.
- Select/configure an analytics provider via `ANALYTICS_ENDPOINT` and `ANALYTICS_WRITE_KEY`, then capture its report.
- Publish the operator/privacy contact, approve the legal text, and implement/verify account export and deletion
  before a general public launch.
- Apply and verify pending Supabase migrations, exercise the full deployed journey, and conduct human accessibility,
  place-match and itinerary-quality review.
- Route-aware travel remains a labeled straight-line estimate; browser-only private notes and community Discover
  remain explicitly scoped/deferred rather than represented as production-complete.

## Sources checked

- Google Places API policy requires public Terms/Privacy pages, provider attribution and restrictions on caching
  provider content: <https://developers.google.com/maps/documentation/places/web-service/policies>.
- Singapore PDPC guidance describes notification, purpose limitation, accountability and public contact obligations:
  <https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act/data-protection-obligations>.
