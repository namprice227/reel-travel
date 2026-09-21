# Import worker

Member 4 owns execution, persistence and bounded retries; Member 3 owns extraction and lookup.

`npm run worker` now executes the existing pipeline directly against Supabase. It does not call the web API.
Run it as a separate always-on Node 24 process. The repository root and all workspaces must be available.
Local `.env.local` is loaded by the workspace start command; hosted secrets come from the environment.

See [deployment, configuration and recovery](../../docs/operations/worker.md).

- One awaited child process per worker; no overlapping interval callbacks.
- Each attempt has a 15-minute deadline. The child also exits if its parent disconnects.
- Abandoned jobs are reclaimed after 20 minutes; three attempted claims exhaust automatic retries.
- Exhaustion updates job/save state atomically, preserving source, uploads, partial places and skipped saves.
- File mode is not supported by this multiprocess worker. Local fake imports remain inline in the web app.
