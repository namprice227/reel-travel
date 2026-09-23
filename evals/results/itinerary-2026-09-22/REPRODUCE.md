# Reproduce the current comparison

Use Node 24 and `npm ci` from the repository root. Put API keys only in the ignored `apps/web/.env.local`: `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`. This run did not change billing or production settings. Ensure adequate quota; free-tier failures are part of delivery results, not model-quality scores.

Start Ollama on loopback in a separate terminal:

```bash
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
ollama pull qwen3:4b
```

Choose a new output directory; the runner refuses to overwrite a started experiment. To reproduce historical source exactly, use the recorded commit plus the manifest's source snapshot and verify hashes. A mutable Ollama tag/cloud alias can change; compare the digest/returned model version to the manifest. Neither cloud latency nor stochastic outputs can be exactly reproduced.

```bash
node --env-file=apps/web/.env.local --import tsx scripts/compare-itinerary.ts \
  --live --current --runs 1 --providers openai,openai_small,gemini,ollama \
  --ollama-model qwen3:4b --call-timeout 90000 --total-timeout 150000 \
  --out .local/itinerary-new/main
node --import tsx scripts/summarize-itinerary-comparison.ts .local/itinerary-new/main
node --import tsx scripts/audit-itinerary-comparison.ts .local/itinerary-new/main
node --env-file=apps/web/.env.local --import tsx scripts/itinerary-parameter-study.ts \
  --live .local/itinerary-new/parameters
```

`inputHash` in benchmark rows identifies the canonical application request at its default limits; each attempt's `requestHash` additionally reflects the actual overridden deadline and repair feedback. The manifest separately records evaluation limits. Comparability refers to prompt/input/schema content, not identical repair feedback between models.

No web/Maps search, real weather fetch, customer database access or itinerary persistence is performed. Only synthetic fixtures leave the machine. Warmup and preflight are excluded from main statistics. Traces exclude request headers and credentials.

For independent review, distribute `main/human-review/*.json` and a separate copy of `ratings.csv` to each reviewer. Do not give reviewers `main/human-review-key.json`, provider costs, model names or latency before ratings are locked. All run-1 cases are included rather than selected favorable examples. The existing [review rubric](../../itinerary/HUMAN_REVIEW.md) defines scores. Empty cells mean not measured, never zero.
