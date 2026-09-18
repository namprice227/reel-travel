# Short English YouTube transcription

Google AI (Gemini) is used only to produce a spoken transcript. The existing OpenAI extractor receives
accepted transcript text in the next step; place verification remains a separate stage. The standalone
transcript command does not require OpenAI or Google Places credentials.

## Supported videos

- Public YouTube watch, short-link, shorts and embed URLs that normalize to one video ID.
- Duration must be greater than zero and **at most 120 seconds**. Exactly two minutes is accepted.
- Speech must be English. Non-English, mixed-language or unidentified speech is rejected; it is never
  translated to make it eligible. Proper names and brief foreign quotations alone do not disqualify English speech.
- A Shorts URL is not proof of duration. Longer videos return: **We only support short video content up to
  2 minutes, such as YouTube Shorts.**
- Unsupported language returns: **We only support English-language videos.**

The earlier long Vietnamese diagnostic video is outside this policy.

## Duration check before Gemini

The user-selected service is `POST https://ytplaylistlength.one/api/calculate` with multipart fields:

```text
search_string = normalized public YouTube URL
range_start = 1
range_end = 1
```

No extra API key is needed. No credentials, source notes, cookies or account identifiers are sent to it.
The app requires a successful, complete single-video result, matching requested/result/video IDs, one
considered video, no unavailable/truncated records, and matching positive numeric total/per-video seconds.
An invalid response or unknown duration blocks transcription. A response over 120 seconds blocks Gemini,
OpenAI extraction and Places calls. The duration request is bounded at 10 seconds and 2 MB; redirects fail.
HTTP/transport errors are masked as VIDEO_DURATION_FAILED and use the existing bounded worker retry policy.
The app depends on the external service's duration accuracy and availability; it does not inspect media locally.
[Duration service](https://ytplaylistlength.one/).

This service does not provide an audio-language field. Gemini checks speech language as part of the bounded
transcription request and is instructed to return an empty transcript immediately for unsupported language.
The adapter also checks the returned language before passing text downstream. This costs a Gemini request
for eligible-duration non-English videos; language detection is model-based, not an independently verified guarantee.

## Setup and run

Keep this value in ignored `apps/web/.env.local`:

```env
GOOGLE_AI_API_KEY=your_actual_key
```

From the repository root with Node 24:

```powershell
npm run transcribe:youtube -- "https://www.youtube.com/shorts/cW2Lu-N98B0"
```

No web server is needed. This manual command contacts the duration service and, for accepted durations,
makes a billable Gemini request. Existing shell values take precedence over the local environment file.
The result is either `status:ok` with transcript/language/sourceUrl/provenance, or `status:needs_input` with
failureCode/message. Recovery and errors exit 1. The transcript is model-generated speech text, not original captions.

Optional overrides:

```env
GEMINI_TRANSCRIPTION_MODEL=gemini-3.6-flash
GEMINI_TRANSCRIPTION_TIMEOUT_MS=120000
```

Timeout range remains 1-300000 ms. Generation is bounded at 8192 output tokens, 12000 transcript characters
and a 2 MB response; Gemini 3 uses low thinking and temperature 1. MAX_TOKENS and malformed output are rejected.
No automatic provider retry occurs inside the adapter. A STOP response and valid schema do not establish
transcription accuracy or complete speech coverage. Independent audio review remains necessary.

## Application behavior

Real web imports (`AI_PROVIDER=openai`) use the same adapter in the dedicated worker. Policy rejections
persist `needs_input` and `UNSUPPORTED_SOURCE` with the exact length/language message; unverifiable duration
uses `SOURCE_INACCESSIBLE`. The original URL remains saved. The job finishes without automatic policy retries
and no candidate lookup runs. The existing inbox displays failureMessage and offers add-details/skip recovery.
Adding note/details remains a supplied-text recovery path; it does not read the video.

Instagram/TikTok scraping, local media downloading, video frames and a transcript storage/UI feature remain
outside this change. Full transcripts stay internal to the current web extraction flow.

Sources: [Gemini video input](https://ai.google.dev/gemini-api/docs/video-understanding),
[Gemini 3 settings](https://ai.google.dev/gemini-api/docs/gemini-3).
