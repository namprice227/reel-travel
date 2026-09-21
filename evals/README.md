# Evaluation workspace

The provider-neutral [itinerary benchmark harness](itinerary/README.md) is available for BE12/BE14.
It includes six synthetic development cases, an offline baseline and an OpenAI adapter;
Gemini/Ollama adapters, held-out quality evaluation and measured cost comparison remain pending.

Owner: Member 3; Member 4 checks scheduling, cost and access/security; Members 1 and 2 check user outcomes.

- datasets/: permissioned or synthetic inputs and independently checked labels.
- results/: sanitized measured runs with model/provider/prompt version, timestamp and commit.
- private/: excluded from Git; consent records and identifiable material.

Initial team target: 30–50 representative saves; include ambiguity, duplicates, inaccessible links,
uncertain hours and malicious instructions embedded in content.
Separate prompt-development examples from a held-out set. Label synthetic examples explicitly.

Compare one candidate model and two alternatives on the same cases.
Measure exact venue-and-branch precision, coverage, recovery success, latency, usage cost,
schema validity, and schedule constraint violations. A system abstaining on everything
must not appear successful merely because its precision denominator is empty.

Precision = correct automatic matches / all automatic matches.
Coverage = usable processed saves / all attempted saves; report access failures separately.
Unknown opening windows remain unknown, even if known hard constraints pass.
Treat the proposal's 95% precision as a target, never a prefilled result.

For each change, retain before/after results and a short decision explaining the trade-off.
Do not report pilot targets as completed research.
