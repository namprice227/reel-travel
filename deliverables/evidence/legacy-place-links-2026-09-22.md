# Saved-place URL compatibility repair — 22 September 2026

Production Inspiration and trip-detail pages returned HTTP 500 from places and itinerary reads. Vercel error logs identified `Expected HTTPS` in saved candidate option website URLs following stricter place contracts.

Storage readers now omit invalid optional website/provider/review links before strict candidate validation. Both options and the confirmed selection are handled. IDs, evidence, coordinates, status and saved itineraries remain intact. No HTTP URL is guessed to have an HTTPS equivalent. New Supabase writes retain the strict contract. Exact original storage snapshots are retained in a WeakMap for optimistic writes, so normalization/defaults neither prevent valid updates nor bypass concurrent changes. Development storage follows the same read behavior. Fresh Google details similarly omit invalid optional links and flag missing website/provider URLs.

Validation:
- `npm run check`: PASS, 581 tests in 53 files; workspace type checks, API documentation check and planning validation pass.
- Synthetic regressions cover legacy get/list reads, option and selected URLs, review links, preserving evidence and coordinates, rejecting invalid coordinates/new writes, and optimistic write success/stale rejection in Supabase and file adapters.
- Authorized read-only probe of the affected production trip: 33 candidates, 5 invalid under the prior direct parser; all 33 pass after compatibility handling. Existing itinerary read succeeds. Zero database writes; no private records or URLs included in this evidence.
- Production deployment and browser confirmation recorded below after rollout. The service probe is not an authenticated browser test.

Rollout: Vercel production build PASS; deployed to https://reel-travel.vercel.app (immutable deployment https://reel-travel-gcopaebjp-lilducklings-projects.vercel.app). Browser retry remains the final user confirmation of the reported screens.
