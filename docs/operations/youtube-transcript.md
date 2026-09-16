# Manual YouTube transcript test

This Node-only command sends a public YouTube URL to Gemini and prints a model-generated transcript.
It does not download media locally, extract places, or change the web app import flow.

## Setup

Add your Google AI Studio Gemini API key to `apps/web/.env.local` (create it if needed):

```env
GOOGLE_AI_API_KEY=your_actual_key
```

Keep the key blank in the tracked `.env.example`. Do not use a Supabase secret or OAuth client secret.
Existing shell variables take precedence over `.env.local`. No additional dependency installation is needed
if the existing project dependencies are already installed.

From the repository root:

```powershell
npm run transcribe:youtube -- "https://www.youtube.com/watch?v=jTOfOew316s"
```

You do not need to start the web app. This manual command makes a billable provider request.
For JSON without npm's banner, use `npm run --silent transcribe:youtube -- "<YouTube URL>"`.
Start with a short public video and compare several passages with the spoken audio.
The supplied example URL has not been tested live by the agent.

Illustrative output (not a transcript of the linked video):

```json
{
  "status": "ok",
  "sourceUrl": "https://www.youtube.com/watch?v=jTOfOew316s",
  "transcript": "Synthetic spoken example.",
  "language": "en",
  "provenance": {
    "provider": "gemini",
    "model": "gemini-3.6-flash",
    "kind": "model_generated_transcript"
  }
}
```

This is generated speech transcription, not downloaded original captions. Schema validation cannot prove
accuracy, complete coverage or resistance to instructions embedded in video. Even a STOP finish reason
does not prove that every sentence was transcribed. Gemini receives video input despite the speech-only
prompt; the implementation cannot guarantee that the provider processes audio alone.

## Supported inputs and limits

Recognizes HTTPS youtube.com/www.youtube.com/m.youtube.com watch links, youtu.be short links, and
YouTube shorts/embed paths with valid video IDs. Extra query parameters (including timestamps) are removed;
the request targets the whole video. A recognized URL is not proof that the video is accessible.
Other hosts, HTTP URLs, playlists without a video, malformed links and credential-bearing URLs return
`needs_input` with `SOURCE_INACCESSIBLE`. No scraping/downloader package is used.

Private/unlisted/restricted/unavailable video support is not promised. Provider failures are explicit.
No source metadata duration probe or chunking is implemented. Request timeout defaults to 120 seconds,
output to 16384 tokens, transcript to 100000 characters, and HTTP response to 2 MB. Partial output
reported as MAX_TOKENS is rejected. Prefer short videos for this first manual integration.

Optional overrides in `.env.local`:

```env
GEMINI_TRANSCRIPTION_MODEL=gemini-3.6-flash
GEMINI_TRANSCRIPTION_TIMEOUT_MS=120000
```

Timeout range: 1-300000 ms. Model access depends on your account. There are no automatic retries.
`API_KEY_MISSING` means GOOGLE_AI_API_KEY was not loaded. `TRANSCRIPTION_FAILED` with HTTP 400/403/404
can reflect key, model, region, or source access; HTTP 429 can indicate quota/rate limits.
`TRANSCRIPTION_TIMEOUT` means the request deadline elapsed. `INCOMPLETE_TRANSCRIPT` means output was
truncated. `LLM_REFUSAL` and `MALFORMED_OUTPUT` reject blocked or invalid responses.
Unavailable/no-speech/empty model outputs use SOURCE_INACCESSIBLE recovery and exit 1, not success.

The adapter is exported as `createGeminiYouTubeTranscriber` from `@reel/ai/youtube`. Successful text can
later enter the existing Extractor text input; this task deliberately does not wire extraction or Places.

Sources: [Google video input documentation](https://ai.google.dev/gemini-api/docs/video-understanding),
[generateContent reference](https://ai.google.dev/api/generate-content),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output).
