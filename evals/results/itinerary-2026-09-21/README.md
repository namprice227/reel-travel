# Itinerary provider experiment artifacts

- [Frozen protocol](protocol.md): settings, case allocation and metrics decided before measured runs.
- `main/manifest.json`: complete synthetic fixtures, prompts, request schemas, source SHA-256 values, dirty-tree
  state, models, hardware and Ollama model digest. Contains no credentials or customer trips.
- `main/source/`: frozen experiment implementation. Paths correspond to repository paths; this is an audit
  snapshot, not a separate standalone package. The source hashes identify what actually ran.
- `main/order.json`: planned balanced provider ordering.
- `main/rows.jsonl`: every measured LLM run, including failures and attempted repairs.
- `main/baseline.jsonl`: deterministic greedy comparator, once per scenario.
- `main/warmup.json`: local model warmup excluded from measurement.
- `main/gemini-model-metadata.json`: model metadata retrieved with the configured account.
- `preflight/`: development-only transport checks, kept separate from the main sample.

The completed run includes [summary.json](main/summary.json), [runs.csv](main/runs.csv), and
[the comparison report](../../../deliverables/evidence/itinerary-provider-comparison-2026-09-21.md).
The runner writes completed.txt only after all planned runs and baselines finish.
