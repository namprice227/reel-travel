# LLM and provider comparison for Reel Travel itinerary generation

Experiment date: 21 September 2026, Singapore time. Authoring and execution: Codex with the user's authorization.
Independent human review: pending. This report evaluates the itinerary planning stage; it does not establish
which model is best for place extraction, transcription, image understanding or general agent tasks.

## Product needs and scope

Reel Travel turns a destination, travel dates, daily availability, preferences, confirmed places and fixed
bookings into an editable itinerary. A useful answer needs realistic visit durations, meal opportunities,
coherent areas and suggestions when the saved list is sparse. The application must retain booking times,
respect known hours, avoid duplicate place IDs and preserve uncertainty about unverified suggestions.

The model proposes JSON. The same deterministic compiler hydrates authoritative place facts and validates
all providers. A rejected proposal gets at most one model repair using concrete compiler feedback. Failed
runs do not overwrite the saved trip. In this report an “agent” means this complete propose–validate–repair
workflow with a particular model backend. Ollama is an inference runtime/provider, **not** an LLM; its tested
LLM is Qwen3 8B. No claims are made about external travel agents or independent multi-agent frameworks.

## Candidates and why they were selected

| Candidate | Provider/runtime | Reason to test | Practical tradeoff |
| --- | --- | --- | --- |
| `gpt-4.1-mini-2025-04-14` | OpenAI Responses API | Existing production model; dated snapshot; instruction following, structured JSON and low-latency non-reasoning generation | External API dependency; per-token cost |
| `gemini-3.6-flash` | Google Gemini API, `v1beta generateContent` | Stable Flash alternative with structured output and adjustable thinking; available to this account | Provider capacity and API compatibility must be measured; alias is less reproducible than a dated snapshot |
| `qwen3:8b`, Q4_K_M | Local Ollama | Open-weight alternative that fits the available 16 GiB Mac; local inference and no API token charge | Smaller quantized model, laptop throughput and local service operation |
| `greedy-v2` | Existing deterministic planner | Establish what the application gets without an LLM | Does not provide the richer meal, suggestion and seasonal behavior |

OpenAI documents GPT-4.1 mini as supporting structured outputs and fast generation without a reasoning step;
this is why it is a plausible incumbent, not proof it wins this workload.
[OpenAI model specification](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Google documents 3.6 Flash as stable with structured output support.
[Gemini model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash).
Ollama's Qwen3 8B artifact is approximately 5.2 GB and uses Q4_K_M quantization, leaving memory for context and
other local applications on this machine. This is a deployment judgment, not a claim that 8B matches cloud
models in capability. [Qwen3 artifact](https://ollama.com/library/qwen3:8b).

Gemini 2.5 Flash was initially considered as a mature low-latency alternative. Although the model-list endpoint
listed it, generation returned HTTP 404: unavailable to new users, with a recommendation to use 3.6 Flash.
Two 3.6 Flash development smoke calls then returned HTTP 503; a subsequent direct development call returned
JSON successfully. These preflight observations are preserved separately. No final sample is selected based
on favorable outputs. Newer/larger models are not comprehensively evaluated; the candidates reflect this
project's incumbent, an accessible competing cloud model and a model that fits the available local hardware.

## Experimental method

The [protocol](../../evals/results/itinerary-2026-09-21/protocol.md) was written before measured runs. Twelve
fresh synthetic scenarios were authored after the existing v3 prompt was implemented. They were not used to
tune the prompt. They are a frozen evaluation set, **not independently authored, representative user research
or a rigorously independent held-out dataset**. All venue identities, hours and bookings are fictional.

| Case | What it tests | Expected system behavior |
| --- | --- | --- |
| full-day | Nearby saved places, art priority, lunch | Retain all three targets with a workable day |
| three-day-clusters | East/west clusters, three winter days | Retain four targets once; fill sparse time coherently |
| destination-only | No saved places, two winter days | Meals and unverified nearby activity ideas |
| sparse-five-days | Two saved places across five days | Preserve both identities without repeating them |
| booked-place | Restaurant already represented by a booking | Keep the booking once; no duplicate place visit |
| closed-priority | A must-visit is known closed | Omit the closed visit, retain the achievable target |
| unknown-facts | Unknown hours and accommodation coordinates | Keep uncertainty; do not invent verified facts |
| short-window | Two-hour afternoon and competing optional visit | Fit the art priority within the window |
| distant-day-trip | Four-hour outing and long known transfer | Allow the supplied outbound travel time |
| injected-title | Hostile instructions in a place title | Treat title as data; keep the fixed booking |
| summer-pace | Relaxed garden/art trip in August | Practical seasonal advice and meal opportunity |
| impossible-bookings | Two overlapping fixed bookings | Reject; do not move or delete a booking |

Every feasible scenario has a hand-authored schedule witness checked by the compiler. Witnesses prove
feasibility under the application's rules; they are not optimal answers and are never sent to a model.
The impossible scenario is scored separately, since accepting it would be a failure.

Each LLM receives the identical system prompt, structured trip data and JSON Schema. Provider-native response
formats wrap those same contents. No provider receives web search, live weather, Google Maps grounding or
extra tools. Every model receives the same repair opportunity and validation policy. Provider order rotates
across cases and repetitions; calls execute sequentially. Three runs per model/case yield 36 generation runs
per LLM, including 33 feasible and three impossible runs. The deterministic comparator runs once per case.

The experiment saves failed runs as well as successes. It records per-call proposals, compiler issues,
latency, usage and safe transport metadata, plus input/schema/prompt hashes and a source snapshot. Model
warmup is outside the measured local sample. This evaluates a warm running Ollama service, not cold launch.

## Parameters and rationale

| Parameter | OpenAI | Gemini | Ollama/Qwen3 | Reason |
| --- | --- | --- | --- | --- |
| Temperature | 0.2 | 0.2 | 0.2 | A controlled low-variation comparison for structured scheduling; not a demonstrated optimum |
| Top-p / top-k | Provider defaults | Provider defaults | Model defaults | Avoid an additional tuning search; equal temperature does not make samplers identical |
| Output cap | 8,000 tokens | 8,000 tokens | `num_predict=8000` | Shared production cap; room for multi-day plans, with timeout still bounding latency |
| Reasoning | No reasoning step | `thinkingLevel=minimal` | `think=false` | Compare configurations intended for interactive responses; minimal thinking may still consume tokens |
| Context | Model-managed | Model-managed | `num_ctx=16384` | Local context sized for these inputs plus output and repair, while limiting KV memory |
| Attempts | At most 2 | At most 2 | At most 2 | One initial call plus one compiler-guided repair; no best-of-N selection |
| Deadline | 25 s/call, 40 s/run | Same | Same | Actual application's interactive budget |
| Output format | Strict JSON Schema | `responseJsonSchema` | Schema in `format` | Constrain syntax; compiler still checks semantic consistency |
| Seed | Unset | Unset | Unset | Repetitions measure observed variability; bit-for-bit determinism is not claimed |

OpenAI requests use `store:false`. Ollama uses `stream:false`, `keep_alive="30m"`, flash attention and
q8_0 KV cache; these are separate from Q4_K_M weight quantization. Gemini requests one candidate and includes
any reported thought tokens in output usage. No provider gets automatic HTTP retries in the measured path.
Only compiler rejection can trigger repair; transport failures and incomplete output remain failed runs.
[Gemini thinking controls](https://ai.google.dev/gemini-api/docs/thinking),
[Ollama chat controls](https://docs.ollama.com/api/chat),
[Ollama structured output](https://docs.ollama.com/capabilities/structured-outputs).

The app's existing OpenAI adapter previously omitted temperature, using the provider default. The benchmark
passes 0.2 explicitly; it does not silently change the production default. This experiment therefore compares
specified configurations, and is not an exact estimate of the production default's quality. A single sampling
setting cannot establish the best configuration for every model; a separate parameter study is needed before
claiming 0.2 is better than 1.0 or that more Gemini/Qwen reasoning would not help.

## Metrics and interpretation

1. **First-pass acceptance:** feasible runs whose first proposal passes the actual compiler.
2. **Final acceptance:** feasible runs accepted after up to one repair, divided by all 33 feasible runs,
   including timeouts, malformed responses and HTTP errors.
3. **Request-schema validity:** attempts satisfying the exact per-request JSON Schema, divided by all calls.
   The older application proposal schema is also reported; it is more permissive in some optional fields.
4. **Useful-plan proxy:** an accepted plan that covers every scenario target, includes a lunch starting
   11:00–14:00 on each labeled meal day, includes suggestions where required, and has seasonal guidance.
   Text presence does not establish good geography, climate accuracy, realistic durations or user satisfaction.
5. **Repair effect:** first-pass versus final acceptance on the same run; not a separate randomized trial.
6. **Correct constraint rejection:** impossible runs rejected for overlapping/unreachable bookings. An HTTP
   error or timeout is not counted as correct reasoning, even though the app safely delivers no plan.
7. **Latency:** wall-clock generation latency including validation and any repair; p50 and nearest-rank p95
   over successes and failures. Successful-only latency is available separately to expose selection effects.
8. **Cost:** date-stamped standard paid-tier estimate using measured input, output, thought and cached tokens.
   Unknown usage remains unknown, not zero. The estimate is not the account's invoice or free-tier charge.

Raw target coverage, unscheduled IDs, unknown travel, validation status and suggestions remain in the data.
The useful proxy prevents an empty but valid itinerary from winning on acceptance alone. Closed places are
excluded from achievable targets, and a place linked to a booking counts through its reservation.

## Execution interruption and infrastructure limitations

The original process persisted 79 of 108 planned runs before the session was interrupted. The runner was
extended to resume only missing provider/case/repetition keys, checking fixture, settings and evaluation-source
hashes before continuing. The original manifest and source snapshot were retained; resumed environment metadata
and warmup have separate files. No completed unsuccessful trial was replaced by a more favorable retry.

On resume the Ollama GPU backend failed to create a Metal command queue and allocate even a 16 KiB buffer.
This occurred after the execution environment changed to a restricted session. The error text reports allocation
failure, but it does **not** prove that an 8B model cannot fit this Mac; earlier inference succeeded on the same
hardware. Resumed local HTTP 500s are infrastructure failures and are separately identifiable by timestamp and
transport trace. Do not use their short latency as evidence of fast local generation.

Gemini produced no usable main-sample response. Its traces include HTTP 400 (generic invalid argument), HTTP
503, timeout, and HTTP 429 with a free-tier request limit of 20. The exact source of each generic HTTP 400 was
not resolved. A successful development response establishes basic adapter viability, but not full schema
compatibility across the evaluation set. Gemini's main result therefore measures this account/API/configuration's
delivery failure, **not Gemini's inherent scheduling ability**. Enabling suitable quota and resolving request
compatibility are required before a defensible three-model quality comparison can be claimed.

## Measured results

All 108 planned model runs and 12 deterministic baseline runs completed. The table reports **delivery under the tested configuration**, not an intrinsic model intelligence ranking.

| System | First-pass feasible | Final feasible | Useful proxy | Median / p95 run latency | Correct impossible rejection |
| --- | --- | --- | --- | --- | --- |
| openai | 21/33 | 28/33 | 22/33 | 5.357 / 12.333 s | 3/3 |
| gemini | 0/33 | 0/33 | 0/33 | 0.598 / 25.012 s | 0/3 |
| ollama | 2/33 | 2/33 | 2/33 | 25.004 / 25.017 s | 0/3 |
| baseline | 11/11 | 11/11 | 0/11 | 0.001 / 0.002 s | 1/1 |

Gemini median latency is predominantly a fast error response, not a generated itinerary. Ollama includes resumed GPU initialization errors. The baseline is measured once per case, while LLM cases repeat three times.

| Model | Transport outcomes by call |
| --- | --- |
| openai | 200: 51 |
| gemini | AbortError: 8, 400: 4, 503: 4, 429: 20 |
| ollama | AbortError: 24, 200: 3, 500: 10 |

| Scenario | OpenAI final / 3 | Gemini final / 3 | Ollama final / 3 |
| --- | --- | --- | --- |
| full-day | 3 | 0 | 0 |
| three-day-clusters | 3 | 0 | 0 |
| destination-only | 3 | 0 | 0 |
| sparse-five-days | 3 | 0 | 0 |
| booked-place | 3 | 0 | 0 |
| closed-priority | 1 | 0 | 0 |
| unknown-facts | 3 | 0 | 0 |
| short-window | 1 | 0 | 2 |
| distant-day-trip | 2 | 0 | 0 |
| injected-title | 3 | 0 | 0 |
| summer-pace | 3 | 0 | 0 |
| impossible-bookings | 0 | 0 | 0 |

The impossible-bookings row should be zero accepted. OpenAI returned proposals whose constraint violations the compiler caught in all three runs; the baseline was also correctly rejected. Neither alternative produced a usable response for that case, so safe failure is not credited as successful constraint reasoning.

### Repair and quality observations

OpenAI first-pass acceptance was 21/33 (63.6%); one repair increased it to 28/33 (84.8%), a gain of seven
successful deliveries or 21.2 percentage points. It used 51 total calls across 36 runs, including impossible
cases. All 51 responses satisfied the strict request schema, demonstrating that correct JSON alone does not
ensure valid scheduling. The three-day cluster case required repair in all three repetitions and then passed.
Closed-priority and short-window each passed only 1/3, and distant-day-trip passed 2/3. These are measured
weaknesses, not resolved by this experiment.

Only 22/33 OpenAI feasible runs met the useful-plan proxy. All 28 accepted plans included seasonal text, but
some omitted a midday meal or an achievable target. Mean target coverage among accepted target-bearing plans
was 98.7%; counting failed delivery as zero gives 82.2%. The discrepancy shows why accepted-only reporting
would overstate user experience. Climate truthfulness and suggestion geography are not established by these
numbers. The planner does not fully validate return-to-hotel travel or routes involving unverified activities.

Qwen3's two successful main outputs were both short-window cases. They passed the usefulness proxy because
those afternoon cases do not require lunch. Most local attempts exceeded the production deadline; after the
interruption, GPU initialization failures further reduced delivery. This indicates that the tested local setup
is not an adequate drop-in replacement under the app's current deadline, but does not establish Qwen3's quality
with a longer budget, a shorter output, a smaller model, or different hardware.

The greedy baseline achieved 11/11 feasible acceptance and full target coverage, much faster than the LLMs.
It scored 0/11 on the richer proxy because it does not generate seasonal advice and sparse-trip activity ideas.
That does not mean its schedules are worthless: it remains a strong comparator for core constraint scheduling.
A hybrid of deterministic scheduling with model-generated activity suggestions is a plausible next experiment,
but was not implemented or measured here.

### Cost

OpenAI reported 91,174 input and 18,578 output tokens over 51 calls. Using reported cache counts and standard
rates of $0.40/M input, $0.10/M cached input and $1.60/M output, the complete 36-run main sample is estimated at
**$0.06619**: **$0.00184 per requested run**, or **$0.00236 per accepted feasible itinerary** when allocating all
sample cost, including failures and impossible cases, to the 28 delivered feasible plans. Setup probes are
excluded. These are estimates, not billed charges. [OpenAI pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Gemini 3.6 Flash's published standard introductory rates on the experiment date are $0.75/M input,
$0.075/M cached input and $3.75/M output through 31 December 2026. However, no main-run usage was returned,
so measured Gemini cost and cost per successful itinerary are **unknown**, not zero. Its free-tier quota
prevents a like-for-like paid-service availability comparison. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

Local Qwen3 has no provider token fee. Three completed responses reported 4,364 input and 1,041 output tokens;
most attempts lack usage because they failed or timed out. Electricity, machine purchase/amortization, local
operator time and capacity cost were not measured. Local total cost must not be presented as zero, nor are
cross-provider token counts directly comparable because tokenizers differ.

## Decision and assignment-ready justification

**Retain OpenAI GPT-4.1 mini provisionally for the interactive itinerary feature.** It best fulfills the needs
of the configurations actually exercised here: it delivered 28/33 feasible plans within a median 5.36 seconds
across all runs, supported strict structured output, and incurred a small measured token-cost estimate. The
same application validator and bounded repair remain essential: raw first-pass success was only 63.6%.
Its dated snapshot also makes future regressions easier to trace.

Compared with Gemini 3.6 Flash, OpenAI was operationally usable in this experiment, while the tested Gemini
account/configuration returned only errors. That supports retaining the existing integration today; it does
**not** justify claiming OpenAI writes better itineraries than Gemini. A paid or sufficiently provisioned Gemini
run with validated per-case schema compatibility is required to settle that quality question.

Compared with local Qwen3 8B, OpenAI met the application's interactive constraints far more often. Qwen3 offers
local data processing and no token bill, but the observed throughput and later GPU failures made this setup
unsuitable for the same deadline. If offline processing or privacy becomes the dominant requirement, a local
model with asynchronous generation and a longer budget may be preferable; this experiment does not test that
product design.

The experiment used temperature 0.2 to favor consistent structured schedules, an 8,000-token output ceiling
to accommodate multi-day JSON, and a maximum of one repair to improve validity without unbounded latency or
cost. Gemini used minimal thinking and Qwen3 disabled thinking to target the same interactive use case.
These parameter choices are reasoned starting configurations, **not optimized settings proven by an ablation**.
The production OpenAI default temperature remains unchanged; the report must not claim that 0.2 is already
validated as superior to that default.

## Reproduction and remaining work

From the repository root, use Node 24, install dependencies with `npm ci`, and provide `OPENAI_API_KEY` and
`GOOGLE_AI_API_KEY` in the gitignored `apps/web/.env.local`. The runner reads no customer trips and writes no
Supabase itinerary. Start Ollama locally, pull `qwen3:8b`, and ensure enough account quota for all calls.

```bash
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
# In a second terminal:
ollama pull qwen3:8b
node --env-file=apps/web/.env.local --import tsx scripts/compare-itinerary.ts --live --runs 3 --out .local/new-comparison
node --import tsx scripts/summarize-itinerary-comparison.ts .local/new-comparison
```

The [artifact directory](../../evals/results/itinerary-2026-09-21/README.md) contains the protocol, source
snapshot, hardware/model metadata, raw proposals, per-call errors, summary and CSV. The manifest records Apple
M5, 16 GiB RAM, Ollama version and the exact model digest. Re-pulling a mutable tag is not guaranteed to reproduce
that digest; compare it with the manifest. Cloud backend changes, caching, network load, temperature sampling
and the interrupted execution also prevent exact replay of latency and outputs.

This sample has only 12 synthetic scenarios, repeated three times. Repetitions are correlated, the author knew
the prompt, and no blinded human ratings exist. Do not treat 108 calls as 108 independent user trips or claim
statistical superiority. [Human review rubric](../../evals/itinerary/HUMAN_REVIEW.md).

To complete a stronger academic comparison: resolve Gemini quota and request compatibility, restore a stable
local GPU environment, rerun the same frozen set as a separately labeled experiment, and collect independent
blinded ratings. Add a separate equal-budget parameter study before tuning temperature or reasoning. Retain
this run as operational evidence instead of overwriting its failures. Extraction/transcription comparisons
remain outside this itinerary-specific experiment.

Validation of the implementation: 455 tests across 36 files passed; all workspace typechecks, API-document
consistency and planning/link validation passed. No production model switch, deployment, commit or database
mutation was performed as part of this benchmark.
