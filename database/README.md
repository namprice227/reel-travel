# Database workspace

Owner: Member 4; Member 3 reviews itinerary persistence.

The database is not chosen yet (DEC-04). Until then the app uses a development JSON file store
(`.local/dev-data/db.json`, gitignored) behind the `Repositories` interface in `apps/web/src/server/db/types.ts`.

- `migrations/`: migrations for the chosen database. Implement `Repositories` and `PrivateAssetStorage` for it, then
  swap `repos()` and `assetStorage()` in `apps/web/src/server/db/index.ts`.
- `seeds/`: [seed-dev.ts](seeds/seed-dev.ts) loads synthetic demo data through the services (`npm run seed`).

Apply access controls by trip owner; keep the read-only share projection separate.
Do not commit production exports or private uploads. Requirements for a real store: [F0](../docs/features/F0-foundation.md).
