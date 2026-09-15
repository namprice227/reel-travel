# Handover: Reel Travel app base

Updated 15 September 2026. The team now works in two tracks: **frontend** (Members 1 and 2) and **backend**
(Members 3 and 4). Read this first if you are picking up work. It tells you what already works, which folders and
files are yours, what to build next, where the two tracks meet, and which documents hold the detail.
Where another document already explains something, this one links to it instead of repeating it.

1. [Where the project is](#1-where-the-project-is)
2. [Get it running](#2-get-it-running)
3. [How the code is organised](#3-how-the-code-is-organised)
4. [Where frontend and backend meet](#4-where-frontend-and-backend-meet)
5. Your part. Frontend: [Member 1](#member-1-frontend-capture-review-landing-and-brand) ·
   [Member 2](#member-2-frontend-itinerary-views-sharing-and-quality).
   Backend: [Member 3](#member-3-backend-ai-extraction-places-and-evaluation) ·
   [Member 4](#member-4-backend-data-platform-and-planner)
6. [Working together](#6-working-together)
7. [Open decisions and known limitations](#7-open-decisions-and-known-limitations)
8. ["I want to…" quick reference](#8-i-want-to)
9. [Document index](#9-document-index)

## 1. Where the project is

The code is on GitHub at `namprice227/reel-travel`. Every MVP story from the [scope](product/scope.md) runs end to end.
The screens, API, rules and tests are real code. Some pieces are **stand-ins** so everyone could start at once; their
owner replaces them behind the same interface, so nobody else's code has to change.

| Area | Works now | Stand-in to replace | Frontend | Backend |
| --- | --- | --- | --- | --- |
| Sign-in and data | Trips saved per account; other accounts are blocked | Email-only sign-in, local JSON file store | Member 1 | Member 4 |
| Import (US-01) | Quick Save on signed-in Home plus the trip inspiration screen; text, link and screenshot saves; background jobs with retries; add details, retry, skip | Fake extractor over fictional venues | Member 1 | Member 3; job runner Member 4 |
| Places (US-02) | Evidence on every place, branch choice, duplicate merge, map | Fixture place lookup | Member 1 | Member 3 |
| Trip setup (US-03) | Trip details, preferences, bookings | None | Member 1 | Member 4 |
| Itinerary (US-04, US-05) | Saved versions, conflicts, move/remove/add stops, locked bookings protected | Baseline greedy planner, straight-line travel times | Member 2 | Member 4 |
| Views (US-06) | Timeline, map and magazine from one saved version; left-side day navigation; expandable map | Browser and usability review still pending | Member 2 | Member 4 |
| Sharing (US-07) | Create and revoke read-only links; uploads stay private | No rate limits | Member 2 | Member 4 |
| Landing and brand | Simplified editorial landing page and signed-in Home dashboard | Final copy, imagery, pricing and brand approval | Member 1 | — |
| Analytics and deployment | Events only logged; nothing deployed | Analytics provider, hosting, job schedule | Member 2 (events) | Member 4 |
| Tests | 45 unit and integration tests, API smoke test | No browser tests | Member 2 (browser) | Members 3 and 4 |

**Checked:** on 15 Sep, `npm run check`, `npm run build` and the 13-step API smoke test passed after the frontend pass below. A browser walkthrough was last recorded on 14 Sep, before this redesign, so visual and interaction review must be repeated.

### Frontend implementation update — 15 September 2026

The requested Editorial Blue pass is now applied to the working app, not only the raster concepts.

**Implemented in this pass**

- Authenticated shell with a collapsed icon rail that expands on hover or keyboard focus, can be pinned, and becomes bottom navigation at phone width.
- Signed-in `/` is a short Home dashboard. Its Quick Save form calls the existing inspiration APIs for reels/links, notes and screenshots; full recovery remains available in the trip Inspiration screen.
- My Trips cards open the itinerary. Creating a trip now opens Trip details before planning.
- Timeline and Magazine show Day 1, Day 2 and later days in a left rail and render only the selected day. Magazine now retains breaks and estimated-travel rows instead of filtering them out.
- Map view has an Enlarge map / Close map state. It still uses the same saved itinerary object and OpenStreetMap attribution.
- Public Landing, trip tabs, controls and copy were simplified. Unknown hours, stale inputs, conflicts and fixed bookings remain visible.

**Still not implemented or not verified**

- No global cross-trip Saved Inspiration taxonomy exists yet; the contract lists inspiration per trip. Country -> city -> category needs a product/contract decision before it can be real data.
- Place-detail review feeds, tagged-reel grouping and private place notes are still design concepts. The current contracts do not return those fields.
- Discover/community remains deferred. Real AI/place providers, durable database, real auth, hosting, rate limits and analytics provider remain backend work.
- No automated browser suite exists. This pass ran typecheck, all 45 tests, API-doc validation, planning validation, production build, the 13-step HTTP smoke flow, and public/authenticated SSR copy checks. Keyboard, phone-width and visual checks still need a human browser pass.

**Not done:** FE01 and the touched frontend slices in [tasks.csv](../planning/tasks.csv) remain `in_progress`: the shared visual system is implemented, but human visual/accessibility review and task-specific acceptance evidence are pending. Other tasks remain `todo`. Task ids changed on 15 Sep from A01–D08
to FE01–FE16 and BE01–BE16; the old-to-new mapping is under DEC-09 in [decisions.md](../planning/decisions.md).
Several tasks due 12–15 Sep changed owner the same day: agree realistic dates at the next blocker check and update tasks.csv.

**Schedule:** G1, the import slice, is due 15 Sep; G2, the complete trip slice, is due 16–18 Sep.
Dates and gates: [roadmap](../planning/roadmap.md). Ownership and reviewers: [team.md](../planning/team.md).

## 2. Get it running

Needs Node.js 20.9 or newer and Python 3.

```bash
npm install
npm run seed      # synthetic Tokyo trip for alice@example.test; bob@example.test has none
npm run dev       # http://localhost:3000
```

Open http://localhost:3000, choose **Sign in**, then the **Alice** demo button. Walk the core demo on the seeded trip:

1. **Inbox:** the Instagram link shows *Needs details*. Type `light museum` and press *Add details and retry*.
2. **Places:** under *Choose the right branch*, pick a Kumo Ramen branch and press *Confirm selected*.
3. **Setup:** the locked dinner is on Thu 1 Oct, 19:30–21:00.
4. **Itinerary:** a banner says inputs changed. Press *Regenerate*, move a stop with ↑ ↓, then open *Map* and *Magazine*: all show the same version number.
5. **Share:** create a link, open it in a private window, revoke it, reload the private window.
6. **Sign out**, sign in as **Bob**, paste Alice's trip URL: *Not found*.

The fake extractor recognises the venue names in [gazetteer.ts](../packages/ai/src/gazetteer.ts) (for example
"Kumo Ramen", "sky deck", "lantern temple"). A `"quoted name"` it doesn't know becomes a *No match* place.
A text save containing `[[fail]]` fails until details are added. Links and screenshots always need details.

| Command | Use it to |
| --- | --- |
| `npm test` | Run unit and integration tests |
| `npm run smoke` | Run the core demo over HTTP (app must be running) |
| `npm run typecheck` | Find every place a contract change breaks |
| `npm run docs:api` | Regenerate the API reference after changing a contract |
| `npm run check` | Run everything above except smoke, plus the planning validator. Do this before every PR. |
| `npm run seed` | Reset your local data |
| `npm run worker` | Run due import retries (needs `WORKER_SECRET` in `apps/web/.env.local`) |

Then read, in this order: the [README](../README.md) → [how frontend and backend connect](features/README.md) →
section 4 below → your section → your rows in [tasks.csv](../planning/tasks.csv).

## 3. How the code is organised

```text
apps/web/src/
  app/                  Routes only. Each page renders a feature component.     frontend
  features/auth, trips, inbox, places, landing                                  Member 1
  features/itinerary, magazine, sharing                                         Member 2
  components/           Shared UI kit and map                                   Member 1 (Member 2 uses)
  lib/                  Typed api() client, hooks, analytics                    Member 2 (format.ts: Member 1)
  server/http/          Contract router: validates every request and response   Member 4
  server/handlers/      One small handler per endpoint                          backend owner of the feature
  server/services/      Business rules and ownership checks                     backend owner of the feature
  server/jobs/          Import pipeline (Member 3) and job runner (Member 4)
  server/db/, auth/     Repository interfaces, dev file store, session cookie   Member 4
apps/worker/            Triggers due import retries                             Member 4
packages/contracts/     Data shapes, endpoint list, fixtures                    shared boundary (section 4)
packages/ai/            Extractor and place lookup                              Member 3
packages/planner/       Scheduling, validation, edits (no I/O)                  Member 4
database/               Future migrations; seed script                          Member 4
evals/                  AI evaluation datasets and results                      Member 3
tests/integration/      Service-level tests                                     Members 3 and 4
tests/e2e/              Browser tests (empty)                                   Member 2
scripts/                Smoke test, API docs generator, planning validator      Member 4
```

**What one request goes through**, using "confirm a place" as the example:

1. [PlaceCard.tsx](../apps/web/src/features/places/PlaceCard.tsx) (Member 1) calls `api("places.confirm", { params, body })`
   from [api-client.ts](../apps/web/src/lib/api-client.ts). TypeScript knows the URL, the body and the response from the contract.
2. The request reaches [router.ts](../apps/web/src/server/http/router.ts) (Member 4). It finds `places.confirm` in
   [api.ts](../packages/contracts/src/api.ts), checks the session and validates the params and body.
3. [handlers/places.ts](../apps/web/src/server/handlers/places.ts) calls `confirmPlace()` in
   [services/places.ts](../apps/web/src/server/services/places.ts) (Member 3).
4. The service checks the trip belongs to the user, merges duplicates and saves through `repos()` (Member 4).
5. The router validates the result against the response schema and returns JSON.
   Errors always come back as `{ "error": { "code", "message", "details" } }`.

Full explanation: [features/README.md](features/README.md). Every endpoint's request, response, errors and owners:
[api/endpoints.md](api/endpoints.md).

## 4. Where frontend and backend meet

The boundary is the API contract in [packages/contracts](../packages/contracts/README.md). Each endpoint there names its
frontend owner and its backend owner.

| Track | Changes | Leaves to the other track |
| --- | --- | --- |
| Frontend (Members 1, 2) | `apps/web/src/features`, `components`, `lib`, `app` pages and styles, `tests/e2e` | `apps/web/src/server`, `packages/ai`, `packages/planner`, `database`, `apps/worker` |
| Backend (Members 3, 4) | `apps/web/src/server`, `packages/ai`, `packages/planner`, `database`, `apps/worker`, `evals`, `tests/integration` | Screens, components and styles |
| Shared | `packages/contracts`: the frontend owner proposes a change, the backend owner implements the server side, both review | — |

**When a screen needs something the API doesn't return:**

1. The frontend owner edits the schema or endpoint in `packages/contracts` and the screen, in a PR titled `contract: …`.
2. `npm run typecheck` lists the server handlers and services that no longer fit. The backend owner implements them in
   the same PR or a follow-up.
3. Until the server side lands, the screen renders fixtures from `@reel/contracts/fixtures`.
4. Run `npm run docs:api` and `npm run check`; both owners approve. Prefer adding optional fields over renaming.

**Task pairs that must agree early**

| Frontend task | Backend task | Agree on |
| --- | --- | --- |
| FE02 inbox (Member 1) | BE02, BE04 extraction and import jobs (Member 3) | Progress states, `failureCode` messages, recovery flow |
| FE04 places (Member 1) | BE03 lookup and dedupe (Member 3) | Option details, evidence display, merge behaviour |
| FE05 sign-in and setup (Member 1) | BE10 auth, BE12 validation (Member 4) | Real sign-in flow, validation messages |
| FE03 landing pricing (Member 1) | BE14 timing and cost (Member 4) | Cost figures behind the proposed price |
| FE09, FE10 itinerary and views (Member 2) | BE12, BE13 planner and edits (Member 4) | Conflict wording, edit rules, `dryRun` previews |
| FE11 sharing (Member 2) | BE13 safeguards (Member 4) | Revoked and rate-limited states |
| FE12 browser tests, FE13 analytics (Member 2) | BE11 deployment and analytics provider (Member 4) | Deployed URL, event names, provider |

## 5. Your part

Each section lists your tasks, what to read, the files you own, what to build next, who you coordinate with,
and how to check your work. Task dates come from [tasks.csv](../planning/tasks.csv); reviewers from [team.md](../planning/team.md).

### Member 1 (frontend): capture, review, landing and brand

| | |
| --- | --- |
| Tasks | FE01 first screens and shared UI kit (12 Sep) · FE02 inbox import and recovery UI (15 Sep) · FE03 landing page (15 Sep) · FE04 place confirmation UI and map (17 Sep) · FE05 sign-in, trip list and setup screens (18 Sep) · FE06 observe pilot capture and review (21 Sep) · FE07 brand and launch kit (22 Sep) · FE08 evidence and answers (23 Sep) |
| Milestones | M04, M06, M14, M17, M18; also assembles M00 |
| Reviewer | Member 2 |
| Read | [F1 Import](features/F1-import.md), [F2 Places](features/F2-places.md), [F3 Trip setup](features/F3-trip-setup.md), the screen part of [F0](features/F0-foundation.md), [design notes](design/README.md), [launch kit](../deliverables/launch/launch-kit.md) |

**Your files** (under `apps/web/src/` unless noted)

| File or folder | What it does now | Task |
| --- | --- | --- |
| [components/ui.tsx](../apps/web/src/components/ui.tsx), [app/globals.css](../apps/web/src/app/globals.css), [app/layout.tsx](../apps/web/src/app/layout.tsx) | UI primitives, all styles, site header and metadata. Member 2 builds on these. | FE01 |
| [lib/format.ts](../apps/web/src/lib/format.ts) | Status labels, dates, opening-hours text | FE01 |
| [features/library/](../apps/web/src/features/library/InspirationLibraryPage.tsx), [features/inbox/](../apps/web/src/features/inbox/InspirationCard.tsx) | Inspiration library at `/inspiration-library` (grouped by destination, trip and type; polls while imports run); save form and add details / retry / skip card | FE02 |
| [features/landing/](../apps/web/src/features/landing/LandingPage.tsx) | Placeholder landing page | FE03 |
| [features/places/](../apps/web/src/features/places/PlacesPage.tsx) | Candidates grouped by status, branch choice, evidence, map | FE04 |
| [components/MapView.tsx](../apps/web/src/components/MapView.tsx), [PlaceMap.tsx](../apps/web/src/components/PlaceMap.tsx) | Leaflet + OpenStreetMap map; Member 2 reuses it for the itinerary | FE04 |
| [features/auth/SignInForm.tsx](../apps/web/src/features/auth/SignInForm.tsx) | Dev sign-in screen; switch to real auth when Member 4 lands BE10 | FE05 |
| [features/trips/](../apps/web/src/features/trips/SetupPage.tsx) | Trip list, trip header tabs, setup forms | FE05 |
| `docs/design/`, `deliverables/launch/` | Design notes, brand, launch kit | FE01, FE07 |

**Build next**

1. **FE01:** agree the design direction with Member 2, then set up the shared kit in `ui.tsx` and `globals.css` first,
   so both frontend members style the same way.
2. **FE02:** redesign the inbox. Handle every save status and `failureCode` in the [F1 state diagram](features/F1-import.md).
3. **FE03:** landing page with the proposed price clearly marked as a hypothesis; use Member 4's cost figures (BE14) when ready.
4. **FE04:** place confirmation with evidence always visible, a required branch choice and "sample data" labels.
5. **FE05:** replace the dev sign-in form once Member 4's real auth lands; show setup validation errors from the API.

Rules for both frontend members: get data only through `api()` or `useApi()`; client components never import from
`@/server`; show unknown hours, locked bookings and estimated travel times; use fixtures for hard-to-reach states;
cross the boundary through [section 4](#4-where-frontend-and-backend-meet).

**Coordinate with** Member 2 on the shared kit, map component and navigation · Member 3 on import and place states ·
Member 4 on sign-in, setup validation and cost figures for pricing.

**Check:** the acceptance lists in F1, F2 and F3, and the acceptance text of FE02–FE05 in tasks.csv.

### Member 2 (frontend): itinerary, views, sharing and quality

| | |
| --- | --- |
| Tasks | FE09 itinerary timeline and edits (15 Sep) · FE10 map and magazine views (17 Sep) · FE11 sharing screens and viewer (18 Sep) · FE12 browser end-to-end test (18 Sep) · FE13 funnel analytics (20 Sep) · FE14 journey integration, phone width and keyboard (21 Sep) · FE15 answers and backend flow review (23 Sep) · FE16 visuals, pitch and demo rehearsal (24 Sep) |
| Milestones | M02, M05, M16, M19, M20 |
| Reviewer | Member 1 (FE14 by Member 3, FE15 by Member 4) |
| Read | [F4 Itinerary](features/F4-itinerary.md), [F5 Views](features/F5-views.md), [F6 Sharing](features/F6-sharing.md), [tests](../tests/README.md), analytics events in [operations](operations/README.md), [pitch](../deliverables/pitch/pitch.md) |

**Your files** (under `apps/web/src/` unless noted)

| File or folder | What it does now | Task |
| --- | --- | --- |
| [features/itinerary/](../apps/web/src/features/itinerary/ItineraryPage.tsx) | Generate, conflicts list, timeline with edit controls, map tab | FE09, FE10 |
| [features/magazine/MagazineView.tsx](../apps/web/src/features/magazine/MagazineView.tsx) | Magazine layout of one version | FE10 |
| [features/sharing/](../apps/web/src/features/sharing/SharePage.tsx) | Owner's link list, viewer page | FE11 |
| [lib/api-client.ts](../apps/web/src/lib/api-client.ts), [use-api.ts](../apps/web/src/lib/use-api.ts), [use-submit.ts](../apps/web/src/lib/use-submit.ts) | Typed client and hooks: the frontend's side of the contract | FE09 |
| [lib/analytics.ts](../apps/web/src/lib/analytics.ts), [features/landing/TrackedLink.tsx](../apps/web/src/features/landing/TrackedLink.tsx) | Browser product events (console only for now) | FE13 |
| `tests/e2e/` | Browser tests (empty) | FE12 |
| `deliverables/pitch/` | Pitch visuals and demo | FE16 |

**Build next**

1. **FE09:** redesign itinerary editing. Handle `STALE_VERSION` (reload) and `EDIT_REJECTED` (show `details.conflicts`);
   agree with Member 4 whether to preview edits with `dryRun`.
2. **FE10:** map and magazine rendered from the one itinerary object the page loads ([F5](features/F5-views.md) rule).
3. **FE11:** sharing screens and the viewer page, including revoked and not-found states.
4. **FE12:** add a browser test tool in `tests/e2e` (Playwright is a good fit) that walks the demo in section 2.
   Run it locally and against Member 4's deployed URL.
5. **FE13:** send the event names in [analytics.ts](../packages/contracts/src/analytics.ts) through `lib/analytics.ts`
   to the provider Member 4 sets up. Ids and counts only: no save text, trip details or uploads.

**Keep:** views never refetch, reorder or recalculate; every view shows the version number; the same frontend rules as Member 1.

**Coordinate with** Member 1 on the shared kit and map component · Member 4 on planner behaviour, edits, sharing safeguards,
deployed URL and analytics provider · Member 3 on import recovery (for your FE15 review).

**Check:** the acceptance lists in F4, F5 and F6; your browser test passing locally and on the deployed URL.

### Member 3 (backend): AI extraction, places and evaluation

| | |
| --- | --- |
| Tasks | BE01 input access and candidate fixtures (12 Sep) · BE02 text and screenshot extraction (14 Sep) · BE03 place lookup, branches and dedupe (15 Sep) · BE04 real providers in durable import jobs (18 Sep) · BE05 model and prompt evaluation (20 Sep) · BE06 improve one measured weakness (21 Sep) · BE07 answers and AI input safety (23 Sep) · BE08 freeze AI evidence (24 Sep) |
| Milestones | M01, M07, M08, M09, M11 |
| Reviewer | Member 4 |
| Read | [F1 Import](features/F1-import.md), [F2 Places](features/F2-places.md), [packages/ai](../packages/ai/README.md), [evals](../evals/README.md), DEC-05 and DEC-08 in [decisions.md](../planning/decisions.md) |

**Your files**

| File or folder | What it does now | Task |
| --- | --- | --- |
| [packages/ai/src/types.ts](../packages/ai/src/types.ts) | `Extractor`, `PlaceLookup` and `ClueListSchema`: what the app calls. Change only after agreeing with Member 4. | BE02, BE03 |
| [fake-extractor.ts](../packages/ai/src/fake-extractor.ts), [fake-lookup.ts](../packages/ai/src/fake-lookup.ts), [gazetteer.ts](../packages/ai/src/gazetteer.ts) | Stand-ins over 17 fictional venues. Keep them for tests and offline work. | — |
| `packages/ai/src/` (new files) | Your real adapters: a model-based extractor and a place-provider lookup | BE02, BE03 |
| `packages/ai/prompts/` | Versioned prompts (empty) | BE02, BE05 |
| [server/providers.ts](../apps/web/src/server/providers.ts) | Picks adapters from `AI_PROVIDER` and `PLACES_PROVIDER` | BE02 |
| [server/jobs/import-inspiration.ts](../apps/web/src/server/jobs/import-inspiration.ts) | Pipeline: extract → validate clues → look up → save places with evidence. Member 4 runs the jobs. | BE04 |
| [server/services/inspirations.ts](../apps/web/src/server/services/inspirations.ts), [handlers/inspirations.ts](../apps/web/src/server/handlers/inspirations.ts) | Save, retry, add details, skip | BE04 |
| [server/services/places.ts](../apps/web/src/server/services/places.ts), [handlers/places.ts](../apps/web/src/server/handlers/places.ts) | Dedupe on import, confirm and merge, save status refresh | BE03 |
| [contracts/src/place.ts](../packages/contracts/src/place.ts), [inspiration.ts](../packages/contracts/src/inspiration.ts) | The shapes you lead | BE01 |
| `evals/` | Datasets, scoring, results (empty) | BE05, BE06 |

**Build next**

1. **BE01:** find out which input routes are usable and allowed (links, captions, screenshots) and which place provider
   to use. Record it as DEC-05. The app already handles links it can't read.
2. **BE02:** implement `Extractor` for text and screenshots. Parse model output with `ClueListSchema`. Return
   `needs_input` for unreadable input; throw only for transient errors (a job gets 3 attempts). Treat save content as
   data, never as instructions.
3. **BE03:** implement `PlaceLookup` on the chosen provider. Hours, address and coordinates come from the provider; list
   missing fields in `unknownFields`; return every branch as a separate option. Then review the dedupe rules in `places.ts`.
4. **BE04:** add a `case` for your adapters in `providers.ts`. Add new env var **names** to
   [.env.example](../apps/web/.env.example); keys go only in `apps/web/.env.local`. Ask Member 4 to add them to the host.
5. **BE05:** build the held-out set in `evals/` from permissioned or synthetic saves and compare three candidates.

**Keep:** the fake adapters working (tests use them), `ClueListSchema` validation, and evidence on every place.

**Coordinate with** Member 4 on the job runner, uploads, secrets, deployment and the place details the planner needs
(opening hours, visit length) · Member 1 on progress states, failure messages and evidence display.

**Check:** the F1 and F2 acceptance lists; [fake.test.ts](../packages/ai/src/fake.test.ts); the "import" and
"place confirmation" tests in [core-flow.test.ts](../tests/integration/core-flow.test.ts). Test adapters with recorded
responses: `npm test` must not call live providers.

### Member 4 (backend): data, platform and planner

| | |
| --- | --- |
| Tasks | BE09 database, auth and hosting decision; contract review (12 Sep) · BE10 real identity, storage and uploads (14 Sep) · BE11 deploy with job runner, checks and analytics (15 Sep) · BE12 preference validation and itinerary generation (17 Sep) · BE13 edits, sharing safeguards and rate limits (18 Sep) · BE14 timing and cost measurement (20 Sep) · BE15 pilot deployment and security evidence (21 Sep) · BE16 answers, submission PDFs, release handoff (24 Sep) |
| Milestones | M03, M10, M12, M13, M15 |
| Reviewer | Member 3 (BE15 by Member 2) |
| Read | [F0 Foundation](features/F0-foundation.md), [F3 Trip setup](features/F3-trip-setup.md), [F4 Itinerary](features/F4-itinerary.md), [F6 Sharing](features/F6-sharing.md), the job rules in [F1](features/F1-import.md), [operations](operations/README.md), [database](../database/README.md), [planner](../packages/planner/README.md), the DEC-04 entry in [decisions.md](../planning/decisions.md) |

**Your files** (under `apps/web/src/` unless noted)

| File or folder | What it does now | Task |
| --- | --- | --- |
| [server/db/types.ts](../apps/web/src/server/db/types.ts), [index.ts](../apps/web/src/server/db/index.ts), [file-store.ts](../apps/web/src/server/db/file-store.ts) | Repository interfaces, swap point, dev JSON store (not deployable) | BE10 |
| [server/auth/session.ts](../apps/web/src/server/auth/session.ts), [services/auth.ts](../apps/web/src/server/services/auth.ts), [services/access.ts](../apps/web/src/server/services/access.ts) | Session cookie, dev sign-in, every ownership check | BE10 |
| [server/http/router.ts](../apps/web/src/server/http/router.ts), [handlers/index.ts](../apps/web/src/server/handlers/index.ts), [contracts/src/api.ts](../packages/contracts/src/api.ts), [common.ts](../packages/contracts/src/common.ts) | Contract router, handler registry, endpoint list, error codes | BE09 |
| [server/jobs/queue.ts](../apps/web/src/server/jobs/queue.ts), [apps/worker/src/index.ts](../apps/worker/src/index.ts) | Job runner, retries, retry trigger | BE11 |
| [server/config.ts](../apps/web/src/server/config.ts), [.env.example](../apps/web/.env.example), [server/analytics.ts](../apps/web/src/server/analytics.ts) | Environment variables, server events | BE11 |
| [packages/planner/src/](../packages/planner/src/index.ts) | Generation, re-timing, validation, edits, hours, travel, stale detection, [tests](../packages/planner/src/planner.test.ts) | BE12, BE13 |
| [server/services/itinerary.ts](../apps/web/src/server/services/itinerary.ts), [services/trips.ts](../apps/web/src/server/services/trips.ts) | Itinerary versions and `expectedVersion`; trip, preference and booking validation | BE12, BE13 |
| [server/services/shares.ts](../apps/web/src/server/services/shares.ts) | Viewing links and the viewer projection | BE13 |
| [contracts/src/itinerary.ts](../packages/contracts/src/itinerary.ts), [trip.ts](../packages/contracts/src/trip.ts), [share.ts](../packages/contracts/src/share.ts), [fixtures](../packages/contracts/fixtures/index.ts) | Shapes and hard-case fixtures you lead | BE09 |
| `database/`, [scripts/smoke-api.ts](../scripts/smoke-api.ts), [generate-api-docs.ts](../scripts/generate-api-docs.ts) | Migrations (empty), seed, smoke test, API docs | BE10, BE11 |
| `deliverables/final/` | Submission package | BE16 |

**Build next**

1. **BE09:** finish DEC-04: database, auth provider, hosting. Write it in decisions.md. Walk everyone through the contract
   and fixtures, because they are the boundary both tracks build against.
2. **BE10:** implement `Repositories` (with migrations) and `PrivateAssetStorage`, then swap them in `db/index.ts`.
   Replace dev sign-in with real auth behind `requireUser()` and `currentUser()`. Keep `jobs.claim` atomic and
   `(tripId, version)` unique ([F0](features/F0-foundation.md) lists the rules).
3. **BE11:** deploy; set `WORKER_SECRET` and Member 3's provider keys; schedule `jobs.runDue`; connect the analytics
   provider that Member 2's browser events will use. Record setup in [operations](operations/README.md) and share the URL.
4. **BE12:** improve generation and measure before and after (BE14). Known baseline problems: long waits before places
   that open late, straight-line travel, no grouping by area; budget and interests are stored but unused.
5. **BE13:** confirm or change the edit policy in [F4](features/F4-itinerary.md); add rate limits to `shared.get` and
   link creation.

**Keep:** the planner pure (no I/O), every conflict explained in plain language, opening hours never guessed, and
`npm run smoke` passing locally and on the deployed URL (`SMOKE_BASE_URL`).

**Workload:** you carry two areas. If BE10–BE13 slip at G2, raise it: planner work can move to Member 3 after BE06 ([team.md](../planning/team.md)).

**Coordinate with** Member 2 on itinerary and sharing screens, deployed URL and analytics · Member 1 on sign-in, setup
validation and cost figures · Member 3 on jobs, uploads, secrets and place details.

**Check:** the F0, F3, F4 and F6 acceptance lists; [planner.test.ts](../packages/planner/src/planner.test.ts); the "identity"
and "itinerary" tests in [core-flow.test.ts](../tests/integration/core-flow.test.ts); `npm run smoke`.

## 6. Working together

- **One branch per task**, named with the task id: `feat/FE09-timeline`, `feat/BE02-extraction`. Keep PRs small.
  Run `npm run check` before asking for review; your reviewer reproduces the acceptance checks.
- **Reviews** stay within each track (Member 1 ↔ Member 2, Member 3 ↔ Member 4). Integration tasks go to the other
  track: FE14 to Member 3, FE15 to Member 4, BE15 to Member 2.
- **Contract changes** follow [section 4](#4-where-frontend-and-backend-meet).
- **Shared files:** `packages/contracts` (everyone) · `components/ui.tsx`, `MapView.tsx`, `globals.css` (Member 1 owns,
  Member 2 uses) · `server/jobs/import-inspiration.ts` (Member 3's logic, Member 4's runner) · `lib/api-client.ts`
  (Member 2; tell Member 4 if the router side changes). Talk to the owner before editing their folder.
- **Never commit** `.env.local`, provider keys, real traveler data or private uploads. `.local/` is gitignored.
- **Fixture venues are fictional.** Don't present them as real places in the pilot, pitch or evidence.
- **Log your work** and any AI assistance in [contributions.csv](../planning/contributions.csv), and update your
  [milestone answer](../deliverables/milestones/README.md) with evidence in the same PR.
- **Rhythm** from the roadmap: a 10-minute blocker check every day, and an integrated demo every second day from 15 Sep.

## 7. Open decisions and known limitations

| Decision | Owner | Effect on the work |
| --- | --- | --- |
| DEC-03 pilot city | Member 1 | Fixtures and seed use Tokyo; Member 3 replaces `gazetteer.ts` and the seed when decided |
| DEC-04 database, auth, hosting | Member 4 + Member 3 | Next.js + TypeScript chosen; database, auth and hosting still open |
| DEC-05 input routes and place provider | Member 3 | Fake extractor and lookup until decided |
| DEC-07 working name and brand | Member 1 + Member 2 | Landing copy and launch kit wait on it |
| DEC-08 model candidates | Member 3 | No model connected |
| Itinerary edit policy | Member 4 | Current rule described in [F4](features/F4-itinerary.md) |

DEC-01, DEC-02 and DEC-06 are also still open. DEC-09 (the frontend/backend split) was decided on 15 Sep.
All in [decisions.md](../planning/decisions.md).

Known limitations of the base:

- The JSON file store assumes one process and has no transactions. It can't be deployed.
- Dev sign-in has no password.
- No rate limits and no expiry on viewing links.
- The baseline planner can leave long waits, uses straight-line travel, and ignores budget and interests.
- Analytics events only go to the console.
- No lint step and no browser tests yet; nothing is deployed.
- Member 4 carries both platform and planner work; watch it at G2.
- `npm run dev` creates `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` (Next.js 16 guidance for AI assistants). That's expected.

## 8. I want to…

| I want to… | Do this |
| --- | --- |
| Show data the API doesn't return yet | Follow [section 4](#4-where-frontend-and-backend-meet): propose the contract change, render fixtures meanwhile |
| Add a field to a trip, place or itinerary | Edit the schema in `packages/contracts/src` → `npm run typecheck` → fix server and UI → update fixtures → `npm run docs:api` |
| Add an endpoint | Add it to [api.ts](../packages/contracts/src/api.ts) with both owners → add its handler in `server/handlers/<feature>.ts` (typecheck fails until you do) → write the service → call it with `api()` → `npm run docs:api` |
| Build a screen before its API is ready | Render with `@reel/contracts/fixtures` |
| Test server logic without a screen | Add a test next to [core-flow.test.ts](../tests/integration/core-flow.test.ts) or run `npm run smoke` |
| See exactly what an endpoint returns and who owns it | [api/endpoints.md](api/endpoints.md), or the browser's network tab |
| Reset local data | `npm run seed` |
| Make an import fail on purpose | Put `[[fail]]` in a text save |
| Plug in a real AI or place provider | New adapter in `packages/ai` → `case` in [providers.ts](../apps/web/src/server/providers.ts) → env var |
| Plug in a real database | Implement `Repositories` → swap in [db/index.ts](../apps/web/src/server/db/index.ts) |
| Change retry limits | [queue.ts](../apps/web/src/server/jobs/queue.ts), then update [F1](features/F1-import.md) |

## 9. Document index

| Document | Read it for |
| --- | --- |
| [README](../README.md) | Commands and workspace layout |
| [AGENTS.md](../AGENTS.md) | Repository rules, also used by AI assistants |
| [Product scope](product/scope.md) | MVP stories, core demo, deferred features |
| [Feature specs index](features/README.md) | How frontend and backend connect; contract change process; definition of done |
| [F0](features/F0-foundation.md) · [F1](features/F1-import.md) · [F2](features/F2-places.md) · [F3](features/F3-trip-setup.md) · [F4](features/F4-itinerary.md) · [F5](features/F5-views.md) · [F6](features/F6-sharing.md) | Behaviour, endpoints, states and acceptance checks per feature |
| [API reference](api/endpoints.md) | Every endpoint's request, response, errors and owners (generated) |
| [Architecture](architecture.md) | Module boundaries |
| [Operations](operations/README.md) | Env vars, jobs, deployment notes |
| [Design](design/README.md) | Design work |
| [contracts](../packages/contracts/README.md) · [ai](../packages/ai/README.md) · [planner](../packages/planner/README.md) | Package details |
| [Web app](../apps/web/README.md) · [Worker](../apps/worker/README.md) | App folder maps |
| [Database](../database/README.md) · [Tests](../tests/README.md) · [Evals](../evals/README.md) | Persistence, test plan, evaluation |
| [Team](../planning/team.md) · [Roadmap](../planning/roadmap.md) · [Tasks](../planning/tasks.csv) · [Decisions](../planning/decisions.md) · [Contributions](../planning/contributions.csv) | Ownership, dates, tasks, decisions (including the old-to-new task id map), contribution log |
| [Milestones](../deliverables/milestones/README.md) | The graded answers you own |
