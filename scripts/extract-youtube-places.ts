import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { ClueListSchema } from "@reel/ai";
import { createGooglePlaceLookup, createOpenAIExtractor, ProviderError } from "@reel/ai/real-providers";
import { createGeminiYouTubeTranscriber, YouTubeTranscriptError } from "@reel/ai/youtube";
try {
  const [url, destination, ...rest] = process.argv.slice(2);
  if (!url || !destination?.trim() || rest.length) throw new ProviderError("INVALID_INPUT", 'Usage: npm run extract:youtube-places -- "<YouTube URL>" "<destination>"');
  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);
  for (const key of ["GOOGLE_AI_API_KEY", "OPENAI_API_KEY", "GOOGLE_PLACES_API_KEY"])
    if (!process.env[key]?.trim()) throw new ProviderError("API_KEY_MISSING", `Set ${key} in apps/web/.env.local.`);
  const timeout = (value: string | undefined) => value?.trim() ? Number(value) : undefined;
  const transcription = await createGeminiYouTubeTranscriber({ apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GEMINI_TRANSCRIPTION_MODEL, timeoutMs: timeout(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS) }).transcribe(url);
  if (transcription.status !== "ok") { console.log(JSON.stringify(transcription, null, 2)); process.exitCode = 1; }
  else {
    const extraction = await createOpenAIExtractor({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_EXTRACTION_MODEL,
      timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS) }).extract({ sourceType: "text", text: transcription.transcript, note: null, details: null });
    if (extraction.status !== "ok") throw new ProviderError("EXTRACTION_ERROR", extraction.message);
    const validated = ClueListSchema.parse({ clues: extraction.clues });
    const lookup = createGooglePlaceLookup({ apiKey: process.env.GOOGLE_PLACES_API_KEY, timeoutMs: timeout(process.env.GOOGLE_PLACES_TIMEOUT_MS) });
    const candidates = [];
    for (const clue of validated.clues) {
      const options = await lookup.search(clue, { destination });
      candidates.push({ clue, status: options.length === 0 ? "not_found" : options.length === 1 ? "pending" : "ambiguous", options, selected: null });
    }
    console.log(JSON.stringify({ ...transcription, validatedClues: validated, candidates, saved: false,
      nextStep: "Use the app Inspiration library and Confirm places to persist and confirm these results." }, null, 2));
  }
} catch (error) {
  const failure = error instanceof ProviderError || error instanceof YouTubeTranscriptError ? error : { code: "PIPELINE_FAILED", message: "Check provider configuration; no partial output accepted." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } })); process.exitCode = 1;
}
