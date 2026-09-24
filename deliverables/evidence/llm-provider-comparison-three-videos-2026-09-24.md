# LLM provider comparison: place-clue extraction across three YouTube videos

Prepared: 24 September 2026. Task context: BE05 / DEC-08.

## Executive assessment

DeepSeek has the strongest observed speed/coverage trade-off in this three-video sample: it finds 20 of 21 eligible entities and is fastest on every video. Claude has the highest pooled precision and narrowly leads pooled F1. DeepSeek has the lowest pooled unsupported-claim rate. OpenAI has the lowest recorded extraction cost, but lower F1 and higher unsupported-claim rates than the other two models in aggregate.

These are preliminary development-set findings, not evidence of a universally best model. All nine responses passed the output schema, but substantial semantic errors remained. User confirmation, source evidence and independent place verification remain necessary.

## Scope and provenance

This report consolidates existing saved results; no new model requests or video processing were performed. The user-supplied tables were matched to local summary files. Aggregates below use the full-precision JSON reports, so rounding can differ slightly from sums of the displayed six-decimal costs.

The evaluated stage is **saved Gemini transcript and textual visual observations -> LLM place clues**. It does not measure direct video understanding by the three comparator models, upstream transcription accuracy, Google Places retrieval, itinerary quality or end-to-end application latency.

Each provider has one recorded attempt per video: three observations per provider, nine total. The datasets are explicitly marked `development`, with zero synthetic cases. The generic summary warning about synthetic samples does not mean these three videos are synthetic. Independent held-out status is not established.

| Video | YouTube ID | Original truth entities | Excluded truth entities | Eligible truth entities |
| --- | --- | --- | --- | --- |
| 1 | ODrvB8WfkPc | 7 | 1 | 6 |
| 2 | KWpVP59gDjw | 9 | 0 | 9 |
| 3 | 18SjW74vkWE | 8 | 2 | 6 |

There are 24 originally labelled entities and 21 eligible entities after three case-level exclusions. The same case exclusions apply to every provider. No prediction-level exclusions or unresolved entity/location cases are recorded. Saved audits are finalized; this documents the existing adjudication state, not a new independent human review. Branch-resolution denominators are zero for every run, so branch accuracy is unknown.

## Compared models and configuration

| Provider | Requested model ID | Temperature | Reasoning | Output mode |
| --- | --- | --- | --- | --- |
| OpenAI | gpt-5.6-luna | Omitted | none | JSON schema |
| Anthropic | claude-haiku-4-5 | 0 | Not configured | JSON schema |
| DeepSeek | deepseek-flash | 0 | disabled | JSON object |

Model identifiers are reproduced as recorded in the run artifacts. This report does not independently verify current model availability or provider pricing.

All recorded configurations use a 1,500-output-token limit and 60-second timeout. The benchmark protocol specifies no automatic retries. The saved prompt text matches across the three reports; providers receive equivalent semantic instructions and evidence with a shared output contract. Provider-specific request formats and tokenizers differ. The same local schema validator checks all responses. Fields are `name`, nullable `location_context`, literal source `evidence` and `confidence`; confidence is not evaluated as a calibrated probability.

## Metric definitions and aggregation

- **Precision:** TP / (TP + FP), measuring how many accepted entity predictions match the eligible reference entities.
- **Recall:** TP / (TP + FN), measuring coverage of eligible reference entities.
- **F1:** 2 TP / (2 TP + FP + FN), balancing entity precision and recall.
- **Hallucination rate / unsupported-claim rate:** predictions with an unsupported entity or location divided by eligible normalized prediction claims. Each offending claim counts once. This denominator precedes alias-to-entity deduplication and can differ from the entity precision denominator.
- **Schema validity:** proportion of attempts whose output passes validation; this is format compliance, not factual accuracy.
- **Review:** unresolved cases flagged by the scorer, not the number of people who reviewed the dataset. Zero does not establish independent annotation quality.
- **Latency:** recorded provider-call time, retaining original network time during offline replay. It excludes the rest of the application pipeline.
- **Cost:** the saved token-based USD estimate for comparator extraction only. It excludes upstream Gemini processing, Google Places and application infrastructure.

A correct place name paired with an unsupported location can earn entity credit and still count toward hallucination. Consequently, hallucination rate is not generally `1 - precision`, nor does it mean the same fraction of place names are fictional. Literal source quotations establish provenance but do not alone prove that a claimed relationship is supported.

**Micro results** pool entity counts across videos. **Macro results** average each video's score equally. Macro F1 is the mean of per-video F1 values, not F1 calculated from macro precision and recall. Overall p50 is the median of the three original latencies, not the average of the per-video p50 values.

## Aggregate entity and claim results

| Model | TP | FP | FN | Micro precision | Micro recall | Micro F1 | Unsupported claims | Pooled hallucination rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 19 | 20 | 2 | 48.72% | 90.48% | 63.33% | 27/40 | 67.50% |
| anthropic/claude-haiku-4-5 | 19 | 15 | 2 | 55.88% | 90.48% | 69.09% | 18/34 | 52.94% |
| deepseek/deepseek-flash | 20 | 17 | 1 | 54.05% | 95.24% | 68.97% | 20/38 | 52.63% |

| Model | Macro precision | Macro recall | Macro F1 | Macro hallucination rate |
| --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 48.74% | 90.74% | 63.38% | 67.36% |
| anthropic/claude-haiku-4-5 | 55.66% | 90.74% | 68.85% | 52.80% |
| deepseek/deepseek-flash | 53.89% | 94.44% | 68.52% | 52.37% |

Claude leads micro precision and narrowly leads micro F1: 69.09% versus 68.97% for DeepSeek, a difference of approximately 0.13 percentage points before rounding. DeepSeek leads micro recall and has the lowest pooled unsupported-claim rate: 52.63% versus 52.94% for Claude. Claude also narrowly leads macro F1: approximately 68.85% versus 68.52% for DeepSeek, a difference of 0.33 percentage points. Both weighting methods place their F1 scores very close together; these small differences should not be treated as statistically established.

## Aggregate latency, tokens and cost

| Model | Mean latency (s) | Median latency (s) | Min-max latency (s) | Input tokens | Output tokens | Total estimated USD | Mean USD/video |
| --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 5.820 | 5.385 | 4.935-7.141 | 6491 | 1601 | 0.003219400 | 0.001073133 |
| anthropic/claude-haiku-4-5 | 4.569 | 4.694 | 3.743-5.272 | 8563 | 1601 | 0.016568000 | 0.005522667 |
| deepseek/deepseek-flash | 1.815 | 1.903 | 1.564-1.978 | 6613 | 1520 | 0.003393948 | 0.001131316 |

DeepSeek's mean latency is 3.21 times faster than OpenAI and 2.52 times faster than Claude in this sample. Its recorded total cost is 5.42% above OpenAI and 79.52% below Claude. All three providers achieved 3/3 schema-valid responses, with zero provider errors and zero pending review flags.

The pricing snapshots are dated 22 September 2026 in all three reports. Rates are historical run inputs, not newly verified quotes. Observed total costs incorporate recorded usage, including any applicable cache treatment. Different token totals do not by themselves indicate unequal semantic evidence because request formatting and tokenization vary.

## Per-video results

### Video 1: `ODrvB8WfkPc`

| Model | Precision | Recall | F1 | Hallucination rate | TP/FP/FN | Schema valid | Avg ms | p50 ms | Input tokens | Output tokens | Estimated USD | Review | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 0.545455 | 1.000000 | 0.705882 | 0.750000 | 6/5/0 | 1 | 7140.5801 | 7140.5801 | 2097 | 438 | 0.000945 | 0 | 0 |
| anthropic/claude-haiku-4-5 | 0.600000 | 1.000000 | 0.750000 | 0.500000 | 6/4/0 | 1 | 4693.6323 | 4693.6323 | 2792 | 447 | 0.005027 | 0 | 0 |
| deepseek/deepseek-flash | 0.600000 | 1.000000 | 0.750000 | 0.454545 | 6/4/0 | 1 | 1564.3428 | 1564.3428 | 2170 | 435 | 0.000985 | 0 | 0 |

All providers recover all six eligible entities. Claude and DeepSeek tie on F1 at 0.75, while OpenAI produces one more entity false positive. DeepSeek has the lowest unsupported-claim rate and shortest latency; OpenAI has the lowest recorded cost.

### Video 2: `KWpVP59gDjw`

| Model | Precision | Recall | F1 | Hallucination rate | TP/FP/FN | Schema valid | Avg ms | p50 ms | Input tokens | Output tokens | Estimated USD | Review | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 0.500000 | 0.888889 | 0.640000 | 0.687500 | 8/8/1 | 1 | 4935.2778 | 4935.2778 | 2782 | 612 | 0.001291 | 0 | 0 |
| anthropic/claude-haiku-4-5 | 0.615385 | 0.888889 | 0.727273 | 0.538462 | 8/5/1 | 1 | 5272.0129 | 5272.0129 | 3610 | 548 | 0.006350 | 0 | 0 |
| deepseek/deepseek-flash | 0.600000 | 1.000000 | 0.750000 | 0.533333 | 9/6/0 | 1 | 1902.6184 | 1902.6184 | 2818 | 537 | 0.001302 | 0 | 0 |

DeepSeek is the only model to recover all nine eligible entities. Claude has better precision, with five false positives versus six for DeepSeek and eight for OpenAI. DeepSeek achieves the highest F1 and shortest latency. OpenAI is marginally cheaper, while Claude is slower than OpenAI on this video.

### Video 3: `18SjW74vkWE`

| Model | Precision | Recall | F1 | Hallucination rate | TP/FP/FN | Schema valid | Avg ms | p50 ms | Input tokens | Output tokens | Estimated USD | Review | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-5.6-luna | 0.416667 | 0.833333 | 0.555556 | 0.583333 | 5/7/1 | 1 | 5384.7257 | 5384.7257 | 1612 | 551 | 0.000984 | 0 | 0 |
| anthropic/claude-haiku-4-5 | 0.454545 | 0.833333 | 0.588235 | 0.545455 | 5/6/1 | 1 | 3742.7642 | 3742.7642 | 2161 | 606 | 0.005191 | 0 | 0 |
| deepseek/deepseek-flash | 0.416667 | 0.833333 | 0.555556 | 0.583333 | 5/7/1 | 1 | 1977.8080 | 1977.8080 | 1625 | 548 | 0.001107 | 0 | 0 |

All providers recover five of six eligible entities. Claude produces six false positives versus seven for both alternatives, giving it the highest F1 and lowest unsupported-claim rate. DeepSeek remains fastest. This video has the lowest F1 for every provider among the three inputs; the aggregate metrics alone do not establish why.

Each per-video average equals p50 because only one attempt per provider is present for that video. This is not evidence of stable latency across repeated requests.

## Implications for Reel Travel

**Candidate for the next evaluation: DeepSeek.** Its observed latency and recall make it a reasonable candidate for an interactive extraction flow where users review candidate places. It misses one eligible entity overall, compared with two for the other providers. This is a recommendation for further validation, not a production switch or a general model ranking.

**Precision-focused alternative: Claude.** It generates fewer entity false positives overall and narrowly leads both micro and macro F1. Its pooled unsupported-claim rate is slightly higher than DeepSeek's. That could reduce correction work, but actual user effort was not measured. Its higher recorded cost and slower mean response should be weighed against this quality difference.

**Lowest observed cost: OpenAI.** It is cheapest on all three inputs, although the absolute sample-level cost difference from DeepSeek is small. In these runs that saving comes with lower aggregate F1 and a higher unsupported-claim rate.

Every provider still produces many false positives. Schema validation alone would accept those outputs. Preserve source evidence, nullable unknowns, provider-backed place matches and user confirmation. Do not present LLM location claims as verified addresses or branch identities.

## Limitations and next measurements

1. **Three development videos are a small convenience sample.** Results do not establish generalization to unseen cities, languages, content styles or media types. Dataset splitting must occur before further tuning.
2. **One attempt per model/video does not measure variance.** Repeat requests with separate caches to measure quality variability, latency spread and failure rates. No confidence interval or significance claim is made here.
3. **Upstream evidence may be incomplete or incorrect.** These models extract from saved Gemini-generated evidence. This comparison cannot isolate omissions introduced before extraction or measure accuracy against the full original videos.
4. **Adjudication is recorded, not independently reproduced here.** Existing scope exclusions and finalized decisions determine the scores. Validate label completeness, accepted aliases, incidental entities and location support with an independent reviewer before final model selection.
5. **Branch resolution is unmeasured.** All branch denominators are zero; Places was disabled. City/area accuracy, prompt-injection resistance and ambiguity handling are not separately established by these aggregate tables.
6. **A high unsupported-claim rate needs error-level analysis.** Review entity mistakes and unsupported location relationships separately. Do not infer specific error causes from summary metrics alone.
7. **Costs and latency cover only extraction.** Measure the complete import path, including upstream analysis, lookup, queue time, retries and infrastructure, before making product-level cost or speed claims.
8. **Model settings differ where provider interfaces require it.** The shared prompt and schema improve comparability but do not make the serving configurations identical.

Suggested follow-up: freeze an independently reviewed held-out set; include no-place, duplicate, ambiguous-branch, unknown-location and injected-instruction cases; repeat each provider under documented settings; then compare extraction quality, user correction effort and full-pipeline cost/latency. No follow-up runs were performed for this report.

## Reproducibility and evidence index

The three saved reports share prompt version `benchmark-place-clues-v1`, scoring version `entity-scope-adjudication-v1`, recorded commit `0f561834fe52e2acdbdf446edc038e0a46fa6e45` and Node `v24.18.0`. Their report mode is `offline-replay`: scoring reuses stored responses and original network measurements. Report timestamps below are replay timestamps, not necessarily original request times.

- Video 1, `ODrvB8WfkPc`: [summary](../../evals/private/youtube/ODrvB8WfkPc/runs/842b1a459a3f4fea4bb75eafa5095bcdbb8fc832706a6bd7f7c1bc3ae77daa4d/summary.md), [full results](../../evals/private/youtube/ODrvB8WfkPc/runs/842b1a459a3f4fea4bb75eafa5095bcdbb8fc832706a6bd7f7c1bc3ae77daa4d/llm-place-extraction-results.json), [diagnostics](../../evals/private/youtube/ODrvB8WfkPc/runs/842b1a459a3f4fea4bb75eafa5095bcdbb8fc832706a6bd7f7c1bc3ae77daa4d/metrics-diagnostics.md). Replay timestamp: `2026-09-23T04:03:57.754Z`. Dataset hash: `5a4a8e18d851f1f7285d9460a23f2893ef8c69d0fcb23015020fc3fa4fb09c06`.
- Video 2, `KWpVP59gDjw`: [summary](../../evals/private/youtube/KWpVP59gDjw/runs/b12bd86ae6ffd34db6cb435592152b0eca05b36cc42893f3a373cbfdf1ff5e27/summary.md), [full results](../../evals/private/youtube/KWpVP59gDjw/runs/b12bd86ae6ffd34db6cb435592152b0eca05b36cc42893f3a373cbfdf1ff5e27/llm-place-extraction-results.json), [diagnostics](../../evals/private/youtube/KWpVP59gDjw/runs/b12bd86ae6ffd34db6cb435592152b0eca05b36cc42893f3a373cbfdf1ff5e27/metrics-diagnostics.md). Replay timestamp: `2026-09-23T04:24:41.202Z`. Dataset hash: `4ba778411097be86f7b3a0a08ed946b07249fd500d637d4e8a35cd0e902e55af`.
- Video 3, `18SjW74vkWE`: [summary](../../evals/private/youtube/18SjW74vkWE/runs/e02d522460a3881dc63aea2001755c9ae4f8897056bca552dd441b91e13c44d8/summary.md), [full results](../../evals/private/youtube/18SjW74vkWE/runs/e02d522460a3881dc63aea2001755c9ae4f8897056bca552dd441b91e13c44d8/llm-place-extraction-results.json), [diagnostics](../../evals/private/youtube/18SjW74vkWE/runs/e02d522460a3881dc63aea2001755c9ae4f8897056bca552dd441b91e13c44d8/metrics-diagnostics.md). Replay timestamp: `2026-09-23T03:21:42.552Z`. Dataset hash: `f0052ba41ba7c788882b1f3f91de543520ac8eef71018b010bacae6a8ff19fa1`.

These links refer to local, gitignored private artifacts and may not resolve in a public checkout. This report republishes aggregate metrics and identifiers only; source transcripts, model response text, reviewer identities and credentials are not copied.

Method references: [benchmark protocol](../../evals/llm/README.md), [scoring implementation](../../evals/llm/metrics.ts), [aggregation implementation](../../evals/llm/benchmark.ts).

## Report validation and assistance

- Read all three local summaries and structured result reports; matched their video order to the supplied tables.
- Checked finalized count identities, dataset flags, attempt counts and equality of saved prompt text across reports.
- Calculated pooled metrics, macro averages, token/cost totals and latency statistics directly from stored full-precision values.
- Documentation-only work: no application/API behavior changed, no new model benchmark or application test suite ran, and no production provider selection changed.
- AI assistance: Codex inspected local evidence, calculated aggregates and drafted this report. Independent human verification of this report remains pending. Historical adjudication flags are not attributed to this authoring session.
