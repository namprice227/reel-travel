# Web application

Next.js 16 (App Router) serving both the UI and the API.
Frontend (`src/features`, `src/components`, `src/lib`): Member 1 builds sign-in, trip setup, inbox, places and landing
screens and the shared UI kit; Member 2 builds itinerary, magazine and sharing screens, the API client hooks and analytics.
Backend (`src/server`): Member 3 owns import and places; Member 4 owns identity, storage, jobs, itinerary and sharing.

| Path | What goes here |
| --- | --- |
| `src/app/` | Routes only. Pages render a feature component; `api/[...path]/route.ts` sends every API call to the router |
| `src/features/<feature>/` | Screens and components: auth, landing, trips, inbox, places, itinerary, magazine, sharing |
| `src/components/` | Shared UI: badges, banners, map |
| `src/lib/` | `api-client.ts` (typed client), `use-api.ts` (load and poll), `use-submit.ts`, formatting, analytics |
| `src/server/http/` | Contract router and handler types |
| `src/server/handlers/<feature>.ts` | One handler per endpoint id: unpack the context, call a service |
| `src/server/services/<feature>.ts` | Business rules and ownership checks |
| `src/server/jobs/` | Import pipeline and durable job runner |
| `src/server/db/` | Repository interfaces and the development JSON file store |
| `src/server/auth/` | Session cookie handling (dev sign-in) |
| `src/server/providers.ts` | Picks AI and place providers from env |

Services and jobs never import Next.js or `src/features`, so tests and scripts can call them directly.

Run from the repo root with `npm run dev`. Settings: copy [.env.example](.env.example) to `.env.local`.
Feature behaviour and ownership: [docs/features](../../docs/features/README.md).
