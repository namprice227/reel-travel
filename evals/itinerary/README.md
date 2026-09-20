# Itinerary provider benchmark harness

The six fixtures in [cases.ts](cases.ts) are synthetic prompt-development examples: normal, booking,
unknown hours/travel, tight time/budget/interest, closed venue and injected instructions. They are not
held-out data and do not establish which provider is best.

Run from the repository root with Node 24:

```powershell
# Offline, no network or credentials; original greedy planner as a comparator.
npm run benchmark:itinerary -- --provider baseline --runs 1

# Explicit paid/network call permission; uses the web app's private env file.
node --env-file=apps/web/.env.local --import tsx scripts/benchmark-itinerary.ts --provider openai --live --runs 3

# After implementing an adapter; default export must implement ItineraryProvider.
node --env-file=apps/web/.env.local --import tsx scripts/benchmark-itinerary.ts --adapter ./evals/private/my-ollama.ts --live --runs 3
```

Optional `--case normal` selects one case; `--out .local/run.json` selects the output. Defaults save under
ignored `.local`. The runner does not read live trips, search places, modify Supabase or transcribe videos.
External adapter modules execute local code and should be your own trusted implementation.

Each attempt records provider, actual model, prompt version, input/prompt/schema SHA-256 hash, latency,
input/output tokens, schema validity, acceptance, rejection reasons, confirmed-place coverage, must-visit
coverage, known travel minutes, unknown legs and the proposal. Every adapter uses the same compiler.
Failures remain in results. An empty proposal has zero coverage; unknown travel has null total travel,
not zero. Missing usage, dollar cost and human ratings stay null. Baseline uses zero tokens and its existing
greedy output is assessed under the same constraints, including required breaks; it can fail those checks.

For the formal comparison:

1. Freeze a separate held-out dataset and commit, with user preferences and independently reviewed feasible
   outcomes. Include multiple dates, distant locations, conflicting bookings and constrained opening hours.
2. Pin model versions and record backend/API versions and adapter settings, especially for Ollama quantization
   and hardware. Use identical prompt/input hashes and one-attempt budgets. Do not tune on the held-out set.
3. Repeat each case the same number of times. Compare acceptance/schema rates over **all attempts**, not just
   successes. Report coverage alongside validity to penalize dropping everything. Treat unknowns separately.
4. Compare latency distributions and measured token usage; calculate prices using date-stamped provider
   rates or local hardware costs. Do not compare token counts as if tokenizers/costs were identical.
5. Blind human reviewers to provider identity and score preference fit, realistic breaks, day balance,
   unnecessary travel, explanations/omissions and overall usefulness. Randomize provider order between runs
   when collecting latency. The harness does not automatically perform this human evaluation.

Output includes the HEAD commit; if testing uncommitted code, also record its working-tree state in evidence.
No Gemini/Ollama results or cost/quality superiority claims exist yet.
