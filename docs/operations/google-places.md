# Transcript-to-place imports

## Current flow (2026-09-18)

The user requested that Google Places verification be deferred. Real imports now run:

YouTube duration check -> Gemini English transcript -> OpenAI structured extraction
-> source-reference validation and original passage evidence -> unverified CandidatePlace records.

No Google Places request is made, even if an older environment still sets
`PLACES_PROVIDER=google`. The standalone Google adapter and its offline tests remain
for future verification work. The fake/fake demo still uses explicitly fictional fixtures.

## Configure and run

Set `AI_PROVIDER=openai` and `PLACES_PROVIDER=none` in `apps/web/.env.local`.
Keep `OPENAI_API_KEY` and `GOOGLE_AI_API_KEY` there; no Google Places key is required.
Use the [Supabase setup](supabase-vercel.md), then run `npm run dev` and the separate
`npm run worker` process. Restart processes after configuration changes.

OpenAI defaults to gpt-4o-mini; existing model/timeout overrides remain supported.
Video inputs must be English and at most 120 seconds. Unverifiable duration blocks
transcription. See [video restrictions](youtube-transcript.md).

The manual runner (does not save to a trip) is:

```powershell
npm run extract:youtube-places -- "https://www.youtube.com/shorts/cW2Lu-N98B0" "Tokyo"
```

The destination argument is retained for command compatibility; it is not evidence and
is not used to fill missing city/area information. This command calls the duration API,
Gemini and OpenAI. Its output includes transcript provenance, validated clues and
`unverified` candidates with empty options and null selection. Keep private transcripts
out of commits and shared logs.

## Save in the app

1. Sign in and select your trip in Inspiration library.
2. Add a supported public YouTube URL without notes, or paste a transcript as text.
   Text needs only OpenAI. Link notes/details remain the existing text recovery path.
3. The worker saves extracted names, source-supported hints and literal source excerpts.
4. Open the Places screen. **Extracted places** are marked **Unverified**.
   Review the evidence or reject a suggestion. Verification is currently unavailable.

These candidates have no invented provider IDs, addresses, coordinates, hours or prices.
They cannot be confirmed or used by the planner until a future verification step supplies
real provider options. Existing confirmed records remain usable. The save remains
`needs_confirmation` while extracted candidates are unresolved.

Same names and matching hints can merge source evidence; conflicting hints stay separate.
The LLM cites numbered source passages; the server copies the original text instead of accepting rewritten quotes.
Schema validation and literal quotes do not prove real-world identity or transcript accuracy.
Malformed output retries through the bounded worker; empty clues request more details.
Instagram/TikTok without supplied text still return SOURCE_INACCESSIBLE.

## Verification status

See [implementation and live check evidence](../../deliverables/evidence/member4-llm-candidates-2026-09-18.md).
Google Places integration, branch verification and human transcription/identity review are deferred.
No database migration is required: candidates and evidence use the existing JSON documents.
