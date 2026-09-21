# AI module

Owner: Member 3 (backend). Add extraction, place matching, prompt versions and model-provider adapters here.

Consume only accessible input; return candidate places with evidence and uncertainty.
Keep factual lookup separate from model inference; do not treat confidence text as verification.
Put prompt versions in prompts/ and link measured changes to evals/results/.

## Interfaces ([types.ts](src/types.ts))

- `Extractor.extract(input)` returns `{ status: "ok", clues }` or `{ status: "needs_input", failureCode, message }`.
  Throw only for unexpected errors; the job retries.
- `PlaceLookup.search(clue, { destination })` returns `PlaceOption[]`: 0 = not found, 1 = confirm, 2+ = choose a branch.
  Hours, address and coordinates come from the provider.
- `ClueListSchema` validates model output before anything is saved.

## Current implementations (synthetic)

- `createFakeExtractor`: matches names from [gazetteer.ts](src/gazetteer.ts). Links and screenshots need a note or
  details. A save containing `[[fail]]` throws until details are added.
- `createFakePlaceLookup`: searches 17 fictional Tokyo venues. Names and hours are invented; never present them as real.

To add a real adapter: implement the interface here, add a case in `apps/web/src/server/providers.ts`, set
`AI_PROVIDER` or `PLACES_PROVIDER`, and keep keys server-side. Behaviour and acceptance checks:
[F1](../../docs/features/F1-import.md) and [F2](../../docs/features/F2-places.md).


## Phase 1 local audio sample (BE01)

Implemented on `feat/BE01-audio-extraction`; live provider verification is pending.
The web app still selects its existing fake providers. This is a Node-only manual pipeline,
not an audio-upload feature. Existing `Extractor`, recovery states and persisted `CandidatePlace`
contracts are unchanged. `ExtractedPlaceSchema` describes unverified leads, not confirmed places.

1. Install locked dependencies with `npm ci` (Node 24 recommended).
2. Put `OPENAI_API_KEY` in the ignored `apps/web/.env.local`, or set it in your shell.
3. From the repository root, run:

```powershell
npm run extract:audio -- "C:\path\to\sample.wav"
```

This explicitly sends the audio and then its transcript to OpenAI and can incur API charges.
Use permissioned audio; keep private samples in ignored `evals/private/`. Nothing is persisted by
this command. JSON is printed to stdout; use `npm run --silent extract:audio -- "C:\path\to\sample.wav"`
when redirecting stdout to a private file. Errors are JSON on stderr with a nonzero exit status.
Never commit private transcripts or outputs. Shell environment values take precedence over the env file.

Defaults: transcription `gpt-4o-mini-transcribe`, extraction `gpt-4o-mini`, 60000 ms per request.
Override with `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_EXTRACTION_MODEL`, `OPENAI_TIMEOUT_MS` (1?300000).
Defaults are initial integration choices, not benchmark winners; account/model availability must be verified.
Uses native fetch/FormData and the existing Zod dependency, with no additional SDK or service.

Input: one nonempty, readable local `.wav`, `.mp3`, `.m4a`, or `.mpga` file, at most 25 MB.
Files are not transcoded; decoding errors are reported as transcription failures.
No video containers, URL downloads, image analysis, or place-provider calls are enabled.
No automatic retries: a failure will not silently repeat billable requests.

Example expected output for a fictional spoken sample (illustrative, not a measured API result):

```json
{
  "transcript": "Visit Hoshi Coffee.",
  "extractedPlaces": [
    {
      "name": "Hoshi Coffee",
      "city": null,
      "area": null,
      "category": null,
      "clues": [],
      "excerpts": ["Visit Hoshi Coffee."]
    }
  ]
}
```

The orchestration function `extractPlacesFromAudio(filepath, providers)` is exported from
`@reel/ai/audio`, a separate Node-only entry point. `AudioTranscriber` and `TranscriptExtractor`
can be replaced or mocked. The JSON schema sent to OpenAI is generated from the same Zod schema
used for local validation. Unsupported fields and evidence not present in the transcript are rejected.
Literal evidence does not establish factual truth or prove that a model resisted malicious instructions.
Ambiguity stays unresolved, exact repeated identities consolidate with their evidence, unknown values
remain null, and no-place/silent inputs produce an empty array. No implicit Tokyo context is added.

Stable errors: `INVALID_FILE`, `UNSUPPORTED_AUDIO_TYPE`, `AUDIO_TOO_LARGE`, `API_KEY_MISSING`,
`INVALID_CONFIGURATION`, `TRANSCRIPTION_TIMEOUT`, `TRANSCRIPTION_FAILED`, `EXTRACTION_TIMEOUT`,
`EXTRACTION_FAILED`, `LLM_REFUSAL`, `MALFORMED_OUTPUT`. An unexpected CLI/configuration failure
uses `AUDIO_PIPELINE_FAILED`. Missing key is checked before reading/uploading a file in the CLI.
Requests are bounded through response-body reading; credentials/provider error bodies are not echoed.

Offline tests cover the pipeline and failures. Fixtures in `evals/datasets/audio-phase1.json` are
synthetic development cases, not a held-out evaluation. Mocked injection outputs establish request
separation and validation only. BE05 must measure real accuracy and injection resistance separately.
See [implementation evidence](../../deliverables/evidence/be01-audio-2026-09-16.md).

API formats checked against official documentation:
[File transcription](https://developers.openai.com/api/docs/guides/speech-to-text) and
[Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).


## Public YouTube transcript sample

Run `npm run transcribe:youtube -- "<YouTube URL>"` with `GOOGLE_AI_API_KEY` in `apps/web/.env.local`.
See [setup, limits and error guide](../../docs/operations/youtube-transcript.md).
Gemini generates speech text; no Places lookup or web import integration is enabled.

## Real text and Places adapters

Server-only `@reel/ai/real-providers` exports `createOpenAIExtractor` and `createGooglePlaceLookup` behind existing interfaces. Prompt: `extract-places-v1`. Setup and manual pipeline: [Google Places guide](../../docs/operations/google-places.md). Fake remains default; tests block live fetch.

## YouTube itinerary/place classification (2026-09-21)

A separate CLI combines Gemini speech and timestamped visual observations with OpenAI typed
classification. Successful results are itinerary or place, with citations and unverified provenance.
Use npm run analyze:youtube; optional --output saves validated UTF-8 JSON to a new filename.
See [guide and limitations](../../docs/operations/youtube-reels.md). This is not connected to web imports;
existing transcript/Places commands remain available. Live classification and quality evaluation pending.
