# Transcript-to-place imports

**Current selection:** OpenStreetMap replaced active Google lookup later on 19 September 2026.
Use the [OpenStreetMap guide](openstreetmap.md). This page documents the optional Google adapter.

## Current flow (2026-09-19)

Google Places lookup is restored at the user's request. Real imports now run:

YouTube duration check -> Gemini English transcript -> OpenAI structured extraction
-> source-reference validation and original passage evidence -> Google Places matches
-> explicit user confirmation -> planning.

`PLACES_PROVIDER=google` enables lookup; `none` deliberately keeps extraction-only output.
Google facts remain separate from model clues. A returned match is not proof that it is the place in the video.
The fake/fake demo still uses explicitly fictional fixtures; mixing real extraction with fake lookup is rejected.

## Configure and run

Set `AI_PROVIDER=openai` and `PLACES_PROVIDER=google` in `apps/web/.env.local`.
Keep `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` and `GOOGLE_PLACES_API_KEY` there, server-side.
Enable Places API (New) and billing in the key's Google Cloud project. Its restrictions must allow server-side
Text Search calls from the Node worker. A `403` is an access failure, not an empty search.
Use the [Supabase setup](supabase-vercel.md), then run `npm run dev` and the separate
`npm run worker` process. Restart processes after configuration changes.

OpenAI defaults to gpt-4o-mini; existing model/timeout overrides remain supported.
Video inputs must be English and at most 120 seconds. Unverifiable duration blocks
transcription. See [video restrictions](youtube-transcript.md).

The manual runner (does not save to a trip) is:

```powershell
npm run extract:youtube-places -- "https://www.youtube.com/shorts/cW2Lu-N98B0" "Tokyo"
```

The destination is search context, not evidence, and does not fill missing transcript facts.
This command calls the duration API, Gemini, OpenAI and the configured Google lookup. Output includes transcript
provenance, validated clues and match options with null selection. `none` still returns unverified candidates.
Keep transcripts and provider content out of commits and shared logs.

## Save in the app

1. Sign in and select your trip in Inspiration library.
2. Add a supported public YouTube URL without notes, or paste a transcript as text.
   Text needs only OpenAI. Link notes/details remain the existing text recovery path.
3. The worker searches using extracted names, source-supported hints and trip destination, preserving literal evidence.
4. Open Review places: zero matches is `not_found`, one is `pending`, and multiple matches are `ambiguous`.
5. Select the intended returned branch and confirm. Only confirmed places enter the planner.

Provider IDs, addresses, coordinates and available hours come from Google; missing facts remain unknown.
Existing confirmed records remain usable. Saves remain `needs_confirmation` while candidates are unresolved.
Older extraction-only saves are not automatically reprocessed. Add the source again with lookup enabled;
matching unverified names/hints gain options while retaining their IDs and both source references.
Failed imports use the existing retry/add-details flow. The upgrade does not replace confirmed selections
or overwrite rejected suggestions. No new database migration is required.

Same names and matching hints can merge source evidence; conflicting hints stay separate.
The LLM cites numbered source passages; the server copies the original text instead of accepting rewritten quotes.
Schema validation and literal quotes do not prove real-world identity or transcript accuracy.
Malformed output retries through the bounded worker; empty clues request more details.
Instagram/TikTok without supplied text still return SOURCE_INACCESSIBLE.

## Resources and verification

Repeated query/hint pairs share a search within each attempt. Each distinct search is bounded to three pages
of 20 results and a timeout (default 60 seconds; `GOOGLE_PLACES_TIMEOUT_MS` overrides it). Excess results fail
instead of silently truncating branches. Existing worker and account quotas remain. Retries can repeat
transcription/extraction/lookup because transcript checkpointing is not implemented.

The existing field mask requests IDs, names, addresses, coordinates, primary type, hours, price level, attribution
and business status. Fields affect billing; no dollar cap is claimed. See Google's
[Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search).

[Restoration evidence](../../deliverables/evidence/google-places-restored-2026-09-19.md).
Existing attribution and Google-data map restrictions remain. A Google Maps renderer, production content
retention/refresh and independent human review remain outstanding; see Google's
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
Transactional merging remains with [Member 3, issue #9](https://github.com/namprice227/reel-travel/issues/9).
