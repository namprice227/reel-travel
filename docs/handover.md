# Handover: Reel Travel app base

Updated 14 September 2026. Read this first if you are picking up a feature. It tells you what already works,
which folders and files are yours, what to build next, and which documents hold the detail.
Where another document already explains something, this one links to it instead of repeating it.

1. [Where the project is](#1-where-the-project-is)
2. [Get it running](#2-get-it-running)
3. [How the code is organised](#3-how-the-code-is-organised)
4. Your part: [Member 1](#member-1-traveler-ui-map-magazine-landing) ·
   [Member 2](#member-2-ai-extraction-place-evidence-evaluation) ·
   [Member 3](#member-3-preferences-schedule-engine-edits) ·
   [Member 4](#member-4-identity-data-jobs-sharing-release)
5. [Working together](#5-working-together)
6. [Open decisions and known limitations](#6-open-decisions-and-known-limitations)
7. ["I want to…" quick reference](#7-i-want-to)
8. [Document index](#8-document-index)

## 1. Where the project is

Every MVP story from the [scope](product/scope.md) runs end to end. The screens, API, rules and tests are real code.
Some pieces are **stand-ins** so everyone could start at once; their owner replaces them behind the same interface,
so nobody else's code has to change.

| Area | Works now | Stand-in to replace | Owner |
| --- | --- | --- | --- |
| Sign-in and data | Trips saved per account; other accounts are blocked | Email-only sign-in, local JSON file store | Member 4 |
| Import (US-01) | Text, link and screenshot saves; background jobs with retries; add details, retry, skip | Fake extractor over fictional venues | Member 2, jobs Member 4 |
| Places (US-02) | Evidence on every place, branch choice, duplicate merge, map | Fixture place lookup | Member 2 |
| Trip setup (US-03) | Trip details, preferences, bookings | None | Member 3, Member 4 |
| Itinerary (US-04, US-05) | Saved versions, conflicts, move/remove/add stops, locked bookings protected | Baseline greedy planner, straight-line travel times | Member 3 |
| Views (US-06) | Timeline, map and magazine from one saved version | Plain design | Member 1 |
| Sharing (US-07) | Create and revoke read-only links; uploads stay private | No rate limits | Member 4 |
| Deployment and analytics | Nothing deployed; events are only logged | Everything | Member 4 |

**Verified on 14 September 2026:** `npm run check` (types, 45 tests, API docs, planning validator), `npm run smoke`
(13 API checks against the running app), a headless-browser pass through every screen, and `npm run build`.

**Not done:** every task in [tasks.csv](../planning/tasks.csv) is still `todo`. The base is a starting point, not a
finished task. Review your part, claim your task and update its status yourself.

**Schedule:** gate G0 (11–12 Sep) closed with decisions still open (see [section 6](#6-open-decisions-and-known-limitations)).
G1, the import slice, is due 13–15 Sep. Dates and gates: [roadmap](../planning/roadmap.md).

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
the specs listed in your section below → your rows in [tasks.csv](../planning/tasks.csv).

## 3. How the code is organised

```text
apps/web/src/
  app/                  Routes only. Each page renders a feature component.          (rarely edited)
  features/<feature>/   Screens: inbox, places, trips, itinerary, magazine, sharing  Member 1
  components/, lib/     Shared UI, the typed api() client, hooks                     Member 1
  server/http/          Contract router: validates every request and response        Member 4
  server/handlers/      One small handler per endpoint                               feature owner
  server/services/      Business rules and ownership checks                          feature owner
  server/jobs/          Import pipeline and job runner                               Member 2 + Member 4
  server/db/            Repository interfaces and the dev file store                 Member 4
  server/auth/          Session cookie                                               Member 4
apps/worker/            Triggers due import retries                                  Member 4
packages/contracts/     Data shapes, endpoint list, fixtures                         everyone, by agreement
packages/ai/            Extractor and place lookup                                   Member 2
packages/planner/       Scheduling, validation, edits (no I/O)                       Member 3
database/               Future migrations; seed script                               Member 4
tests/, scripts/        Integration tests, smoke test, API docs generator            everyone
```

**What one request goes through**, using "confirm a place" as the example:

1. [PlaceCard.tsx](../apps/web/src/features/places/PlaceCard.tsx) calls `api("places.confirm", { params, body })` from
   [api-client.ts](../apps/web/src/lib/api-client.ts). TypeScript knows the URL, the body and the response from the contract.
2. The request reaches [router.ts](../apps/web/src/server/http/router.ts). It finds `places.confirm` in
   [api.ts](../packages/contracts/src/api.ts), checks the session and validates the params and body.
3. [handlers/places.ts](../apps/web/src/server/handlers/places.ts) calls `confirmPlace()` in
   [services/places.ts](../apps/web/src/server/services/places.ts).
4. The service checks the trip belongs to the user, merges duplicates and saves through `repos()`.
5. The router validates the result against the response schema and returns JSON.
   Errors always come back as `{ "error": { "code", "message", "details" } }`.

Full explanation and the contract change process: [features/README.md](features/README.md).
Every endpoint's request, response and errors: [api/endpoints.md](api/endpoints.md).

## 4. Your part

Each section lists your tasks, what to read, the files you own, what to build next, who you coordinate with,
and how to check your work. Task dates come from [tasks.csv](../planning/tasks.csv); reviewers from [team.md](../planning/team.md).

### Member 1: traveler UI, map, magazine, landing

| | |
| --- | --- |
| Tasks | A02 inbox and confirmation UI (14 Sep) · A03 map and landing page (15 Sep) · A04 magazine and itinerary edit screens (18 Sep) · A05 integrate journey and observe pilot (21 Sep) · A06–A08 evidence, review, polish and pitch |
| Milestones | M01, M04, M16, M17, M18 |
| Reviewer | Member 4 |
| Read | [F1 Import](features/F1-import.md), [F2 Places](features/F2-places.md), [F5 Views](features/F5-views.md) first; then the screen sections of [F3](features/F3-trip-setup.md), [F4](features/F4-itinerary.md), [F6](features/F6-sharing.md); [design notes](design/README.md) |

**Your files** (all under `apps/web/src/`)

| File or folder | What it does now | Task |
| --- | --- | --- |
| [features/inbox/](../apps/web/src/features/inbox/InboxPage.tsx) | Save form, list that polls while imports run, add details / retry / skip | A02 |
| [features/places/](../apps/web/src/features/places/PlacesPage.tsx) | Candidates grouped by status, branch choice, evidence, map | A02, A03 |
| [components/MapView.tsx](../apps/web/src/components/MapView.tsx), [PlaceMap.tsx](../apps/web/src/components/PlaceMap.tsx) | Leaflet + OpenStreetMap, loaded in the browser only | A03 |
| [features/landing/](../apps/web/src/features/landing/LandingPage.tsx) | Placeholder landing page, CTA click event | A03 |
| [features/itinerary/](../apps/web/src/features/itinerary/ItineraryPage.tsx) | Generate, conflicts list, timeline with edit controls, map tab | A04 |
| [features/magazine/MagazineView.tsx](../apps/web/src/features/magazine/MagazineView.tsx) | Magazine layout of one version | A04 |
| [features/trips/](../apps/web/src/features/trips/SetupPage.tsx) | Trip list, trip header tabs, setup forms | — |
| [features/sharing/](../apps/web/src/features/sharing/SharePage.tsx) | Owner's link list, viewer page | — |
| [features/auth/SignInForm.tsx](../apps/web/src/features/auth/SignInForm.tsx) | Dev sign-in screen; changes when Member 4 adds real auth | — |
| [components/ui.tsx](../apps/web/src/components/ui.tsx), [app/globals.css](../apps/web/src/app/globals.css), [app/layout.tsx](../apps/web/src/app/layout.tsx) | UI primitives, all styles, site header and metadata | all |
| [lib/use-api.ts](../apps/web/src/lib/use-api.ts), [use-submit.ts](../apps/web/src/lib/use-submit.ts), [format.ts](../apps/web/src/lib/format.ts) | Loading and polling, button state, labels and dates | all |

**Build next.** The screens work but are plain. Redesign freely; keep these rules:

- Get data only through `api()` or `useApi()`. Client components never import from `@/server`.
- Render timeline, map and magazine from the **one** itinerary object the page loads ([F5](features/F5-views.md)).
- Always show unknown opening hours, locked bookings, estimated travel times and "sample data" labels.
- For states that are hard to reach (failed import, impossible booking), render components with
  [fixtures](../packages/contracts/fixtures/index.ts) from `@reel/contracts/fixtures`.
- If a screen needs data the API doesn't return, don't work around it: agree a contract change with the server owner.

**Coordinate with** Member 2 on import and place states and failure messages · Member 3 on conflict wording, edit
controls and `dryRun` previews · Member 4 on the sign-in swap, sharing, analytics events and the API client.

**Check:** the acceptance lists in F1, F2 and F5, and the acceptance text of A02–A04 in tasks.csv.

### Member 2: AI extraction, place evidence, evaluation

| | |
| --- | --- |
| Tasks | B01 probe input access, publish fixtures (12 Sep) · B02 text and screenshot extraction (14 Sep) · B03 lookup ambiguity and dedupe (15 Sep) · B04 durable extraction and recovery (18 Sep) · B05 held-out evaluation (20 Sep) · B06 improve one measured weakness (21 Sep) · B07–B08 |
| Milestones | M02, M07, M08, M09, M11 |
| Reviewer | Member 3 |
| Read | [F1 Import](features/F1-import.md), [F2 Places](features/F2-places.md), [packages/ai](../packages/ai/README.md), [evals](../evals/README.md), DEC-05 and DEC-08 in [decisions.md](../planning/decisions.md) |

**Your files**

| File or folder | What it does now | Task |
| --- | --- | --- |
| [packages/ai/src/types.ts](../packages/ai/src/types.ts) | `Extractor`, `PlaceLookup` and `ClueListSchema`: what the app calls. Change only after agreeing with Member 4. | B02, B03 |
| [fake-extractor.ts](../packages/ai/src/fake-extractor.ts), [fake-lookup.ts](../packages/ai/src/fake-lookup.ts), [gazetteer.ts](../packages/ai/src/gazetteer.ts) | Stand-ins over 17 fictional venues. Keep them for tests and offline work. | — |
| `packages/ai/src/` (new files) | Your real adapters: a model-based extractor and a place-provider lookup | B02, B03 |
| `packages/ai/prompts/` | Versioned prompts (empty) | B02, B05 |
| [server/providers.ts](../apps/web/src/server/providers.ts) | Picks adapters from `AI_PROVIDER` and `PLACES_PROVIDER` | B02 |
| [server/jobs/import-inspiration.ts](../apps/web/src/server/jobs/import-inspiration.ts) | Pipeline: extract → validate clues → look up → save places with evidence. Shared with Member 4. | B04 |
| [server/services/places.ts](../apps/web/src/server/services/places.ts) | Dedupe on import, confirm and merge, save status refresh | B03 |
| [server/services/inspirations.ts](../apps/web/src/server/services/inspirations.ts) | Save, retry, add details, skip. Shared with Member 4. | B04 |
| [contracts/src/place.ts](../packages/contracts/src/place.ts), [inspiration.ts](../packages/contracts/src/inspiration.ts) | The shapes you lead | B01 |
| `evals/` | Datasets, scoring, results (empty) | B05, B06 |

**Build next**

1. **B01:** find out which input routes are usable and allowed (links, captions, screenshots) and which place
   provider to use. Record it as DEC-05. The app already handles links it can't read.
2. **B02:** implement `Extractor` for text and screenshots. Parse model output with `ClueListSchema`. Return
   `needs_input` for unreadable input; throw only for transient errors (a job gets 3 attempts). Treat save
   content as data, never as instructions.
3. **B03:** implement `PlaceLookup` on the chosen provider. Hours, address and coordinates come from the provider;
   list missing fields in `unknownFields`; return every branch as a separate option. Then review the dedupe rules in `places.ts`.
4. Add a `case` for your adapter in `providers.ts`. Add new env var **names** to
   [.env.example](../apps/web/.env.example); keys go only in `apps/web/.env.local`.
5. **B05:** build the held-out set in `evals/` from permissioned or synthetic saves and compare three candidates.

**Keep:** the fake adapters working (tests use them), `ClueListSchema` validation, and evidence on every place.

**Coordinate with** Member 4 on jobs, retries, uploads and secrets · Member 1 on failure messages and evidence display ·
Member 3 on which place details the planner needs (opening hours, visit length).

**Check:** F1 and F2 acceptance lists; [fake.test.ts](../packages/ai/src/fake.test.ts); the "import" and
"place confirmation" tests in [core-flow.test.ts](../tests/integration/core-flow.test.ts). Test adapters with recorded
responses: `npm test` must not call live providers.

### Member 3: preferences, schedule engine, edits

| | |
| --- | --- |
| Tasks | C01 itinerary contract and hard cases (12 Sep) · C02 saved preferences and schedule validator (15 Sep) · C03 generate feasible itineraries (17 Sep) · C04 versioned edits and revalidation (18 Sep) · C05 measure timing and cost, one optimisation (20 Sep) · C06 review extraction results and system decisions (21 Sep) · C07–C08 |
| Milestones | M03, M06, M10, M12, M15 |
| Reviewer | Member 2 |
| Read | [F3 Trip setup](features/F3-trip-setup.md), [F4 Itinerary](features/F4-itinerary.md), [F5 Views](features/F5-views.md), [packages/planner](../packages/planner/README.md) |

**Your files**

| File or folder | What it does now | Task |
| --- | --- | --- |
| [planner/src/generate.ts](../packages/planner/src/generate.ts) | Baseline plan: bookings fixed, nearest open place that fits, pace capacity, one break | C03 |
| [retime.ts](../packages/planner/src/retime.ts) | Each stop starts at the later of previous end + travel and its opening time | C03, C04 |
| [validate.ts](../packages/planner/src/validate.ts) | Conflicts and validation status | C02 |
| [edit.ts](../packages/planner/src/edit.ts) | Move / remove / add / replace and the rejection rules | C04 |
| [hours.ts](../packages/planner/src/hours.ts), [travel.ts](../packages/planner/src/travel.ts) | Opening-hours checks; straight-line travel estimates | C02, C03 |
| [fingerprint.ts](../packages/planner/src/fingerprint.ts) | Detects when an itinerary is stale | C04 |
| [planner.test.ts](../packages/planner/src/planner.test.ts) | Hard cases: normal day, unknown hours, locked booking, impossible day | C01–C04 |
| [server/services/itinerary.ts](../apps/web/src/server/services/itinerary.ts) | Loads planner inputs, enforces `expectedVersion`, saves versions, maps planner errors | C04 |
| [server/services/trips.ts](../apps/web/src/server/services/trips.ts) | Trip, preference and booking validation. Shared with Member 4. | C02 |
| [contracts/src/itinerary.ts](../packages/contracts/src/itinerary.ts), [trip.ts](../packages/contracts/src/trip.ts), [fixtures](../packages/contracts/fixtures/index.ts) | The shapes and hard-case fixtures you lead | C01 |

**Build next**

1. **C01:** review the itinerary contract and the `valid`, `partiallyChecked` and `impossibleReservation` fixtures.
   Add the cases you need (for example a closed day). Change shapes now, while few screens depend on them.
2. **C02:** extend validation (timezone rules, accommodation). Budget and interests are stored but the planner ignores them: decide what they should do.
3. **C03:** improve generation and measure before and after (C05). Known baseline problems: long waits before places
   that open late, straight-line travel, no grouping by area.
4. **C04:** confirm or change the edit policy. Today an edit is rejected only if it touches a booking or makes a locked
   booking unreachable; other conflicts are saved and shown. Consider `dryRun` previews with Member 1.

**Keep:** the planner pure (no I/O, no provider calls), every conflict explained in plain language, and hours never guessed.

**Coordinate with** Member 1 on conflict wording and edit controls · Member 2 on place details (hours, visit length) ·
Member 4 on version storage (a real database must keep `(tripId, version)` unique).

**Check:** F3 and F4 acceptance lists; `planner.test.ts`; the "itinerary" test in [core-flow.test.ts](../tests/integration/core-flow.test.ts).

### Member 4: identity, data, jobs, sharing, release

| | |
| --- | --- |
| Tasks | D01 stack, data, identity and job contracts (12 Sep) · D02 identity, persistent trips and uploads (14 Sep) · D03 deploy first slice with jobs, checks, analytics (15 Sep) · D04 private viewing links and safeguards (18 Sep) · D05 stabilise pilot deployment, capture funnel (21 Sep) · D06 brand and launch kit (22 Sep) · D07–D08 review and submission |
| Milestones | M05, M13, M14, M19, M20 |
| Reviewer | Member 1 |
| Read | [F0 Foundation](features/F0-foundation.md), [F6 Sharing](features/F6-sharing.md), the job rules in [F1](features/F1-import.md), [operations](operations/README.md), [database](../database/README.md), the DEC-04 entry in [decisions.md](../planning/decisions.md) |

**Your files**

| File or folder | What it does now | Task |
| --- | --- | --- |
| [server/db/types.ts](../apps/web/src/server/db/types.ts) | `Repositories` and `PrivateAssetStorage` interfaces | D02 |
| [server/db/file-store.ts](../apps/web/src/server/db/file-store.ts) | Dev JSON store: reference only, not for deployment | — |
| [server/db/index.ts](../apps/web/src/server/db/index.ts) | Swap point: `repos()` and `assetStorage()` | D02 |
| [server/auth/session.ts](../apps/web/src/server/auth/session.ts), [services/auth.ts](../apps/web/src/server/services/auth.ts) | Session cookie and dev sign-in | D02 |
| [server/services/access.ts](../apps/web/src/server/services/access.ts) | `getOwnedTrip` and `belongsTo`: every ownership check | D02 |
| [server/services/shares.ts](../apps/web/src/server/services/shares.ts) | Viewing links and the viewer projection | D04 |
| [server/jobs/queue.ts](../apps/web/src/server/jobs/queue.ts), [apps/worker/src/index.ts](../apps/worker/src/index.ts) | Job runner, retries, retry trigger | D03 |
| [server/http/router.ts](../apps/web/src/server/http/router.ts), [handlers/index.ts](../apps/web/src/server/handlers/index.ts) | Contract router and handler registry (platform code) | D01 |
| [server/analytics.ts](../apps/web/src/server/analytics.ts), [lib/analytics.ts](../apps/web/src/lib/analytics.ts) | Product events, currently console logs | D03 |
| [server/config.ts](../apps/web/src/server/config.ts), [.env.example](../apps/web/.env.example) | Environment variables | D03 |
| `database/migrations/`, [seeds/seed-dev.ts](../database/seeds/seed-dev.ts) | Migrations (empty), synthetic seed | D02 |
| [scripts/smoke-api.ts](../scripts/smoke-api.ts), [generate-api-docs.ts](../scripts/generate-api-docs.ts) | HTTP smoke test, API reference generator | — |

**Build next**

1. **D01:** finish DEC-04: database, auth provider, hosting. Write the choice in decisions.md. Check the host runs
   Node route handlers; if background work after a response isn't reliable there, run `jobs.runDue` from a cron.
2. **D02:** implement `Repositories` (with migrations) and `PrivateAssetStorage`, then swap them in `db/index.ts`.
   Replace dev sign-in with real auth behind `requireUser()` and `currentUser()`. Keep `jobs.claim` atomic and
   `(tripId, version)` unique ([F0](features/F0-foundation.md) lists the rules).
3. **D03:** deploy; set `WORKER_SECRET`; schedule `jobs.runDue`; connect an analytics provider in the two analytics
   files and verify events arrive. Record setup in [operations](operations/README.md).
4. **D04:** rate-limit `shared.get` and link creation; confirm uploads stay private.
5. Keep `npm run smoke` passing against the deployed URL (`SMOKE_BASE_URL=https://… npm run smoke`).

**Coordinate with** Member 2 on job behaviour and uploads · Member 3 on itinerary persistence · Member 1 on the
sign-in screen, sharing UI and analytics calls in the UI.

**Check:** F0 and F6 acceptance lists; the "identity" test in [core-flow.test.ts](../tests/integration/core-flow.test.ts);
`npm run smoke`; the identity and sharing rows in [tests/README.md](../tests/README.md).

## 5. Working together

- **One branch per task**, named with the task id (`feat/B02-extraction`). Keep PRs small. Run `npm run check`
  before asking for review; your reviewer reproduces the acceptance checks.
- **Contract changes** follow [features/README.md](features/README.md#changing-a-contract). Start the PR title with
  `contract:` and get both owners to review. Prefer adding optional fields to renaming or removing.
- **Shared files:** `packages/contracts` (everyone) · `server/jobs/import-inspiration.ts` and `services/inspirations.ts`
  (Member 2 + Member 4) · `services/trips.ts` (Member 3 + Member 4) · `lib/api-client.ts` and `server/http`
  (Member 4; tell Member 1). Talk to the owner before editing their folder.
- **Never commit** `.env.local`, provider keys, real traveler data or private uploads. `.local/` is gitignored.
- **Fixture venues are fictional.** Don't present them as real places in the pilot, pitch or evidence.
- **Log your work** and any AI assistance in [contributions.csv](../planning/contributions.csv), and update your
  [milestone answer](../deliverables/milestones/README.md) with evidence in the same PR.
- **Rhythm** from the roadmap: a 10-minute blocker check every day, and an integrated demo every second day from 15 Sep.

## 6. Open decisions and known limitations

| Decision | Owner | Effect on the code |
| --- | --- | --- |
| DEC-03 pilot city | Member 1 | Fixtures and seed use Tokyo; replace `gazetteer.ts` and the seed when decided |
| DEC-04 database, auth, hosting | Member 4 + Member 3 | Next.js + TypeScript chosen; database, auth and hosting still open |
| DEC-05 input routes and place provider | Member 2 | Fake extractor and lookup until decided |
| DEC-08 model candidates | Member 2 | No model connected |
| Itinerary edit policy | Member 3 | Current rule described in [F4](features/F4-itinerary.md) |

DEC-01, DEC-02, DEC-06 and DEC-07 are also still open in [decisions.md](../planning/decisions.md).

Known limitations of the base:

- The JSON file store assumes one process and has no transactions. It can't be deployed.
- Dev sign-in has no password.
- No rate limits and no expiry on viewing links.
- The baseline planner can leave long waits, uses straight-line travel, and ignores budget and interests.
- Analytics events only go to the console.
- No lint step and no browser tests in the repository.
- The folder is not a git repository yet, and nothing is deployed.
- `npm run dev` creates `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` (Next.js 16 guidance for AI assistants). That's expected.

## 7. I want to…

| I want to… | Do this |
| --- | --- |
| Add a field to a trip, place or itinerary | Edit the schema in `packages/contracts/src` → `npm run typecheck` → fix server and UI → update fixtures → `npm run docs:api` |
| Add an endpoint | Add it to [api.ts](../packages/contracts/src/api.ts) → add its handler in `server/handlers/<feature>.ts` (typecheck fails until you do) → write the service → call it with `api()` → `npm run docs:api` |
| Build a screen before its API is ready | Render with `@reel/contracts/fixtures` |
| Test server logic without a screen | Add a test next to [core-flow.test.ts](../tests/integration/core-flow.test.ts) or run `npm run smoke` |
| See exactly what an endpoint returns | [api/endpoints.md](api/endpoints.md), or the browser's network tab |
| Reset local data | `npm run seed` |
| Make an import fail on purpose | Put `[[fail]]` in a text save |
| Plug in a real AI or place provider | New adapter in `packages/ai` → `case` in [providers.ts](../apps/web/src/server/providers.ts) → env var |
| Plug in a real database | Implement `Repositories` → swap in [db/index.ts](../apps/web/src/server/db/index.ts) |
| Change retry limits | [queue.ts](../apps/web/src/server/jobs/queue.ts), then update [F1](features/F1-import.md) |

## 8. Document index

| Document | Read it for |
| --- | --- |
| [README](../README.md) | Commands and workspace layout |
| [AGENTS.md](../AGENTS.md) | Repository rules, also used by AI assistants |
| [Product scope](product/scope.md) | MVP stories, core demo, deferred features |
| [Feature specs index](features/README.md) | How frontend and backend connect; contract change process; definition of done |
| [F0](features/F0-foundation.md) · [F1](features/F1-import.md) · [F2](features/F2-places.md) · [F3](features/F3-trip-setup.md) · [F4](features/F4-itinerary.md) · [F5](features/F5-views.md) · [F6](features/F6-sharing.md) | Behaviour, endpoints, states and acceptance checks per feature |
| [API reference](api/endpoints.md) | Every endpoint's request, response and errors (generated) |
| [Architecture](architecture.md) | Module boundaries |
| [Operations](operations/README.md) | Env vars, jobs, deployment notes |
| [Design](design/README.md) | Design work |
| [contracts](../packages/contracts/README.md) · [ai](../packages/ai/README.md) · [planner](../packages/planner/README.md) | Package details |
| [Web app](../apps/web/README.md) · [Worker](../apps/worker/README.md) | App folder maps |
| [Database](../database/README.md) · [Tests](../tests/README.md) · [Evals](../evals/README.md) | Persistence, test plan, evaluation |
| [Team](../planning/team.md) · [Roadmap](../planning/roadmap.md) · [Tasks](../planning/tasks.csv) · [Decisions](../planning/decisions.md) · [Contributions](../planning/contributions.csv) | Ownership, dates, tasks, decisions, contribution log |
| [Milestones](../deliverables/milestones/README.md) | The graded answers you own |
