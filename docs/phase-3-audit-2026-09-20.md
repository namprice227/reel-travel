# Phase 3 AI Integration Audit

Date: 2026-09-20  
Project: Reel Travel  
Audited commit: `5821d43` — Merge branch 'main' into feat/BE01-audio-extraction

## Overall finding

The repository has a substantial AI implementation, but Phase 3 is not yet submission-ready. The main gaps are comparative evaluation, measured improvements, production evidence, and completed milestone explanations—not simply additional features.

## Scope and verification limits

This audit compares the uploaded Phase 3 assignment requirements against local code, prompts, fixtures, tests, planning records, and evidence.

- The original audit was read-only. No code, configuration, or credentials were changed.
- `apps/web/.env.local` was not inspected. Active runtime provider selection is therefore unverified.
- No billable API calls, tests, builds, or deployments were run for the audit.
- Test results below are historical repository records, not fresh verification.
- Git showed a clean working tree before and after the original inspection.
- The local checkout was audited; remote updates were not fetched or compared.
- This report was subsequently created at the user's explicit request. No implementation changes accompany it.
- Audit findings are AI-assisted; independent human verification remains pending.

## Milestone assessment

| Requirement | Existing implementation or evidence | Missing work |
| --- | --- | --- |
| **M07: Explain LLM use and suitability** | OpenAI extracts place clues; local audio transcription/extraction and Gemini YouTube transcription exist; Google Places supplies factual candidates; deterministic code validates schedules. | Explain why LLMs suit noisy travel content, alternatives considered, and the boundaries between inference, provider facts, and user confirmation. The milestone answer is still a scaffold. |
| **M08: Explain 2–3 prompts and techniques** | Audio extraction, text/place extraction, and YouTube transcription prompts specify tasks, unknown values, structured output, evidence, and untrusted-content handling. | Explain actual prompts with examples and design rationale. No recorded prompt revision with measured before/after effects was found; the repository plan expects this. |
| **M09: Compare the selected model against two alternatives** | Initial configurable model choices exist. DEC-08 identifies OpenAI, Gemini, and Claude as comparison candidates. | No equivalent three-candidate extraction comparison found. Missing measured quality, reliability, latency, cost, trade-offs, and parameter justification. Using Gemini for transcription and OpenAI for extraction is not a comparison on the same task. |
| **M10: Explain AI interaction patterns** | Extraction → validation → provider lookup → human confirmation → deterministic planning; durable jobs and bounded retries exist. | Complete the architecture explanation and diagram; justify structured outputs, workflow orchestration, and native HTTP/Zod. Application-controlled lookup should not be described as model-driven tool calling. |
| **M11: Dataset, evaluation, and iteration** | Eight labelled synthetic development cases, mocked adapter/integration tests, and an evaluation plan. | No held-out AI dataset, automated quality-scoring runner, measured AI results, or results-driven improvement found. |
| **M12: Production optimization and impact** | Request deadlines, output limits, bounded retries, duplicate-safe persistence, and a synthetic planner benchmark. | No measured AI/Places usage cost, complete import latency, retry overhead, or before/after AI pipeline optimization. Planner results alone do not establish AI production optimization. |
| **M13: Threat model and at least two safeguards** | Separated instructions/source content, output validation, literal evidence checks, server-side keys, private-upload ownership checks, and authentication/sharing quotas. | Complete the threat model and milestone answer; run live adversarial evaluation; address import-specific abuse controls, privacy/retention, and hosted security verification. |

Milestone files: [M07](../deliverables/milestones/M07.md), [M08](../deliverables/milestones/M08.md), [M09](../deliverables/milestones/M09.md), [M10](../deliverables/milestones/M10.md), [M11](../deliverables/milestones/M11.md), [M12](../deliverables/milestones/M12.md), [M13](../deliverables/milestones/M13.md).

## Detailed findings

### 1. Real providers exist, but active runtime configuration is unverified

The application defaults to fake AI and fake Places providers. Real adapters are selectable through configuration. Their presence does not prove the current app or deployed environment uses them.

Evidence: [provider selection](../apps/web/src/server/providers.ts), [configuration defaults](../apps/web/src/server/config.ts).

Next step: verify the selected providers during an authorized live smoke test without exposing secrets.

### 2. Live end-to-end evidence is incomplete

The text/Places extension records **208 passing tests across 16 files**, but explicitly states that no live Places smoke test, browser smoke, provider accuracy measurement, or independent human review was performed for that extension.

One successful live Gemini transcription is recorded. This demonstrates request success and schema acceptance, not transcript accuracy or completeness. The local audio implementation evidence still identifies live verification as pending.

Evidence: [text/Places integration](../deliverables/evidence/be02-be03-google-2026-09-16.md), [YouTube experiment](../deliverables/evidence/be01-youtube-2026-09-16.md), [audio experiment](../deliverables/evidence/be01-audio-2026-09-16.md).

Next step: record a permissioned live text → extraction → Places → confirmation → saved itinerary journey. Separately verify audio/transcription accuracy if included in the presentation.

### 3. The required model comparison and held-out evaluation are missing

The eight cases in `audio-phase1.json` explicitly identify themselves as synthetic development fixtures, not measured model results or held-out evaluation. Mocked tests validate application behavior; they do not measure real model quality.

The evaluation plan proposes 30–50 representative saves and comparison of one candidate against two alternatives. No completed AI comparison result artifact was found.

Evidence: [development dataset](../evals/datasets/audio-phase1.json), [evaluation plan](../evals/README.md), [task plan](../planning/tasks.csv).

Next step: build independently checked labels and separate development/held-out sets. Compare three extraction candidates using equivalent content, schema, and prompts. Report counts and denominators, including abstentions and failures.

Suggested measurements:

- Place-name and city/area accuracy.
- Venue/branch precision and usable coverage.
- Unsupported-fact or hallucination rate.
- Schema validity and ambiguity handling.
- Prompt-injection success/failure rate.
- Recovery success for inaccessible inputs.
- Latency and cost per attempted and successful save.

Evaluate transcription separately so its errors do not obscure extraction performance.

### 4. Prompt design exists; measured iteration does not

Three suitable prompt examples already exist. They can support the prompt-design milestone without inventing additional product features.

Evidence: [audio extraction prompt](../packages/ai/prompts/audio-extraction-v1.ts), [place extraction prompt](../packages/ai/prompts/extract-places-v1.ts), [YouTube transcription prompt](../packages/ai/src/youtube.ts).

Next step: explain role/source separation, explicit unknowns, schema constraints, literal evidence, and conservative ambiguity handling. Select a measured development-set weakness, revise the prompt or extraction logic, and retain before/after results. Do not tune prompts on held-out examples.

Parameter documentation should describe actual settings, including output limits, timeouts, Gemini's configured temperature, and OpenAI extraction's use of unspecified sampling defaults. Explain choices rather than claiming unmeasured optimality.

### 5. Import spending lacks the existing auth/sharing quota protection

Import creation and manual retry paths do not invoke the application's rate limiter. Each queued job has bounded attempts, but repeated user requests can create further work. Failed imports restart the pipeline, so duplicate-safe persistence does not prevent repeated billable provider requests.

Evidence: [import services](../apps/web/src/server/services/inspirations.ts), [job execution](../apps/web/src/server/jobs/queue.ts), [rate-limit service](../apps/web/src/server/services/rate-limits.ts).

Next step: add per-user import/retry quotas and request/spending budgets. Distinguish retryable failures from permanent failures and verify enforcement before provider calls.

### 6. Injection resistance is designed for, but not measured

Prompts reject embedded instructions, and validation checks structure and literal source excerpts. A literal excerpt does not prove that the extracted interpretation is correct. Mocked hostile-input tests cannot establish real model resistance.

Evidence: [text extractor](../packages/ai/src/openai-extractor.ts), [audio validation](../packages/ai/src/audio.ts), [provider tests](../packages/ai/src/real-providers.test.ts).

Next step: run real adversarial cases with expected safe behavior, recorded outputs, and explicit failure counts. Explain how limited model authority, validation, and human confirmation reduce consequences even when extraction is wrong.

### 7. AI production optimization evidence is missing

The planner comparison reports a synthetic late-opening case with idle time reduced from 80 to 10 minutes. It does not measure AI/Places cost, complete request latency, retry overhead, or a general runtime speedup.

The provider adapters do not currently capture the token usage/cost evidence required for the proposed AI comparison. Product analytics logging is not a substitute for provider telemetry.

Evidence: [planner measurements](../evals/results/planner-comparison.json), [M12 limitations](../deliverables/milestones/M12.md), [server analytics](../apps/web/src/server/analytics.ts).

Next step: collect stage timings, provider usage, lookup counts, and retry costs. Select one optimization based on the baseline, then compare equivalent runs. Possibilities include avoiding repeated extraction on lookup retries or bounded concurrency for independent lookups, subject to provider constraints.

### 8. Privacy and provider-data lifecycle work remains incomplete

Private storage and server-side credentials are implemented. Repository documentation identifies pending provider-content retention/refresh work and private-object cleanup policy. A completed user-facing explanation of content sent to each AI provider and its retention/deletion was not found.

Evidence: [Places operational limitations](operations/google-places.md), [Supabase operations](operations/supabase-vercel.md).

Next step: document the actual data flow, third-party processing, retention, deletion, and access boundaries; implement the outstanding lifecycle behavior and verify hosted isolation. This audit does not certify provider-policy compliance.

### 9. Product-input limitations must be stated accurately

| Input or behavior | Audited state |
| --- | --- |
| Plain text | Real structured extraction adapter implemented; live quality evidence pending. |
| Local audio | CLI transcription/extraction experiment, not a web audio-upload feature. |
| Public YouTube | Gemini transcription adapter and optional web import wiring exist; one live transcription recorded, complete live journey pending. |
| Screenshot | Upload/recovery exists; vision extraction is deferred. |
| Instagram/TikTok | Unsupported links retain `SOURCE_INACCESSIBLE` recovery; no scraping required. |
| Uploaded-video frame extraction | Deferred. |
| Google-backed map display | Existing OpenStreetMap previews are suppressed for Google data; Google map rendering is deferred. |

These are scope limitations to disclose, not a requirement to implement every modality for Phase 3.

### 10. Submission documentation is inconsistent or unfinished

All seven Phase 3 milestone answers retain scaffolding. The root README is empty. Older documentation includes statements such as “no feature is implemented” or fake-only provider descriptions despite later implementation updates.

Evidence: [root README](../README.md), [product scope](product/scope.md), [AI README](../packages/ai/README.md), [milestone directory](../deliverables/milestones/).

Next step: establish one accurate current-state description, reconcile historical statements, and link claims to evidence. Retain explicit distinctions between implementation, mocked verification, live verification, and measurement.

## Prioritized next steps

| Order | Action | Completion evidence | Related tasks/milestones |
| --- | --- | --- | --- |
| 1 | Establish a live baseline of the existing workflow. | Sanitized live run tied to commit/configuration, observed failures, timing, and human review. | BE01–BE04; M07/M10 |
| 2 | Build independently labelled development and held-out sets; compare three extraction candidates. | Reproducible scoring and actual per-case/aggregate quality, latency, and cost results. | BE05; M09/M11 |
| 3 | Improve one measured extraction weakness. | Versioned before/after prompt or logic, results, and trade-off explanation. | BE06; M08/M11 |
| 4 | Measure and optimize the AI pipeline. | Stage timings, usage/cost, retry overhead, and equivalent before/after runs. | BE14; M12 |
| 5 | Close AI-specific safety gaps and verify hosted boundaries. | Import/retry quota tests, real hostile-input results, data lifecycle documentation, and hosted isolation evidence. | BE07/BE15; M13 |
| 6 | Complete M07–M13 from actual implementation and measurements. | Finished answers, source links, limitations, and independent review. | BE07/BE16 |
| 7 | Reconcile documentation and freeze demo evidence. | Populated README, consistent scope/provider claims, final model/prompt versions, and rehearsed recovery. | BE08/BE16 |

M07, M08, and M10 can largely be drafted from existing code now. M09 and M11 require experiments; M12 requires AI pipeline measurements; M13 requires a completed threat model and additional verification.

## Work not required merely because it appears in the assignment introduction

The assignment does not automatically require RAG, fine-tuning, autonomous agents, every optimization technique, or three production provider integrations. The existing structured workflow can satisfy the interaction-pattern milestone if accurately explained and evidenced.

Keep screenshot vision, additional video processing, social scraping, and other deferred features outside the next implementation scope unless explicitly authorized. Comparative model experiments can be isolated from production integration.

## Report creation record

- File created: `docs/phase-3-audit-2026-09-20.md`.
- Code/configuration changes: none.
- New tests, live calls, or deployments: none.
- Human verification: pending.
- Priority: evaluation and measured iteration first, followed by AI cost/latency evidence and completed milestone answers.
