# Offline scheduling replay

This is a deterministic replay of the first returned responses from the frozen v5 benchmark, not a new model/API benchmark. No API calls were made. All venues are fictional.

- [Method, results and limitations](../../../deliverables/evidence/itinerary-practical-v6-2026-09-23.md)
- [Full results, checksums and per-case issues](replay.json)
- [Runner](../../../scripts/replay-itinerary-scheduling.ts)

Reproduce from the repository root with `npx tsx scripts/replay-itinerary-scheduling.ts`. This explicitly refreshes this replay artifact; it never alters the source benchmark files.
