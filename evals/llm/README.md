# Place-clue LLM benchmark (BE05)

Compares OpenAI, Anthropic and DeepSeek on **saved transcript plus optional textual visual observations -> place clues**.
No transcription, downloads, Supabase writes, itinerary generation or model-selection claims.
Four fictional development samples are supplied. They are not an independently labelled held-out dataset.

## Run from the repository root

```powershell
npm run eval:llm -- --help
npm run eval:llm -- --provider all --live
npm run eval:llm -- --provider openai --case tokyo-001 --live
npm run eval:llm -- --provider anthropic --live
npm run eval:llm -- --provider deepseek --live
npm run eval:llm -- --offline
npm run eval:llm -- --provider openai --case tokyo-001 --offline
npm run eval:llm -- --provider all --live --resume
```

Use the same provider/case selection when replaying a subset run. Missing comparison rows are rejected.
The existing itinerary benchmark's explicit `--live` convention prevents accidental paid calls.
No credentials are required for `--offline`. It validates and scores the saved response text again.
`--resume` reuses recorded successes **and failures** without another call, verifies model/settings/input hashes,
and checkpoints after each new attempt. A fresh live run replaces the selected cache.
For separate runs use `--cache evals/private/run-2/cache.json --out evals/private/run-2`.
No retries or JSON repair hide first-attempt failures.

Environment, loaded from `apps/web/.env.local` without overriding shell variables:

| Provider | Key | Model |
| --- | --- | --- |
| OpenAI | OPENAI_API_KEY | OPENAI_MODEL |
| Anthropic | ANTHROPIC_API_KEY | ANTHROPIC_MODEL |
| DeepSeek | DEEPSEEK_API_KEY | DEEPSEEK_MODEL |

All selected providers are checked for nonblank configuration before any requests. Model IDs have no fallback.
The existing production `OPENAI_EXTRACTION_MODEL` is independent. This benchmark never edits your env file.
Keys and request headers are never saved; errors use fixed codes and known environment secrets are redacted from outputs.

## Files and architecture

- `schema.ts`: benchmark-only strict Zod output and dataset schemas, shared prompt/version, hashes.
  Name and location limits reuse production `PlaceClueSchema`. Confidence is benchmark metadata, not a verified fact.
- `providers.ts`: small provider adapters reuse production `providerJson` (timeout, bounded body, safe errors).
  Production extractors do not expose token usage or this output shape; they are not changed.
- `metrics.ts`: deterministic matching and counts.
- `benchmark.ts`: attempts, validation, replay, prices, summaries and optional existing Places lookup.
- `scripts/benchmark-llm.ts`: env loading, filtering, checkpointing, CLI and reports.
- `../datasets/llm-place-extraction.json`: four synthetic samples.
- `../../tests/integration/llm-benchmark.test.ts`: offline regression tests.

Prompt rules adapt `packages/ai/prompts/extract-places-v1.ts`: untrusted source, source-backed clues,
unknown locations stay null, no invented business facts, deduplicate mentions and preserve explicit branches.
The benchmark field names differ from production, so it uses a separately versioned shared prompt.
Ground truth, aliases, category and synthetic flags are never sent to the LLM.
All providers receive identical semantic instructions, evidence JSON and field definitions.

Settings are recorded per row: 1500 output tokens, 60s timeout, no automatic retries.
GPT-5.6 uses reasoning `none`; OpenAI temperature is conservatively omitted.
Haiku 4.5 uses temperature 0; other Claude models omit it for compatibility.
DeepSeek uses temperature 0 with thinking disabled and JSON object mode.
OpenAI/Claude use structured JSON schema. Provider-compatible schemas omit unsupported bounds;
the same full local Zod validator enforces all bounds for all providers. Truncated/refused output is rejected.
Changing to other model families may require updating `settingsFor`; no silent model substitution occurs.

Implementation references (consulted 2026-09-22):
[OpenAI model](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[Claude structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/).
These document formats, not verified account access or measured performance.

## Add manually labelled examples

Copy the dataset to `evals/private/my-dataset.json` for permissioned/private material.
Use `--dataset evals/private/my-dataset.json` in both live and replay commands.
Keep development and held-out datasets separate. Have a person exhaustively label supported entities,
branches and aliases before testing; do not tune the prompt against the held-out set.

```json
{
  "description": "Permissioned, independently labelled examples; describe provenance here",
  "split": "held-out",
  "cases": [{
    "id": "my-001",
    "synthetic": false,
    "category": "speech-and-visual",
    "transcript": "Original transcript text",
    "visual_observations": ["Original Gemini observation text"],
    "ground_truth": [{
      "name": "Manually labelled venue",
      "aliases": ["An explicitly accepted alternate name"],
      "location_context": null,
      "location_aliases": []
    }]
  }]
}
```

Optional observations are an array of strings, copied from saved Gemini output. Empty transcript is supported
for visual-only evidence. Each example requires a unique ID, explicit synthetic flag and exhaustive truth list;
an empty truth list means there is no supported entity. Unknown location is null.
Do not add invented Google IDs to synthetic cases. Dataset and prompt hashes prevent stale offline scoring.

## Metrics and entity matching

Unicode NFKC, lowercase, apostrophe removal, punctuation-to-space and whitespace normalization precede exact matching.
Canonical labels and explicit aliases use the same general name matcher. Positional abbreviations expand
initial Mt to Mount and final St/Rd/Ave/Av/Blvd/Bldg/Sta/Stn to their place-type forms. Initial St is ambiguous
and is never automatically expanded. Safe normalized equality earns name-match credit.
Adding/removing a generic edge type (Street, Statue, Building, Museum, Park, Station and road variants)
only requests manual review; conflicting explicit types do not establish equivalence. A single insertion,
deletion or substitution in one token of at least five characters also only requests review. Token counts,
other tokens and numbers must agree. Exact names/aliases take precedence over fuzzy alternatives.
No place-specific pairs, geographic lookup, BLEU/ROUGE or paid evaluator are used. Accents are retained.
Annotate alternate names/transliterations as aliases to explicitly establish equivalence.
Location aliases still use the existing exact normalization and branch ambiguity checks.

Ground truth represents travel entities intentionally presented or recommended by the source. Incidental map
labels, advertising or background geography are not automatically target entities. Review the source before
seeing comparator outputs. Proposal heuristics are only a recall aid; bulk approval alone does not establish scope.

Entity extraction and location/branch resolution are scored separately. A unique matching name earns entity
credit even when its location is missing or wrong. A wrong or unsupported inferred location remains a hallucinated
claim. An extra location mentioned in evidence but not annotated needs human assessment of the relationship.
Exact branch/location matching is audited separately; external Places lookup data never supplies source truth.

Name/alias predictions collapse onto each matched truth entity. Duplicates earn no extra entity credit.
A prediction requires a nonempty contiguous literal quote from the saved transcript or an observation.
Invented evidence cannot be rescued by adjudication. Literal quotations establish provenance, not semantic
entailment; human source review must check the asserted relationship and correct automatic decisions if needed.

### Adjudication before final metrics

For YouTube runs, `npm run eval:youtube -- --url "YOUTUBE_URL" --adjudicate` completes the following review interactively and prints the replay command.

Every benchmark run creates `evaluation-review.json` beside the reports if absent. It contains source entity
indices, immutable model predictions, suggested match indices and editable decisions. Edit this file; never edit
the cache or model responses to change a score. The same existing `--offline` command applies saved decisions.

1. Review each case's intended travel entities independently of model outputs. Set `scopeConfirmed: true`.
   Add incidental or genuinely unresolvable truth indices to `cases[].exclusions` with reasons. Exclusions apply
   identically to all models. Missing intended entities require a corrected dataset and fresh review, not per-model labels.
2. For ambiguous `rows[].entries[]`, set `outcome` to `correct` with a zero-based `truthIndex`, `incorrect`, or
   `excluded`, and provide a `reason`. `auto` keeps the deterministic decision; an uncertain auto decision stays unresolved.
   A prediction-only exclusion removes that prediction from scoring but does not erase a missed truth. Exclude a
   genuinely ambiguous ground-truth entity at case scope if it should leave every model's recall denominator.
3. Review location claims separately through `location`: `auto`, `supported`, `unsupported`, or `excluded`.
   Supported locations must occur in source evidence or source annotations; map lookup knowledge is not evidence.
   An entity may be correct while its location is unsupported. Exclusions must be justified, not used to remove errors.
4. Set `reviewer` and `confirmation: "ADJUDICATED"`. Replay offline. Repeat until required entity reviews are resolved.
   No model, Gemini or Places call is needed. Unconfirmed scope or unresolved entity decisions keep P/R/F1 `unknown`.
   Unresolved location claims also withhold the hallucination rate; they do not block independent entity metrics.

Decisions are bound to the full dataset, raw cached rows and scoring version. Changed inputs reject stale decisions.
When deliberately changing the dataset/cache, retain the old file for audit and use a new output directory or rename
`evaluation-review.json` before generating a fresh draft. Do not copy confirmation across changed evidence blindly.
Reviewer decisions and binding hashes are embedded in the report. Existing output table columns remain unchanged.

### Counts and denominators

Each JSON row has `score.audit`; each model summary has `audit`:

- Ground-truth total, eligible count (row audit / summary `expected`) and excluded ground-truth count.
- Raw and eligible prediction counts; duplicate count is available on each score.
- TP, FP, FN, unresolved identity cases and excluded predictions. FN is null until entity scoring is finalized.
- Scope confirmation, finalization status and pending scope cases in the summary.
- Location-claim status counts and source-annotated branch resolution counts per row; branch totals in summary.
- Hallucination denominator: normalized prediction claims before alias-to-entity deduplication, excluding scoped-out
  predictions. The numerator counts each claim with an unsupported entity or location once. This can coexist with
  a correct extracted name and is distinct from entity FP.

Micro precision = TP / (TP + FP); recall = TP / eligible ground truth; F1 = 2 TP / (eligible predictions + eligible truth).
At finalization eligible predictions equal TP + FP. Unresolved predictions are recorded, never assigned TP or FP,
and no final P/R/F1 is published until they are adjudicated. Exclusions and coverage must accompany comparisons.
Schema-invalid/failed attempts have no accepted entities and miss eligible truth; error/schema counts remain visible.
Undefined denominators remain unknown. Latency and tokens retain original recorded values; replay does not invent
new measurements. Lookup costs remain outside comparator cost. Confidence is not treated as calibrated.

Use multiple diverse videos, freeze the reviewed scope before comparing models, and reserve unseen held-out videos
for final reporting. Report exclusions and disagreement, ideally with independent reviewers. One video's scores or
five convenience samples do not establish generalization. This tooling implements a consistent rubric, not proof
of annotation quality. Apply corrections to every provider and report the scoring version with comparisons.

## Pricing

`pricing.json` deliberately ships with no rates: unknown cost is null, not free.
Pass `--pricing path/to/pricing.json`; use keys `provider/exact-requested-model-id`.
Each rate entry must supply numeric `inputPerMillion`, `outputPerMillion`, an official `source` URL,
and a `checkedOn` date (YYYY-MM-DD). Add `cachedInputPerMillion` and `cacheWritePerMillion`
when applicable. Currency is USD; no fabricated sample prices are supplied.
Look up your actual provider/model/service rates and insert those values.
Full cost = (uncached input * input rate + cached input * cache rate + cache-write tokens * write rate
+ output * output rate) / 1,000,000.
Any required usage/rate missing gives null. Known partial costs and priced-case counts remain visible.
Pricing is snapshotted in each report. These are estimates: no tax, tiered context surcharge,
batch discount, exchange conversion or Places charges. Inputs are bounded to small extraction examples.

## Outputs and optional Places

Default gitignored `evals/private/llm/` contains:
- `cache.json`: replayable text/usage/timing/model/settings; no requests, headers or credentials.
- `llm-place-extraction-results.json`: per-case predictions, missed/unsupported entities,
  review flags, invalid output, provider failures, dataset/prompt hashes, settings and aggregate counts.
- `summary.md`: model comparison table.

These may contain private transcripts quoted in predictions. Publish only reviewed, sanitized copies to
`evals/results/` for the milestone. Summary headers call out review and synthetic-data limitations.

Optional: `npm run eval:llm -- --provider all --dataset evals/private/my-dataset.json --live --places`.
Requires `GOOGLE_PLACES_API_KEY` and manually verified `google_place_id` per ground-truth entity.
Optional per-case `destination` is used only for Places search, never to supply unsupported LLM context.
Reuses `createGooglePlaceLookup`; it may paginate and request rich details, so costs exceed a minimal ID-only search.
Synthetic/unlabelled cases are skipped. Top-1/top-3 use exact provider ID, preserve returned search order,
and divide hits by **all labelled eligible ground-truth places**, including extraction misses and lookup failures.
Search is performed for unambiguously matched extracted clues only. Errors are counted separately.
This is extraction-plus-resolution recall, not independently conditional retrieval accuracy.
Places calls are off by default, not cached/replayed in this first version, and never run under `--offline`.
Saved Places details are limited to aggregate hit/error counts; no reviews, addresses or photos are persisted.

## Validation and limits

Run `npm test -- tests/integration/llm-benchmark.test.ts`, `npm run typecheck`, and `npm run check`.
Tests mock every network call and cover normalization, matching, ambiguity, duplicate predictions, aliases,
metrics/empty cases, invalid schema, failure/truncation, token usage/pricing, provider request equivalence,
offline CLI replay, cache mismatches and optional Places scoring.
A small one-pass development run cannot establish a best model. Provider order rotates across cases;
repeat runs with new cache paths for variance. Human review, live access, held-out quality and actual cost
remain unmeasured until the team runs and reviews real comparisons.


## Human-labelled YouTube workflow

Use [eval:youtube](YOUTUBE.md) to collect Gemini evidence once, review ground-truth labels in the terminal, and run this benchmark. This is evaluation-only; production imports require no human_reviewed field.

### Diagnosing unknown metrics

Each run also writes `metrics-diagnostics.json` and `metrics-diagnostics.md` beside the unchanged summary.
These separate reports list each numerator/denominator, pending reviewer/ADJUDICATED/scope requirements,
unresolved predictions, entity TP/FP/FN, eligible claim counts and exclusions. `incomplete` differs from
`zero_denominator`: a nonzero denominator does not authorize a final score while scope/adjudication is pending.
`REVIEWED` in labels.json does not complete evaluation-review.json. No confirmation is inferred automatically.
Finalized truth and FN stay null until their prerequisites hold; candidate truth and currently unmatched truth
counts are separately labelled provisional. Completed, nonempty counts yield numeric scores including zero.
F1 uses equivalent count arithmetic, with zero for TP=0 when the count denominator is positive.

Historical offline replay and YouTube adjudication can use the original results report to validate an older prompt. Dataset, schema, response rows and input hashes must agree; saved reports retain the original prompt. Live resume still requires the current prompt. Keep the original results report beside its cache.
