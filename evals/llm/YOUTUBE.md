# Human-labelled YouTube evaluation

This is evaluation-only tooling. No production provider, API route, Supabase job, frontend, or production schema is changed.
Production imports do not read labels or depend on human_reviewed.

## 1. Prepare evidence

From the repository root:

```powershell
npm run eval:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --live
```

Replace the URL with a real public YouTube video. This uses the existing Gemini reader, evidence prompt,
VideoEvidenceOutputSchema and normalizer. Requires GOOGLE_AI_API_KEY; GEMINI_TRANSCRIPTION_MODEL and
GEMINI_TRANSCRIPTION_TIMEOUT_MS use the existing reader's configuration rules. It makes one Gemini request,
saves evidence, creates an unreviewed label draft, and stops. It never runs production place extraction,
Google Places, Supabase or any comparator at this stage.

Default session: evals/private/youtube/VIDEO_ID/. These files are gitignored and may contain private source material.
Use --dir evals/private/my-session on every command to select another session.
Re-running prepare reuses existing evidence without calling Gemini again. Use a new directory to collect new evidence.
An unavailable or malformed response creates no accepted evidence or labels. Comparator credentials are only needed at run time.

## 2. Human review and labels

```powershell
npm run eval:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --review
```

Run in an interactive terminal. It prints the full saved source URL and Gemini evidence JSON once (transcript, timestamps, visible text, descriptions and uncertainties), followed by the proposed labels and A/R/D/E/N/V/F/Q menu. Editing the list does not reprint the full evidence.
Watch the video and inspect Gemini evidence independently of the three comparator outputs.

For a fresh draft, review suggestions derived locally from saved speech, descriptions and visible text.
No model is called. Repeated names are merged while source quotes, timestamps and uncertainty notes
are kept in review-proposals.json beside labels.json. This file contains suggestions, never ground truth.
The menu lists name, location, evidence references and proposed/uncertain/approved status.

- A (or a, then Enter): approve all listed entries, including uncertain entries, in one command.
- R: inspect every entry and approve, edit, delete or skip it (A/E/D/S).
- D 2: delete entry 2.
- E 2: edit name/location/aliases for entry 2. Blank keeps the current field; - clears location or aliases.
- N: add a missing place manually. New entries are approved edits, still subject to final confirmation.
- V 2: inspect all supporting quotes, timestamps and uncertainties for entry 2.
- F: finish after all remaining entries are approved. An empty list requires CONFIRM EMPTY.
- Q: cancel without changing labels.json.

A proceeds toward final confirmation when no unresolved entries remain. Configured Places suggestions appear before that confirmation. You then supply a reviewer
name/pseudonym and type REVIEWED. Invalid, duplicate or over-limit labels cannot be finalized.
Example: A -> optional lookup selections -> reviewer -> REVIEWED. Use R/E/D before A if corrections are needed.
Existing manually entered labels are retained for review; suggestions do not overwrite or re-add deleted labels.

Candidate rules prioritize explicit OCR and transcript names. Named OCR such as TOKYO SKYTREE,
OMOIDE YOKOCHO, SHIBUYA PARCO and GHIBLI MUSEUM does not require a storefront description.
Other venue signs use contextual support; advertising/poster text and instruction overlays are filtered.
Country-level context and generic labels such as DAY 1, see captions for details and choose one are excluded.
Descriptions only attach supporting quotes/location context to independently named candidates. They never
seed names such as Crowded Takeshita Street, Akihabara Street or Scenic Street, or identify an unnamed scene.

Names retain source words and OCR casing, with whitespace normalization only. Repeated OCR/speech names
merge case-insensitively and keep their supporting quotes/timestamps. OCR spelling takes precedence for
matching names; no words such as Tower, Street or district qualifiers are added or removed.
Distinct explicit branches remain separate. Unknown location/branch stays null with a note; it does not
remove an otherwise explicit place. Source uncertainty remains visible; A explicitly approves the entire list including uncertain entries.

These are offline linguistic heuristics, not a complete named-entity recognizer or place verification service.
They can still miss unusual names or require human interpretation of captions; N/E/D remain available.
Candidate generation uses no external geography lookup, inferred landmark name or provider call.
Existing labels, confirmation hashes, benchmark schema, CLI formatting and review controls are unchanged.

When GOOGLE_PLACES_API_KEY is configured in apps/web/.env.local or the shell, review automatically
uses the existing Google Places adapter for retained entries with unknown location/branch. With no key,
review remains offline. No Gemini or comparator calls are made during review.
Queries contain the source name and locally co-mentioned source names/location context, never inferred cities.
Up to three distinct address-bearing results containing the source name tokens are shown with name,
address and place ID. This conservative lexical filter can omit spelling variants; it is not a confidence score.
Google ranking or a name match does not establish that the video refers to that place.
Choose a match number explicitly or leave blank to keep unknown. A never accepts a lookup result.
Failures and empty results leave the lookup location unknown without blocking source review.

After REVIEWED, approved external information is saved in lookup-review.json with reviewer, timestamp,
evidence hash and review hash. Treat it as valid only for those exact reviewed labels/evidence.
It stays separate from labels.json and is never supplied to extraction models or benchmark scoring.
Source label locations therefore remain unchanged even when an external lookup location is approved.
Cancelling or failing final confirmation saves no new lookup approvals. Suggestions are fetched fresh on
subsequent reviews; lookup costs are separate from existing benchmark metrics and are not measured here.

For editing longer lists, open the session's labels.json before running --review.
Set ground_truth to an array, then add, correct or remove entries:

```json
{
  "name": "Actual place name",
  "location_context": null,
  "aliases": [],
  "location_aliases": []
}
```

Preserve the other top-level fields. The initial ground_truth: null means not yet labelled;
ground_truth: [] means an intentionally empty list and still needs explicit confirmation.
The review command displays edited labels for confirmation. Do not manually mark human_reviewed true.
It records reviewer, reviewedAt and a hash over the evidence and labels. Changed evidence/labels require re-review;
JSON field order/formatting alone does not invalidate a review. Concurrent editor changes during review are rejected.

For this **extraction-stage** benchmark, truth should cover entities supported by the frozen Gemini evidence.
If a place is visible in the original video but omitted from Gemini evidence, note that as an upstream failure
in your research records. Including it in the truth list would instead measure combined Gemini+extractor recall.
Literal source quotes do not prove the video was correctly understood. Do not use comparator predictions as truth.

## 3. Run the three-model comparison

```powershell
npm run eval:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --provider all --run --live
```

This validates human confirmation before calling the existing benchmark. All models receive the same frozen
transcript and visual evidence. Review metadata and ground truth are never sent to comparator models.
Use --provider openai, anthropic or deepseek for a single provider.
The existing API_KEY/MODEL environment variables and evals/llm/pricing.json are reused.
Use --pricing PATH to supply another price table.

Outputs are stored in the session's runs/REVIEW_HASH/ directory:

- dataset.json: validated benchmark dataset derived from the frozen evidence and human labels.
- review.json: reviewer attestation, source/model/prompt provenance and separate Gemini evidence latency.
- cache.json: existing benchmark attempt cache.
- llm-place-extraction-results.json and summary.md: entity metrics, schema validity, cost and latency.

Run directories are separated by reviewed evidence/label hash, preserving prior labelled comparisons.
An existing comparator cache requires --resume, preventing an accidental fresh paid rerun:

```powershell
npm run eval:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --provider all --run --live --resume
```

Resume reuses recorded attempts (including failures); it does not retry failed requests automatically.
To deliberately repeat a comparison, use another session directory and review its evidence.
Changing model settings requires a separate comparison session.

## 4. Re-score without API calls

```powershell
npm run eval:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --provider all --offline
```

Uses the reviewed dataset and existing cache; no Gemini, comparator or Places request is made.
Use the same provider selection as the saved run, or complete missing providers with --run --live --resume.
Offline scoring still requires a current review matching that evidence and labels.

## Limits and validation

Human review is a local attestation, not a signed identity or proof someone watched a video.
The older eval:llm command continues to support manually prepared datasets; this new gate applies to eval:youtube.
There is no evaluation UI, no media scraping/download, no auto-generated ground truth and no production Places step here.
Shared evidence helpers are imported by eval tooling; no production module imports the review module.

Gemini latency is recorded separately in review.json. The existing reader does not expose usage/cost,
so evidenceCostUsd is null and comparison cost/latency includes extraction calls only.
One video is a development example, not a held-out study or a statistically reliable ranking.
Labels are exhaustive under the chosen evidence scope; aliases should be specified before comparisons.

Offline tests cover evidence reuse, null vs empty labels, interactive confirmation/cancellation, stale review,
field normalization, duplicate labels, concurrent edits, invalid evidence, session/argument guards,
benchmark gating and real offline report generation using a mocked response cache.
No paid verification is performed during implementation.

[Benchmark scoring and pricing definitions](README.md).

## Final metric adjudication

Ground truth covers intentionally presented/recommended travel places, not incidental map or background labels.
Proposals and A approval do not automatically establish that scope. The benchmark creates `evaluation-review.json`
in the run directory. Confirm case scope and resolve uncertain predictions there, then rerun the same `--offline`
command. Set reviewer and `ADJUDICATED` confirmation; unresolved identity cases leave P/R/F1 unknown.
Source-scope exclusions apply to all models. Lookup-review.json remains separate and is never used to fill source
truth or adjudicate inferred locations. See [methodology and editable fields](README.md#adjudication-before-final-metrics).
No raw model responses, evidence, or existing reviewed labels are rewritten by adjudication.

## Interactive adjudication

After a benchmark or offline replay has created evaluation-review.json, run:

```powershell
npm run eval:youtube -- --url "YOUTUBE_URL" --adjudicate
```

Use the same --dir if the session has a custom directory. This is offline and makes no provider calls.
The command displays saved source evidence and zero-based truth indices, allows shared scope exclusions,
requires SCOPE confirmation, and presents remaining uncertain predictions. Choose C (correct, then truth index),
I (incorrect/unsupported), or X (ambiguous/excluded), with a reason. Unresolved location claims receive separate
source-supported/unsupported/excluded choices. Enter a reviewer and ADJUDICATED to save only after unresolved
cases reach zero. Q cancels without saving. Concurrent changes to dataset/cache/review abort the save.
The exact URL/directory offline replay command is printed after saving; run it to update the reports.
