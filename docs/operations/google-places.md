# Real transcript-to-place imports (local integration)

The existing Extractor and PlaceLookup interfaces, ClueListSchema, CandidatePlace storage,
confirmation/merge services, and planner are reused. No new database table or parallel planner.
The only public projection addition is optional provider/attribution on SharedPlace.

## Configure

In Google Cloud, enable **Places API (New)** on a project with billing enabled. Create a
server key restricted to that API (and your server IP where practical). This is separate
from the Gemini API configuration. Never prefix these secrets with NEXT_PUBLIC_.
See [Google setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key).

Edit `apps/web/.env.local` (not `.env.example`), preserving your existing values:

```env
AI_PROVIDER=openai
PLACES_PROVIDER=google
OPENAI_API_KEY=<your OpenAI key>
GOOGLE_AI_API_KEY=<your Gemini key>
GOOGLE_PLACES_API_KEY=<your Places key>
```

Optional existing overrides: OPENAI_EXTRACTION_MODEL (default gpt-4o-mini), OPENAI_TIMEOUT_MS
(default 60000), GEMINI_TRANSCRIPTION_MODEL and GEMINI_TRANSCRIPTION_TIMEOUT_MS.
New optional GOOGLE_PLACES_TIMEOUT_MS defaults to 60000 per page.
Use the [Supabase setup](supabase-vercel.md), then run `npm run dev` and the separate `npm run worker` process.
Real imports no longer execute inside web requests; file mode supports only the inline fake demo.
Restart both processes after configuration changes. Fake remains the committed default.

## Manual command

From the repository root in PowerShell:

```powershell
npm run extract:youtube-places -- "https://www.youtube.com/watch?v=jTOfOew316s" "Tokyo"
```

Use a plain URL, not a Markdown-formatted link. Set the destination to the video's actual trip
context. This command makes billable Gemini, OpenAI and Google Places requests. It prints
the model-generated transcript/provenance, `validatedClues`, and candidates with complete
provider options and pending/ambiguous/not_found status. `saved:false` means this diagnostic
command does not write to your trip. No match is automatically confirmed.

Video imports support English recordings of at most two minutes. The user-selected duration API rejects longer videos
before Gemini; Gemini checks speech language before an accepted transcript goes to extraction.
Missing/unverifiable duration blocks transcription. See [video restrictions and setup](youtube-transcript.md).
The transcript-only command needs no OpenAI or Google Places key; those providers belong to subsequent stages.

Illustrative output only (fictional venue, not a measured result):

```json
{
  "status": "ok",
  "transcript": "Visit Synthetic Cafe in Shibuya.",
  "validatedClues": {"clues": [{"query": "Synthetic Cafe", "hint": "Shibuya", "excerpt": "Visit Synthetic Cafe in Shibuya."}]},
  "candidates": [{"clue": {"query": "Synthetic Cafe", "hint": "Shibuya", "excerpt": "Visit Synthetic Cafe in Shibuya."}, "status": "not_found", "options": [], "selected": null}],
  "saved": false
}
```

## Save and confirm in the app

1. Run `npm run dev`, sign in, and open/create your trip with the correct destination.
2. In Inspiration library select the trip and add the public YouTube link without notes.
   Alternatively paste a transcript as a text save (only OpenAI and Places keys are needed).
3. Existing import jobs run transcription -> text extraction -> schema validation -> lookup.
   A note/details on a link is used as supplied recovery text instead of fetching the video.
4. Open Confirm places. Inspect source excerpts, provider addresses, unknown hours and branches.
   Explicitly choose and confirm the intended branch; a single match also requires confirmation.
5. Generate an itinerary through the existing UI. Only confirmed places enter the planner.
   Unknown hours stay unchecked; missing visit duration uses the existing explicit 60-minute default.

A failed provider call is retried through existing jobs. Original saves remain. Malformed
output throws; an empty valid clue list becomes NO_PLACES_FOUND recovery. Instagram/TikTok
without supplied text still return SOURCE_INACCESSIBLE. No scraping or screenshot analysis.

## Provider behavior and limits

`extract-places-v1` treats source text as untrusted and requires literal excerpts. The LLM
returns clues only; Google alone supplies IDs, names, addresses, coordinates, hours and prices.
Schema/excerpt validation rejects malformed or unsupported evidence, but does not prove the
model's interpretation is correct or prove injection resistance. Human confirmation is essential.

Google Text Search (New) uses query + source hint + trip destination. It retains all returned
branches across up to three pages (20 per page), deduplicating identical Google IDs. This is
provider-ranked search, not an exhaustive list or proof of a semantic match. If another page
remains at the limit the lookup fails and asks for narrower input rather than hiding ambiguity.
Permanent closures are excluded; temporary closures have unknown hours. Missing essential
ID/name/coordinates rejects the response. Missing optional facts stay null/unknownFields.
Protobuf's omitted zero-valued time components use documented zero defaults. Overnight or
multi-day schedules are unknown because the planner cannot model prior-day carry-over;
explicit 24/7 schedules are represented using its full-day window convention. Regular hours
are not a guarantee of holiday hours.

Same-provider-ID matches reuse existing dedupe. Same-save/clue evidence identity remains;
additional excerpts are retained. Explicit conflicting hints use distinct clue identities.
Confirmation retains evidence and existing merge/reference updates.

The requested field mask includes hours and price fields that affect billing; review
[Text Search fields](https://developers.google.com/maps/documentation/places/web-service/text-search).
Google data is attributed and map previews containing it use text instead of OpenStreetMap.
A Google Maps renderer is deferred. Existing persistence stores provider snapshots; before
production, implement a retention/refresh policy consistent with your Google Maps agreement.
Place IDs and other provider content have different storage rules. Public deployment, privacy
notice/terms, caching compliance and UI attribution review are not certified by these tests.
See [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

No live Google Places smoke test or human accuracy review was run during implementation.
Automated tests use synthetic mocked provider responses and globally reject unmocked fetch.
