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

### Frontend status (Members 1 and 2) — 15 September 2026

This subsection and the Member 1 and Member 2 sections are maintained by the frontend track. Backend sections and
shared lines were not edited, to avoid merge conflicts with Members 3 and 4.

The signed-in app was rebuilt to the requesting user's reference images: `theme.png` sets the style
([a-share.png](design/desktop-gallery/a-share.png)); the Home page, mytrip, itinerary0, Itinerary map enlarge and trip
setup references set the layouts ([a-home](design/desktop-gallery/a-home.png), [a-trips](design/desktop-gallery/a-trips.png),
[a-shared-view](design/desktop-gallery/a-shared-view.png), [a-map](design/desktop-gallery/a-map.png),
[a-setup](design/desktop-gallery/a-setup.png)). Work is on branch `UI` (commit `c2f07e0`); the pull request is not open yet.

**Screen routes.** Old `/trips/...` links redirect (see `apps/web/next.config.ts`).

| Screen | Route |
| --- | --- |
| Landing page for new visitors (signed-in visitors see "Open my trips") | `/`; also `robots.txt`, `sitemap.xml` and a generated share image |
| Home dashboard (signed in) | `/home` |
| My trips, create trip | `/my-trip`; `/my-trip/new` opens the create panel over it |
| Itinerary: magazine, timeline (edit), map | `/my-trip/:tripId/itinerary`, `/timeline`, `/map`; `?day=N` keeps the selected day |
| Trip settings, places, share | gear dialog (`?settings=`), `/places`, `/share` |
| Inspiration library (replaces the per-trip inbox) | `/inspiration-library`; `?trip=:tripId` shows one trip |
| Discover (not MVP) | `/discover`, placeholder only |
| Shared viewer | `/s/:token` (unchanged) |

**Done**

- Navigation: 56 px icon rail (one icon wide) that expands on hover or keyboard focus (Home, My trips, Inspiration
  library, Discover); bottom bar below 920 px. No top bar; the account lives in the rail.
- Type: Newsreader headings and Inter text, self-hosted by `next/font` in `app/layout.tsx` (no browser requests to Google).
- One screen on a 14-inch laptop (designed at 1536 × 760): signed-in pages fit without page scrolling and long lists
  scroll inside their panel. Phones and short windows scroll normally.
- Home: "Turn your saves into a trip" with one save box (reel or link, screenshot by drop or paste, note; pick a trip)
  and four shortcuts: Create trip, My trips, Inspiration library, Continue your last trip.
- My trips: headline with a prominent Create trip button and cover cards three to a row (more scroll sideways);
  `/my-trip/new` opens a create panel.
- Itinerary: calm header (title, dates, cover with Edit, Share, Note and a menu for Places, Trip details and Saves) and
  one tab row for Magazine, Timeline and Map. Magazine: day rail with an image card, roomy stop cards that flag only
  fixed bookings, unchecked hours and closures, and a map with a quote card. Timeline keeps move, remove, add and locked-booking protection, `STALE_VERSION`
  reload and `EDIT_REJECTED` conflicts. Map view: numbered stop list beside a large map with numbered pins and a
  selected-stop card. All three render the same itinerary object.
- Trip details: three columns: details, preferences (segmented pace and transport, interest and must-visit chips) and
  fixed bookings.
- Share: one-time link panel with copy and open, links table with revoke, read-only preview. The `/s/:token` viewer
  uses the same magazine, timeline and map layouts without owner controls.
- Inspiration library: a save bar, then a list of every reel, link, screenshot and note grouped by type (search, trip and
  type filters) with a detail panel showing the places found and the source; add details, retry and skip still work.
- Private notes on stops, days and the trip, opened from a note icon. Never included in shared links.
- Illustrative SVG covers and category tiles stand in for venue photos, labeled "Illustrative".

**Left**

- Human visual review at desktop width, a keyboard pass and a real-phone check. Only automated checks ran (below).
- Place confirmation (FE04) and sign-in (FE05) screens still use the base layout.
- The landing page (FE03) shows the proposal's prices marked as not for sale. Check them against Member 4's cost
  figures (BE14), and ask Member 4 to set `SITE_URL` on the host so share images and the sitemap use the real domain.
- Notes are a browser-local stand-in (`features/notes/notes-store.ts`) because no notes contract exists. Propose a
  `contract:` change with Member 4 before relying on them across devices.
- Venue and cover images need a contract field and a licensed source; `/inspiration-library` makes one
  `inspirations.list` and `places.list` call per trip, so a cross-trip endpoint may be worth proposing later.
- Edit preview (`replace_stop`, `dryRun`), the browser end-to-end test (FE12), the analytics provider (FE13, needs BE11)
  and every frontend milestone answer (all still draft scaffolds).

**Checked on 15 Sep:** `npm run check` passed (typecheck, 45 tests, API docs, planning validator). In the in-app browser
as Alice: every new route rendered its expected content, `/trips/:tripId/inbox` redirected to the library, and eight
routes had no horizontal scroll at 375 px. Desktop screenshots timed out, so no visual review is recorded.
`npm run smoke` and `npm run build` were not re-run after the rebuild. After the one-screen pass, every signed-in page
measured with no page scroll at 1536 × 760 in the in-app browser; only inner lists scroll, and Places stays long until FE04.

**Older screen names in shared text:** the status table above and the section 2 walkthrough were left unchanged.
Read them with the new names: Inbox → Inspiration library (`?trip=`); Itinerary → the Timeline tab for *Regenerate*
and ↑ ↓, then the Map and Magazine tabs.

**Task ids and owners:** Task ids changed on 15 Sep from A01–D08
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

1. [PlacesPage.tsx](../apps/web/src/features/places/PlacesPage.tsx) (Member 1) calls `api("places.confirm", { params, body })`
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
| [app/globals.css](../apps/web/src/app/globals.css), [app/styles/](../apps/web/src/app/styles/home.css), [app/layout.tsx](../apps/web/src/app/layout.tsx), [components/ui.tsx](../apps/web/src/components/ui.tsx) | Theme tokens and controls, per-screen styles (home, trips, itinerary, setup and share, library), app shell and metadata. Member 2 builds on these. | FE01 |
| [components/AppNavigation.tsx](../apps/web/src/components/AppNavigation.tsx), [icons.tsx](../apps/web/src/components/icons.tsx), [Illustration.tsx](../apps/web/src/components/Illustration.tsx) | Hover-expanding icon rail, shared line icons, illustrative covers and category tiles | FE01 |
| `app/home`, `app/my-trip`, `app/inspiration-library`, `app/discover`, [next.config.ts](../apps/web/next.config.ts) | Explicit screen routes and the old `/trips` redirects | FE01 |
| [lib/format.ts](../apps/web/src/lib/format.ts), [lib/trip-dates.ts](../apps/web/src/lib/trip-dates.ts) | Status labels, dates, opening-hours text; trip date spans and Upcoming / Draft / Past grouping | FE01 |
| [features/home/](../apps/web/src/features/home/HomePage.tsx) | Home dashboard at `/home` | FE01 |
| [features/library/](../apps/web/src/features/library/InspirationLibraryPage.tsx), [features/inbox/](../apps/web/src/features/inbox/InspirationCard.tsx) | Inspiration library at `/inspiration-library`: list grouped by type with search, trip and type filters, detail panel, polling while imports run; shared save box (`SaveComposer.tsx`, also on Home) and the add details / retry / skip card | FE02 |
| [features/notes/](../apps/web/src/features/notes/NoteButton.tsx) | Private notes drawer used by Member 2's views; browser-local store until a notes contract exists | FE01 |
| [features/landing/](../apps/web/src/features/landing/LandingPage.tsx) | Public landing in the Home page reference layout; sample trip card; pricing marked as not live | FE03 |
| [features/places/](../apps/web/src/features/places/PlacesPage.tsx) | Base screen, not yet restyled: candidates grouped by status, branch choice, evidence, map | FE04 |
| [components/MapView.tsx](../apps/web/src/components/MapView.tsx), [PlaceMap.tsx](../apps/web/src/components/PlaceMap.tsx) | Google Maps iframe (Maps Embed API route with a browser key, keyless single-stop embed without); numbered stop buttons and selection; no OpenStreetMap tiles since 23 Sep 2026 | FE04 |
| [features/auth/SignInForm.tsx](../apps/web/src/features/auth/SignInForm.tsx) | Dev sign-in screen, not yet restyled; switch to real auth when Member 4 lands BE10 | FE05 |
| [features/trips/](../apps/web/src/features/trips/TripsPage.tsx) | `/my-trip` and `/my-trip/all`, create trip by country (`CreateTripPage.tsx`), the trip header, Trip details columns | FE05 |
| [features/discover/](../apps/web/src/features/discover/DiscoverPage.tsx) | "Coming later" placeholder; reads no community data | — |
| `docs/design/`, `deliverables/launch/` | Design notes, brand, launch kit | FE01, FE07 |

**Status on 15 Sep** (source: [tasks.csv](../planning/tasks.csv))

| Task | Status | Done | Left |
| --- | --- | --- | --- |
| FE01 UI kit and direction | review | Theme tokens, shell, icons, illustrative art and routes built to the reference images | Member 2 review; record approval and pilot city (DEC-03); desktop visual and keyboard review |
| FE02 inbox and recovery | review | Inspiration library with add, add details, retry, skip, polling and type grouping | Browser check of every save status and `failureCode` in [F1](features/F1-import.md) |
| FE03 landing | in_progress | Public `/` for new visitors: hero, how it works, four feature proofs, shipped-input note, proposed pricing from the proposal (Free, Trip Pass about $15, Annual about $59 later, all marked not for sale), FAQ, tracked CTAs, share image, canonical URL, `robots.txt` and `sitemap.xml` | Check the proposed price against BE14 cost figures; set `SITE_URL` on the host (ask Member 4); final copy and brand (DEC-07); capture sharing-card evidence for M18 |
| FE04 place confirmation | todo | Base screen works: evidence, branch choice, merge, map | Restyle to the theme; evidence visible without expanding; source details on the map |
| FE05 sign-in, trips, setup | in_progress | `/my-trip`, `/my-trip/new` and Trip details rebuilt; forms stay API-backed | Restyle sign-in; real auth after BE10 (blocked); browser check of validation errors and reload |
| FE06 pilot observation | todo | — | Needs FE04, FE05 and BE11 |
| FE07 brand and launch kit | todo | — | Logo, name alternatives, screenshots, copy |
| FE08 evidence and answers | todo | — | M04, M06, M14, M17 and M18 are draft scaffolds; assemble M00 |

**Build next**

1. **FE01, FE02:** Member 2 reviews on a wide screen and by keyboard; record the result in tasks.csv.
2. **FE04:** restyle place confirmation with evidence always visible and a required branch choice.
3. **FE05:** restyle sign-in now; switch to real auth when BE10 lands.
4. **FE03:** add the proposed price, marked as a hypothesis, once BE14 cost figures exist.
5. **Notes:** if notes must sync across devices, propose a `contract:` change with Member 4 ([section 4](#4-where-frontend-and-backend-meet)).

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
| [features/itinerary/ItineraryPage.tsx](../apps/web/src/features/itinerary/ItineraryPage.tsx) | Trip header, Magazine / Timeline / Map route tabs, `?day=N`, generate and edit calls | FE09, FE10 |
| [TimelineView.tsx](../apps/web/src/features/itinerary/TimelineView.tsx), [ConflictList.tsx](../apps/web/src/features/itinerary/ConflictList.tsx) | `/timeline`: day tabs, move / remove / add, locked bookings without controls, checks | FE09 |
| [ItineraryMap.tsx](../apps/web/src/features/itinerary/ItineraryMap.tsx), [place-info.ts](../apps/web/src/features/itinerary/place-info.ts) | `/map`: numbered stop list, large map, selected-stop card; category and address lookup for stops | FE10 |
| [features/magazine/MagazineView.tsx](../apps/web/src/features/magazine/MagazineView.tsx) | `/itinerary`: day rail, stop cards, map preview, day notes and checks | FE10 |
| [features/sharing/](../apps/web/src/features/sharing/SharePage.tsx) | Share page (one-time link, revoke table, preview) and the `/s/:token` viewer | FE11 |
| [lib/api-client.ts](../apps/web/src/lib/api-client.ts), [use-api.ts](../apps/web/src/lib/use-api.ts), [use-submit.ts](../apps/web/src/lib/use-submit.ts) | Typed client and hooks: the frontend's side of the contract | FE09 |
| [lib/analytics.ts](../apps/web/src/lib/analytics.ts), [features/landing/TrackedLink.tsx](../apps/web/src/features/landing/TrackedLink.tsx) | Browser product events (console only for now) | FE13 |
| `tests/e2e/` | Browser tests (empty) | FE12 |
| `deliverables/pitch/` | Pitch visuals and demo | FE16 |

**Status on 15 Sep** (source: [tasks.csv](../planning/tasks.csv))

| Task | Status | Done | Left |
| --- | --- | --- | --- |
| FE09 timeline and edits | in_progress | Move, remove, add; locked bookings protected; `STALE_VERSION` reload; `EDIT_REJECTED` conflicts | `replace_stop` and a `dryRun` preview (agree the policy with Member 4); browser check |
| FE10 map and magazine | review | Magazine and map render one itinerary object; same `?day` across tabs | Member 1 review; check all three views match after an edit |
| FE11 sharing and viewer | in_progress | Share page and read-only viewer rebuilt; revoked and not-found states | Create, open in a private window and revoke in a browser; rate-limited state after BE13 |
| FE12 browser test | todo | — | Browser test in `tests/e2e` walking section 2 on the new routes |
| FE13 analytics | todo | Events log to the console | Provider from BE11; verify events carry no private content |
| FE14 journey, phone, keyboard | todo | No horizontal scroll at 375 px on eight routes (15 Sep check) | Keyboard pass, real phone, fix the largest blocker; needs FE04, FE05, FE11 |
| FE15 answers and backend review | todo | — | M02, M05, M16, M19 and M20 are draft scaffolds |
| FE16 visuals, pitch, rehearsal | todo | — | Pitch visuals from the working screens; demo rehearsal |

**Build next**

1. **FE10:** Member 1 reviews; then check that magazine, timeline and map match after one edit
   ([F5](features/F5-views.md) rule).
2. **FE11:** on the new share page, create a link, open it in a private window, revoke it and reload.
3. **FE12:** add a browser test tool in `tests/e2e` (Playwright is a good fit) that walks the demo in section 2 using
   the new routes. Run it locally and against Member 4's deployed URL.
4. **FE09:** agree with Member 4 whether to preview edits with `dryRun`, then add replace and preview.
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
