# Current itinerary model comparison — 22 September 2026

This study uses prompt v5 and preserves the [earlier v3 experiment](../itinerary-2026-09-21/README.md).
See [protocol.md](protocol.md) for the predeclared 56-run main study and 16-run temperature study.

- `preflight/`: development-only provider checks, including failures; not part of the scored sample.
- `main/manifest.json`: synthetic fixtures, exact request prompts/schemas, hardware, models, local model digest and settings. `main/source/` preserves hashed implementation files.
- `main/order.json`: planned rotation; `main/rows.jsonl`: every measured generation, attempted repair and transport failure.
- `main/baseline.jsonl`: one deterministic comparator run per case.
- `main/summary.json`, `main/runs.csv`: generated descriptive statistics.
- `parameters/`: separately measured GPT-4.1 mini temperature 0.2 versus 1.0. Nested directories retain each individual call's manifest and raw records; each temperature directory aggregates its eight runs.
- `completed.txt` within each study is written only after all planned runs finish.

The synthetic set has 13 feasible cases and one impossible case. No production trip data, credentials or database writes are used. The 90-second per-call and 150-second overall limits measure diagnostic quality. They do not describe the deployed interactive deadline. Retrospective interactive-budget counts apply the existing 25/40-second limits to recorded timings.

[Reproduction and review instructions](REPRODUCE.md). The separate [Gemini diagnostic protocol](diagnostic-protocol.md) investigates request compatibility after the main sample; diagnostic responses must not replace main failures.

Completed: 56 main model runs (76 calls), 14 baseline cases, 16 separate temperature runs (24 calls), and two exploratory Gemini compatibility calls. [Full report](../../../deliverables/evidence/itinerary-provider-comparison-2026-09-22.md). No independent human ratings are claimed.

`analysis-manifest.json` and `analysis-source/` preserve the summary, audit, plot, parameter-study and diagnostic scripts. The local Ollama service started for this experiment was stopped after measurements; the downloaded 4B model remains available for reproduction.
