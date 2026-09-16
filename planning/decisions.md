# Decisions and open questions

| ID | Decision / question | Owner | Due | Status |
| --- | --- | --- | --- | --- |
| DEC-01 | Confirm four names, matriculation IDs, group number, availability | All | 2026-09-12 | Open |
| DEC-02 | Confirm Coursemology product approval and portal deadline | Member 1 | 2026-09-12 | Open |
| DEC-03 | Select one pilot city and reachable travelers | Member 1 | 2026-09-12 | Open |
| DEC-04 | Select familiar stack, hosting, identity and database | Member 4 + Member 3 | 2026-09-12 | Supabase selected 2026-09-16; Vercel setup prepared; user will connect accounts |
| DEC-05 | Verify usable input routes and map/place provider access | Member 3 | 2026-09-12 | Audio sample scope and future Google Places chosen 2026-09-16; live access/terms verification pending |
| DEC-06 | Agree shared shapes and fake-provider fixtures | All | 2026-09-12 | Open |
| DEC-07 | Confirm working name and brand direction | Member 1 + Member 2 | 2026-09-15 | Open |
| DEC-08 | Select candidate model plus two alternatives for measurement | Member 3 | 2026-09-15 | OpenAI primary; Gemini/Claude alternatives selected 2026-09-16; measurement pending |
| DEC-09 | Divide work into frontend (Members 1–2) and backend (Members 3–4) tracks | All | 2026-09-15 | Decided 2026-09-15; confirm at the next blocker check |

This scaffold uses one repository, a web app, one optional separate job process, and small shared modules.
No paid provider, repository, cloud deployment, or model has been provisioned.

Decision entry template: date; question; options; evidence; choice; trade-off; owner; follow-up.

## 2026-09-16: Supabase platform and Vercel setup (DEC-04)

- User instruction: use Supabase for the database; prepare Supabase/Vercel setup and leave account connection to the user.
- Choice: Supabase PostgreSQL, Auth and private Storage behind existing repository/session interfaces. Vercel hosts
  Next.js; Supabase Cron/pg_net calls the protected worker endpoint each minute using a Vault-held secret.
- Alternatives: keeping the JSON file store is suitable only for local development; direct browser database access
  would require a different owner/RLS contract. Current services retain ownership checks and server-only credentials.
- Evidence: local production build and PostgreSQL migration/concurrency tests; live project evidence pending.
- Trade-offs: server-only JSONB document adapter minimizes contract churn; generated columns enforce/index core
  relationships. Provider-specific RPCs and a private bucket need provisioning. Custom 30-day application sessions
  preserve existing call sites but do not follow Supabase password-reset session revocation automatically.
- Follow-up: user applies migration, connects credentials/email/Vault/Vercel and runs the
  [hosted checks](../docs/operations/supabase-vercel.md). No cloud resources or accounts provisioned in this session.

## 2026-09-14: App base stack (DEC-04, partial)

- Question: which stack lets four people build UI, AI, planner and identity in parallel by 25 September?
- Options: Next.js + TypeScript full stack; React (Vite) + Express in TypeScript; React (Vite) + Python FastAPI.
- Evidence: none measured yet; chosen for one language, one deploy and shared typed contracts.
- Choice: Next.js 16 + TypeScript in npm workspaces, with zod contracts shared by the server router and the browser client.
  Chosen by the team member who requested the app base; confirm or revise at the next gate.
- Trade-off: contract mismatches become type errors and there is one app to deploy; Python-first AI work needs
  TypeScript adapters or a separate service.
- Deferred behind interfaces: database and private storage (`Repositories`, `PrivateAssetStorage`), auth
  (`apps/web/src/server/auth`), AI and place providers (`Extractor`, `PlaceLookup`). Development stand-ins: JSON file
  store, email-only sign-in, synthetic fixtures.
- Owner: Member 4 + Member 3. Follow-up: record the database, auth and hosting choice here before BE10/BE11.

## 2026-09-15: Frontend and backend tracks (DEC-09)

- Question: how should four people divide the remaining work now that the app base exists?
- Choice: Members 1 and 2 build the frontend; Members 3 and 4 build the backend.
  - Member 1: shared UI kit, landing page, sign-in and setup screens, inbox and place confirmation, brand and launch kit.
  - Member 2: itinerary editing, map and magazine views, sharing screens, browser tests, funnel analytics, pitch visuals.
  - Member 3: AI extraction, place lookup, import jobs, prompt and model evaluation.
  - Member 4: database, auth, uploads, deployment, planner and edits, sharing safeguards, submission package.
- Trade-off: backend work planned for three people now sits with two. Tasks the app base already covers (contracts,
  router, development jobs, baseline planner, sharing links) were merged. Member 4 carries two areas; rebalance at G2.
- Milestone answers moved with the work, keeping five answers and one lower-weight answer per member (see team.md).
- Task ids now name the track: FE01–FE08 Member 1, FE09–FE16 Member 2, BE01–BE08 Member 3, BE09–BE16 Member 4.
- Follow-up: several tasks due 12–15 Sep changed owner on 15 Sep. Agree realistic dates and update tasks.csv.

| Old id | New id |
| --- | --- |
| A01 | FE01 |
| A02 | FE02 (inbox), FE04 (places) |
| A03 | FE03 (landing), FE04 (places map), FE10 (itinerary map) |
| A04 | FE09 (itinerary edits), FE10 (magazine) |
| A05 | FE06 (capture pilot), FE14 (journey integration) |
| A06, A07, A08 | FE08, FE15, FE16 |
| B01–B08 | BE01–BE08 |
| C01 | BE09 |
| C02, C03 | BE12 |
| C04 | BE13 |
| C05, C06 | BE14 |
| C07 | BE16 |
| C08 | FE16 (pitch claims), BE16 (final itinerary cases) |
| D01, D02, D03 | BE09, BE10, BE11 (browser events move to FE13) |
| D04, D05 | BE13, BE15 (funnel capture moves to FE13) |
| D06 | FE07 |
| D07, D08 | FE15 (UI flow review), BE16 |
| New | FE05 (sign-in and setup screens), FE11 (sharing screens), FE12 (browser tests) |


## 2026-09-16: Input access and audio experiment (DEC-05)

- Direction: user requested local audio -> transcription -> validated extraction, isolated from the web upload flow.
- Owner: Member 3; human review pending. Branch: `feat/BE01-audio-extraction` (supersedes the branch named in AGENTS.md).
- Input choices: local permissioned audio for the manual sample; transcript text directly through the same extractor.
  Existing screenshot upload/recovery remains; vision, video frames and web audio uploads are deferred.
- Social links are never scraped or downloaded; existing `SOURCE_INACCESSIBLE` and add-details recovery remain.
- Future factual lookup: Google Places, supplying provider IDs, coordinates, addresses, available hours and branches.
  No Google Places calls implemented. Access, licensing, retention/attribution requirements and costs remain to verify.
- Extraction values are unverified. Keep `ExtractedPlaceSchema` separate from the existing evidence-linked persisted
  `CandidatePlace`; do not rename the existing text/link/screenshot source enum or change planner inputs.
- Evidence: [audio implementation](../deliverables/evidence/be01-audio-2026-09-16.md). Offline integration checks are
  not proof of provider access, source rights, model quality or live reliability.
- Tokyo is the synthetic fixture context per user guidance; DEC-03 traveler recruitment remains open.
  Do not inject Tokyo into transcripts that do not state it.

## 2026-09-16: Extraction model families (DEC-08)

- User-directed choice: OpenAI primary; Google Gemini and Anthropic Claude are BE05 evaluation alternatives.
- Initial configurable integration defaults: `gpt-4o-mini-transcribe` for speech and `gpt-4o-mini` for structured text.
  No claim these are optimal, cheapest, or verified for the team's account. No other provider implemented.
- Trade-off: one native HTTP adapter keeps the sample small; the existing Zod schema generates the provider JSON schema.
- Versioned prompt treats transcripts as untrusted data. No tools or browsing enabled; missing facts remain unknown.
- BE05 must use the same held-out inputs, extraction schema and equivalent prompts/content for all candidates.
  Measure name/city/area accuracy, hallucination, schema validity, ambiguity, injection resistance, cost and latency.
  Keep these development fixtures out of the held-out set; mocked tests are not quality measurements.
- Follow-up: manual API check with permissioned audio, independent labels and account/model access verification.
- API reference: [transcription](https://developers.openai.com/api/docs/guides/speech-to-text),
  [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
