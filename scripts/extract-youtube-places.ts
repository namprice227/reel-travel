import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { ClueListSchema } from "@reel/ai";
import { createGooglePlaceLookup, createOpenAIExtractor, ProviderError } from "@reel/ai/real-providers";
import { createGeminiYouTubeTranscriber, YouTubeTranscriptError } from "@reel/ai/youtube";
import { createOsmLookup } from "../apps/web/src/server/osm-lookup";
try {
  const [url, destination, ...rest] = process.argv.slice(2);
  if (!url || !destination?.trim() || rest.length) throw new ProviderError("INVALID_INPUT", 'Usage: npm run extract:youtube-places -- "<YouTube URL>" "<destination>"');
  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);
  for (const key of ["GOOGLE_AI_API_KEY", "OPENAI_API_KEY"])
    if (!process.env[key]?.trim()) throw new ProviderError("API_KEY_MISSING", `Set ${key} in apps/web/.env.local.`);
  const timeout = (value: string | undefined) => value?.trim() ? Number(value) : undefined;
  const provider = process.env.PLACES_PROVIDER || "google";
  if (!["openstreetmap", "google", "none"].includes(provider)) throw new ProviderError("INVALID_CONFIGURATION", "Use PLACES_PROVIDER=openstreetmap, google or none for real transcript imports.");
  if (provider === "google" && !process.env.GOOGLE_PLACES_API_KEY?.trim()) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_PLACES_API_KEY in apps/web/.env.local.");
  const lookup = provider === "openstreetmap" ? createOsmLookup() : provider === "google" ? createGooglePlaceLookup({ apiKey: process.env.GOOGLE_PLACES_API_KEY,
    timeoutMs: timeout(process.env.GOOGLE_PLACES_TIMEOUT_MS) }) : null;
  const transcription = await createGeminiYouTubeTranscriber({ apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GEMINI_TRANSCRIPTION_MODEL, timeoutMs: timeout(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS) }).transcribe(url);
  if (transcription.status !== "ok") { console.log(JSON.stringify(transcription, null, 2)); process.exitCode = 1; }
  else {
    const extraction = await createOpenAIExtractor({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_EXTRACTION_MODEL,
      timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS) }).extract({ sourceType: "text", text: transcription.transcript, note: null, details: null });
    if (extraction.status !== "ok") throw new ProviderError("EXTRACTION_ERROR", extraction.message);
    const validated = ClueListSchema.parse({ clues: extraction.clues });
    if (lookup?.maxClues && new Set(validated.clues.map(c => JSON.stringify([c.query.toLowerCase(), c.hint?.toLowerCase() ?? null]))).size > lookup.maxClues)
      throw new ProviderError("LOOKUP_ERROR", `Submit a shorter source with at most ${lookup.maxClues} places for location search.`);
    const candidates = [];
    const searches = new Map<string, Awaited<ReturnType<NonNullable<typeof lookup>["search"]>>>();
    for (const clue of validated.clues) {
      const key = JSON.stringify([clue.query.toLowerCase(), clue.hint?.toLowerCase() ?? null]);
      const options = lookup ? searches.get(key) ?? await lookup.search(clue, { destination }) : [];
      searches.set(key, options);
      candidates.push({ clue, status: !lookup ? "unverified" : !options.length ? "not_found" : options.length === 1 ? "pending" : "ambiguous", options, selected: null });
    }
    console.log(JSON.stringify({ ...transcription, validatedClues: validated, candidates, saved: false,
      nextStep: "Use the app Inspiration library to save the source, then review provider matches and confirm the intended place before planning." }, null, 2));
  }
} catch (error) {
  const failure = error instanceof ProviderError || error instanceof YouTubeTranscriptError ? error : { code: "PIPELINE_FAILED", message: "Check provider configuration; no partial output accepted." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } })); process.exitCode = 1;
}
