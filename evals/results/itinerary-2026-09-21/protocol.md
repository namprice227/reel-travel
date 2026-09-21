# Frozen experiment protocol — 21 September 2026

Written before measured comparison runs. Workload: Reel Travel itinerary generation only, not extraction,
transcription, a general chatbot benchmark, or independent multi-agent frameworks.

- Compare OpenAI `gpt-4.1-mini-2025-04-14`, Google `gemini-3.6-flash`, and local Ollama `qwen3:8b`.
- Use the unchanged itinerary-v3 system prompt, identical fixture inputs and JSON schema, identical compiler,
  and at most two attempts: initial generation plus one compiler-feedback repair.
- Fix temperature at 0.2, output cap at 8,000 tokens/call, request deadline at 25 seconds and total deadline
  at 40 seconds. Gemini thinking=minimal; Ollama think=false with 16,384 context; provider-default top-p/top-k.
- Twelve fresh synthetic cases: eleven feasible and one impossible fixed-booking case. Three repetitions each
  per LLM: 108 generation runs. The old deterministic greedy planner runs once per case (12 runs).
- Freeze fixture inputs and source hashes in manifest before calls. Feasible scheduling witnesses have passed
  the common compiler. Witnesses and scoring labels are never passed to models. No prompt tuning on these cases.
- Use separate existing development cases for adapter smoke tests. Save preflight failures separately.
- Execute sequentially and rotate provider order across case and repetition. Warm Ollama before measurement;
  retain warmup time separately. No provider-specific HTTP retries; all measured failures stay in results.
- Primary metric: final compiler acceptance on the 33 feasible runs/provider. Also report first-pass acceptance,
  strict request-schema validity over all attempted calls, repair success, provider errors and latency p50/p95.
- Assess target-place coverage and meal/suggestion/seasonal presence as objective proxies. A useful run must be
  accepted, include all scenario target places, include lunch (start 11:00–14:00) on every labeled meal day,
  include a suggestion when required, and contain nonempty seasonal advice. This is not a human quality score.
- Closed must-visits are intentionally excluded from achievable target coverage. Booked places count via their
  reservation. Targets need not equal all optional places; report input and target definitions.
- The impossible scenario is scored separately. Correct rejection must include an overlap/unreachable-booking
  validation issue; a timeout or HTTP failure is not successful constraint reasoning.
- Estimate API cost from observed usage, including repairs and reported cache hits, using date-stamped published
  paid-tier prices. Unknown usage stays unknown. Local API token fee is zero, but hardware/electricity/time are
  not measured and total local cost is not zero. Do not interpret estimated cost as an invoice.
- Report results honestly even if the existing choice loses. Prioritize reliable, useful accepted itineraries;
  then assess latency, cost, privacy and deployability. No weighted composite ranking or superiority claim
  across all tasks. Repeats of twelve synthetic cases are not 108 independent user trips.
- Preserve raw proposals, validation errors, usage, settings, model identity and hardware. Supply a human review
  rubric; do not invent human scores. Climate accuracy, real routing, venue existence, and regional relevance
  require separate verification. This experiment is not independently reviewed held-out user research.

Preflight decisions: Gemini 2.5 Flash was listed but returned HTTP 404 (unavailable to new users). The API
recommended Gemini 3.6 Flash; its first two smoke calls returned HTTP 503, while a subsequent call produced a
valid JSON response. These are setup observations, not part of the frozen measured sample. Qwen3 8B completed
one smoke case within 25 seconds and timed out on another; retain the same app deadline for the primary comparison.
