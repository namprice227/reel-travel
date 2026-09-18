# Reel Travel

Turn saved travel inspiration into confirmed places and an editable travel magazine.

**Status:** Supabase database, email/password authentication and private-storage adapters are implemented, with
PostgreSQL migrations and Vercel setup prepared. Account connection and live deployment verification remain pending.
Local file mode still works for development; extraction/place providers still use fictional fixtures.
Reel Travel is a working name. [Connect Supabase and Vercel](docs/operations/supabase-vercel.md).

**Team deadline:** 25 September 2026, 23:59 Asia/Singapore. Internal handoff: 24 September, 18:00.

New to the code? Read the [handover](docs/handover.md) first.
Then [team ownership](planning/team.md), the [dated roadmap](planning/roadmap.md), the [task board](planning/tasks.csv)
and the [feature specs](docs/features/README.md).
Track assignment coverage in the [milestone index](deliverables/milestones/README.md).

## Run it locally

Use Node.js 24 (tested); the locked test tooling requires Node 22.12+ in the 22.x line, 24.x, or 26+.
Python 3 is also required for the planning validator.

```bash
npm install
npm run seed      # optional: synthetic Tokyo trip for alice@example.test; bob@example.test has no trips
npm run dev       # http://localhost:3000, sign in with any email
```

Settings: copy `apps/web/.env.example` to `apps/web/.env.local`. Defaults work without it.

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js app (UI and API) on port 3000 |
| `npm run seed` | Reset `.local/dev-data` and load synthetic demo data |
| `npm run worker` | Optional: runs due import retries via the API (needs `WORKER_SECRET`) |
| `npm test` | Unit tests (contracts, AI fakes, planner) and service integration tests |
| `npm run test:db` | Supabase migration/concurrency checks on a new disposable PostgreSQL database (`TEST_DATABASE_URL`) |
| `npm run smoke` | Core demo flow over HTTP against the running app |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run docs:api` | Regenerate the [API reference](docs/api/endpoints.md) from the contracts |
| `npm run check` | Typecheck, tests, API reference up to date, planning validation. Run before every PR. |

## How the code fits together

Every API operation is declared once in [packages/contracts](packages/contracts/README.md). The server router validates
requests and responses against it, and the browser client is typed from it, so a screen and its endpoint can be built
by different people and still fit. Details and the change process: [docs/features/README.md](docs/features/README.md).

## Workspace

```text
apps/
  web/                  Next.js app: src/features (UI), src/server (router, handlers, services, jobs, db)
  worker/               Optional trigger for due import jobs
packages/
  contracts/            Zod schemas, endpoint registry, fixtures (shared by server and browser)
  ai/                   Extractor and place lookup interfaces, fake implementations
  planner/              Scheduling, validation and edits (pure functions)
database/               Future migrations; synthetic seed script
tests/                  Integration and end-to-end checks
evals/                  AI cases, scoring, and measured results
docs/                   Feature specs, API reference, architecture, design, operations
planning/               Ownership, dates, tasks, decisions, contributions
deliverables/
  references/           Proposal and source index
  milestones/           M00–M20 working answers
  evidence/             Screenshots, measurements, and evidence register
  pitch/                Pitch source
  launch/               Marketing source and demo storyboard
  final/                Reviewed submission PDFs
scripts/                Workspace validation, API docs generator, smoke test
```

Folders follow product boundaries, not teammate names: ownership may change without moving code.
Each member builds, tests, writes, and reviews. The initial allocation is **40 effort points and five graded milestones each**.

## Team and application links

Fill in before submission. Planned ownership is not proof of actual contribution.

| Member | Name | Matriculation number | Actual contribution / PR links |
| --- | --- | --- | --- |
| Member 1 | TODO | TODO | TODO |
| Member 2 | TODO | TODO | TODO |
| Member 3 | TODO | TODO | TODO |
| Member 4 | TODO | TODO | TODO |

- Group number: TODO
- Live application: TODO
- Public repository: TODO
- Local setup: see [Run it locally](#run-it-locally)
- Significant resources and credits: [sources](deliverables/references/sources.md)
- Actual work and AI assistance: [contribution log](planning/contributions.csv)

## Working routine

1. Claim a task in `planning/tasks.csv`; read its feature spec and agree any contract change with the reviewer.
2. Implement in a short feature branch with the task ID, for example `feat/B02-extraction`.
3. Add relevant checks and sanitized evidence; update your milestone answer in the same PR. Run `npm run check`.
4. Ask the assigned reviewer to reproduce acceptance criteria before marking the task done.
5. Log actual contributions and rebalance unfinished work at each roadmap gate.

Use the [submission checklist](deliverables/final/README.md) for the final handoff.
### Current real import flow

Real imports use Gemini for short English video transcription and OpenAI for source-backed place extraction.
Google Places lookup is deferred. Results appear as **Unverified** with source quotes and area hints; they
need future verification before planning. See [setup](docs/operations/google-places.md).
