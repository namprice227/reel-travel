# BE05: place-clue benchmark, 2026-09-22

Implemented an isolated benchmark for saved transcript/visual observations -> place clues across OpenAI, Anthropic and DeepSeek. Models and keys are read from environment; production imports and .env.local are unchanged.

[Protocol and commands](../../evals/llm/README.md), [CLI](../../scripts/benchmark-llm.ts), [offline tests](../../tests/integration/llm-benchmark.test.ts).

## Implemented

Shared prompt and strict local schema; deterministic entity matching with aliases and branch context; duplicate accounting; manual-review flags; precision/recall/F1/hallucination/schema metrics; latency and reported tokens; configurable cache-aware pricing with unknown rates preserved; private checkpoint and offline replay; optional existing Google Places top-1/top-3 evaluation. Provider failures remain in the denominator. Four explicitly fictional development samples only.

## Verification

- Initial targeted offline tests: 24 passed. Final suite includes 25 benchmark tests after adding partial-resume cache-preservation coverage.
- CLI --help: passed.
- git diff --check: passed.
- Initial typecheck found a new CLI array annotation issue (fixed), plus missing locally installed ajv already declared in package.json/package-lock.json. Restored existing dependencies with npm install --ignore-scripts --no-save --package-lock=false; no manifest/lockfile dependency changes requested.
- Final npm run check: PASS; all workspace typechecks, 544 tests across 44 files, API docs up to date, planning validation PASS. No live network calls in tests.

No live provider or Google Places calls were made. No accuracy, cost, latency or model-ranking measurements are claimed. Offline mocked tests validate the framework, not model quality. Prices are intentionally unconfigured. Held-out permissioned data, independent human labels/review, account/model access and final selection remain pending. Existing production/UI behavior and API contracts remain unchanged.

## Files created/changed

Created evals/llm/schema.ts, providers.ts, metrics.ts, benchmark.ts, pricing.json and README.md; evals/datasets/llm-place-extraction.json; scripts/benchmark-llm.ts; tests/integration/llm-benchmark.test.ts; and this evidence file.

Updated package.json (command only), evals/README.md, planning/tasks.csv, planning/decisions.md, planning/contributions.csv, deliverables/milestones/M09.md and M11.md. No production code, API contracts, credentials or lockfile changes.

## Evaluation-only YouTube human review follow-up

Added scripts/eval-youtube.ts, evals/llm/youtube-review.ts, evals/llm/YOUTUBE.md and tests/integration/youtube-eval.test.ts; package.json exposes eval:youtube. Shared production Gemini evidence schema/prompt/reader are reused through imports only. Separate prepare/review/run/offline stages prevent comparator calls before a current human attestation. Review hashes bind labels to frozen evidence; null labels differ from confirmed empty lists. Existing caches avoid repeated evidence/comparator calls. No production files, API routes, Supabase or frontend behavior changed. Follow-up npm run check PASS: 557 tests across 45 files including 13 new workflow tests; workspace typechecks, API docs and planning validation passed. eval:youtube --help and git diff --check passed. The initial test run found JSON property-order sensitivity in review hashes; canonical schema parsing fixed it before the passing full run. No live calls were made.

## Offline review suggestions follow-up

Added evals/llm/review-candidates.ts and tests/integration/review-candidates.test.ts. Updated youtube-review.ts, scripts/eval-youtube.ts, existing workflow tests and evals/llm/YOUTUBE.md. Deterministic saved-evidence suggestions retain quotes/timestamps, deduplicate names without collapsing explicit branches, and mark source uncertainty/sign-only names. Approve-all does not approve uncertain candidates. Menu supports inspect/edit/delete/add/individual approval; reviewer phrase and evidence-bound hash remain required. Existing labels and benchmark schemas stay compatible. No production file changed; no live provider calls made. Targeted tests: 23 passed. Final npm run check PASS: 567 tests across 46 files, all workspace typechecks, API docs and planning validation. Added 10 candidate/menu tests and adapted 13 existing workflow tests; git diff --check passed. Existing offline replay compatibility and evidence/label hash invalidation remain covered. Heuristic suggestions may miss lowercase/non-Latin names or propose uncertain captions; independent human review is still required.

## Candidate noise correction

User review exposed incidental billboard/advertising OCR and a generic Busy Crossing candidate. named-place-rules-v2 requires venue context or independent name corroboration for OCR, filters country-level context and generic descriptors, and separates named landmarks joined by and. Changes are evaluation-only: review-candidates.ts, proposal version in eval-youtube.ts, tests and guide. Added three regressions; 26 targeted tests passed. Read-only replay against the user's saved Gemini evidence produced five named candidates rather than the reported 19; no saved evidence or labels were modified, and no provider calls were made. Final npm run check PASS: 570 tests across 46 files, workspace typechecks, API docs and planning validation. git diff --check passed.

## Review display restored

Restored the full saved Gemini evidence JSON once at the start of review, followed by the filtered proposed labels and existing approve/edit menu. Candidate rules, label schema and explicit final confirmation are unchanged. Updated youtube-review.ts, the existing review-menu test and YOUTUBE.md. Validation: 26 offline review tests passed. Full repository check was not repeated for this display-only change. No provider calls made.

## Conservative shared extraction prompt

Strengthened only the PROMPT string in evals/llm/schema.ts: require direct identity evidence; reject plausibility, generic scenery and cultural/visual guessing; prefer precision and omission; require traceable quotes; preserve uncertainty without inventing entities. All three existing adapters consume this same prompt. The unchanged schema has confidence and nullable location_context but no dedicated uncertainty field, so the prompt requires uncertain identities to be omitted. No CLI text, output schemas, metrics, review flow, provider settings or production/video pipeline code changed. Existing input hashes include the full prompt and therefore prevent mixing old cached attempts with this prompt. Saved results were not modified. Validation: 51 existing offline tests passed across the benchmark and review suites, including all three providers' shared-prompt checks. No live calls or measured hallucination-reduction claims. Full repository check not repeated for this prompt-only change.

## Explicit-name proposal priority

Updated review-candidates.ts to prioritize explicit OCR/transcript names, broaden named-place recognition, preserve source spelling and remove description-only entity creation. Descriptions now attach supporting context only. Unknown location remains null with notes; identities are not dropped on that basis. Proposal algorithm metadata is named-place-rules-v3. No CLI text, JSON shape, review controls, benchmark metrics or production pipeline changed. Added five explicit-name regressions and updated older fixtures to supply OCR rather than rely on descriptive name creation. Targeted 31 tests passed; final npm run check PASS: 575 tests across 46 files, workspace typechecks, API docs and planning validation. git diff --check passed. No provider calls or saved-label modifications.

## Broad explicit travel entities

Expanded only evaluation proposal inclusion: typed shops and natural/area entities; literal bare-name recognition vocabulary; independently retained city/area context mentions; MT FUJI spelling support; PLAN IN overlay exclusion. No POI or branch resolution required. Existing unknown-location notes remain. Vocabulary matches source text only; unfamiliar bare names still require contextual evidence and coverage is not exhaustive. Descriptions never seed entities. No CLI/schema/metrics/workflow/pipeline changes or live calls. Added five offline regressions covering separately spoken cities and all 13 requested examples, cross-source deduplication, unfamiliar contextual names and negative evidence. Targeted review/evaluation suites: 35 tests passed. Final npm run check passed: 580 tests across 46 files plus workspace typechecks, API docs and planning validation. git diff --check passed.

## Human-approved external lookup suggestions

Evaluation review reuses the existing Google Places adapter when a key is configured. Unknown locations/branches receive source-context queries and up to three distinct name-token-matching results with addresses and IDs. Number selection is explicit; failures or blank input preserve unknown. Final REVIEWED gates saving lookup-review.json separately with evidence/review hashes and reviewer provenance. Source labels and benchmark inputs/metrics remain unchanged. Existing menu and controls remain; lookup selection prompts precede final confirmation. No production changes. Five new mocked regressions cover query context, filtering/limits, selection, errors, resolved entries and CLI persistence/failed confirmation. 41 targeted tests passed. npm run check passed: 585 tests across 47 files plus workspace typechecks, API docs and planning validation. No live calls or measured match-quality claims.

## One-command approve-all

At user request A/a now approves every retained entry including uncertain suggestions. Previously uncertain entries kept the menu open. Menu/help wording updated; candidate evidence, unknown locations, validation, separate lookup selection and final REVIEWED attestation remain unchanged. Regression checks cover upper/lowercase one-command approval including uncertain names and rejection of invalid confirmation. Validation: 42 offline tests passed across candidate review, YouTube evaluation and lookup review suites. Full npm run check not repeated for this small control-flow change. No live calls or production changes.

## General entity name matching

Added evaluation-only entity-matching.ts and integrated it in metrics.ts. Safe positional abbreviations and normalized names/aliases match automatically; edge-type omission and bounded one-token spelling edits only request manual review. Conflicting types, differing numbers, wrong labelled locations and invented evidence remain unsupported. Exact identity takes precedence; duplicates use safe normalization. No place-specific mappings, schema/CLI/table changes, prompt changes or live calls. Added parameterized matching regressions: 50 targeted matching/benchmark tests passed. npm run check passed: 611 tests across 48 files plus workspace typechecks, API docs and planning validation. git diff --check passed. Existing saved reports were not overwritten; offline replay can rescore cached predictions with the new matcher. Extra unlabelled model location detail still requires manual review.

## Defensible entity evaluation methodology

Separated entity credit from location/branch claims. Introduced hash-bound evaluation-review.json with independent source-scope confirmation, shared incidental/ambiguous truth exclusions, explicit correct/incorrect/excluded decisions and source-only location adjudication. Final P/R/F1 are withheld for unresolved identities or scope; unresolved locations withhold hallucination rate. Unsupported location claims remain hallucinations even for a correct entity name. JSON audit counts expose TP/FP/FN, truth/prediction totals, unresolved/excluded cases and distinct claim denominators; existing Markdown/terminal table structure is unchanged. No model outputs, prompts, saved private reports, extraction pipeline or lookup-derived truth changed. Added methodology regressions and offline CLI draft-to-confirmed replay checks: 74 targeted tests passed. npm run check passed: 621 tests across 49 files, workspace typechecks, API documentation checks and planning validation. git diff --check passed. Held-out sampling, independent annotation and actual adjudication of private videos remain human work; no live calls made.

## Metric unknown diagnostics (2026-09-23)

Added separate metrics-diagnostics.json/md outputs with per-model counts, formulas and explicit incomplete versus zero-denominator reasons. Inspection of a private cached run showed unsigned adjudication and unconfirmed case scope despite completed source labelling; one model also retained an unresolved entity variant. No review decisions or model outputs were changed, and no scoring guards were bypassed. Offline replay regenerated reports and generated private diagnostic files without provider calls. Four regressions cover scope blocking with zero unresolved matches, finalized scores, genuinely empty denominators and unresolved entity counts. npm run check passed: 625 tests across 50 files, typechecks, API docs and planning validation. Existing CLI summary table and extraction prompts unchanged. Human scope/identity decisions remain pending.

## Interactive adjudication (2026-09-23)

Added eval:youtube --adjudicate: saved source-scope confirmation/exclusions, unresolved entity C/I/X decisions with reasons and zero-based truth selection, location adjudication when needed, nonempty reviewer and explicit ADJUDICATED. Reuses unchanged scorer and validates zero unresolved before saving. Only evaluation-review.json changes; dataset/cache/review concurrent edits reject saving. Prints exact offline replay command after success. No provider calls or actual private human decisions made. Added seven offline regression cases covering outcomes, required fields, cancellation, persistence and scope. npm run check passed: 632 tests across 51 files plus typechecks, API docs and planning validation. git diff --check passed.

## Historical prompt replay repair (2026-09-23)

Prompt edits exposed a cache mismatch in both offline replay and adjudication. Added saved-report provenance validation for historical offline use, preserving original prompt/response metadata and current-prompt checks for live resume. Exposed safe cache errors in YouTube CLI. No scoring, extraction output or review decision changes. Full check passed 633 tests before the evaluated-row parser adjustment; final targeted replay/adjudication suites passed 33 tests including evaluated report fields. Actual private cached run replayed successfully without provider calls; human adjudication remains user-controlled.
