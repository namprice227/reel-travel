# AI module

Owner: Member 3 (backend). Add extraction, place matching, prompt versions and model-provider adapters here.

Consume only accessible input; return candidate places with evidence and uncertainty.
Keep factual lookup separate from model inference; do not treat confidence text as verification.
Put prompt versions in prompts/ and link measured changes to evals/results/.

## Interfaces ([types.ts](src/types.ts))

- `Extractor.extract(input)` returns `{ status: "ok", clues }` or `{ status: "needs_input", failureCode, message }`.
  Throw only for unexpected errors; the job retries.
- `PlaceLookup.search(clue, { destination })` returns `PlaceOption[]`: 0 = not found, 1 = confirm, 2+ = choose a branch.
  Hours, address and coordinates come from the provider.
- `ClueListSchema` validates model output before anything is saved.

## Current implementations (synthetic)

- `createFakeExtractor`: matches names from [gazetteer.ts](src/gazetteer.ts). Links and screenshots need a note or
  details. A save containing `[[fail]]` throws until details are added.
- `createFakePlaceLookup`: searches 17 fictional Tokyo venues. Names and hours are invented; never present them as real.

To add a real adapter: implement the interface here, add a case in `apps/web/src/server/providers.ts`, set
`AI_PROVIDER` or `PLACES_PROVIDER`, and keep keys server-side. Behaviour and acceptance checks:
[F1](../../docs/features/F1-import.md) and [F2](../../docs/features/F2-places.md).
