# Member 4: YouTube inspiration integration probe

Date: 2026-09-18. User explicitly requested a live test of
[video Waj-dq9WmBo](https://www.youtube.com/watch?v=Waj-dq9WmBo) before deployment.
This is a manual provider diagnostic, not a passed application/worker acceptance test.

## Results

| Stage | Observed result |
| --- | --- |
| Earlier Gemini attempts | HTTP 403; project access denied |
| Current application transcription settings | Request timed out; retry with a temporary 300000 ms timeout reached MAX_TOKENS and correctly rejected incomplete output |
| Diagnostic transcription settings | HTTP 200, finishReason STOP, status ok, language vi, 28267 characters; 113911 ms |
| Existing OpenAI extractor and prompt | Rejected output with MALFORMED_OUTPUT; schema-valid clues contained excerpts absent from the transcript |
| Diagnostic extraction | gpt-4.1-mini with a shorter prompt asking for exact place-name excerpts returned 12 clues in 3738 ms; all passed ClueListSchema and exact substring validation |
| Google Places lookup | HTTP 403 PERMISSION_DENIED: The caller does not have permission; no place options returned |

The video's public YouTube oEmbed metadata identifies a Tokyo food video by Min Coconut, so Tokyo was used
as the lookup context. The generated transcript also mentions Tokyo. No destination was inferred from fixtures.

## Diagnostic settings and limits

The successful Gemini request used the existing gemini-3.6-flash adapter and validation with a temporary
transport override: maxOutputTokens 32768, temperature 1, thinkingLevel low, timeout 300000 ms.
The live model metadata endpoint reported an output limit of 65536. The successful response reported
249034 prompt tokens and 8108 candidate tokens, 257142 total tokens. These counts cover only that successful
request; costs and the usage of preceding failed requests were not measured.

Google recommends temperature 1 for Gemini 3 and documents thinking controls:
[Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3),
[thinking guide](https://ai.google.dev/gemini-api/docs/thinking).
Several settings changed together: this probe does not establish which change caused success or quantify
a repeatable speed/quality improvement. The production adapter defaults were not changed.

The successful transcript was reused through the extractor's link-input branch to avoid another Gemini call.
The original prompt and a longer evidence-copying addition both produced rejected outputs. A short diagnostic
prompt plus gpt-4.1-mini passed structural/evidence checks. This prompt requested literal place names as excerpts,
so the passing result carries less surrounding context than the original prompt intended. The production
extractor prompt and configured model were not changed.

## Returned clues and quality review

The diagnostic result included nine hours, hotel Mystays, Blue Bottle, 2nd Street, Ginza, MoMA Design Store,
Muji, Loft, Disneyland and DisneySea, plus a generic capsule-hotel description and Disney Cruise.
Those last two need review for whether they identify an actionable venue in this trip; chain names also lack
branch identity. None were confirmed, saved to a trip or accepted as provider-verified facts.

Initial review incorrectly suspected the nine hours name was invented from a generic hotel description.
Inspection found an explicit nine hours mention later in the transcript. The rejected excerpts were still
not exact source matches. This correction was communicated to the user.

A model-generated transcript with STOP and valid JSON does not prove speech accuracy or full coverage.
No independent audio comparison, recall/precision labels or hallucination-rate measurement was performed.
Literal evidence checks establish that excerpts occur in the generated transcript, not that the transcript
matches the video or that each extracted clue is an appropriate place to visit.

## Remaining work

- Resolve permission for the project's Google Places API (New), then rerun lookup against the cached clues.
  The error returned no detailed cause; API enablement, billing and key restrictions were not verified.
- Agree and implement production transcription/extraction settings only after reviewing this diagnostic's quality.
- Run the real web inspiration save and dedicated worker against a test trip, including persistence and recovery.
- Decide separately whether full transcripts should be persisted/displayed. Current imports use transcripts
  internally and store candidate evidence; the diagnostic command returns the transcript separately.

No application code or credentials changed. Diagnostic scripts and generated transcript/clue artifacts remain
in ignored .local files; they are not committed. No database records were created by this probe.
The prior turn's 65 mocked provider tests passed; they were not rerun or treated as live-video evidence here.
