# Source country/category classification ? 20 September 2026

## Change

User requested country and food/attraction grouping during OpenAI clue extraction. Added required nullable
model output labels with separate evidence passage IDs. Server validates ISO codes/category allowlist,
copies literal evidence, and requires an explicit country name in the country quote. Missing label support
stays unknown. Labels remain AI provenance in source evidence and never replace provider facts or confirm places.
No extra model call per import, database migration, or automatic backfill. Existing source contracts remain
compatible via optional classification; the real model response requires the new fields.

Labels persist through import/re-import and confirmation. Library albums and category filters use new source
labels, handle multi-country saves, and preserve unknowns; old records retain their previous organization.
Place cards display labels with AI provenance and supporting quotes. Country/source association and category
semantics still rely on model interpretation: literal citation validation is not proof of accuracy.

## Checks

- Targeted offline tests: 113 passed across four files before the final prompt wording adjustment.
- Live OpenAI synthetic acceptance: passed seven assertions for JP/food, FR/attraction, unknown/null and
  literal evidence; three fictional places, no lookup and no data saved. Initial attempts returned labels
  without citation IDs; the backend withheld them. Explicit citation instructions fixed the tested example.
  This is a small live smoke check, not a quality or prompt-injection benchmark.
- Final checks completed 21 September: npm run check passed all 358 tests across 27 files, workspace
  typechecks, generated API documentation and planning validation. npm run build passed under Node 24.
- Browser interaction verification remains pending. The live app redirected the synthetic browser to sign-in;
  automatic approval review blocked both the combined restart and isolated server setup (generic blocked-by-policy
  reason). Neither command ran. An isolated file/fake browser acceptance script is provided but not passed.
  The running local app/worker were preserved; library country/category behavior is covered by integration tests.

## Limits

Country labels require explicit source country names, not city-to-country inference. Stored labels are
AI suggestions and not externally verified geography. Historical records are not reprocessed. Google
provider geography enrichment, transactional merging and LLM itinerary generation remain separate work.
The test does not re-transcribe a real video. Hosted release and independent human review are pending.

References: [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs),
[F2 behavior](../../docs/features/F2-places.md).
