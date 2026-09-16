import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createGeminiYouTubeTranscriber, YouTubeTranscriptError } from "@reel/ai/youtube";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0]) throw new YouTubeTranscriptError("INVALID_URL", "Usage: npm run transcribe:youtube -- <YouTube-URL>");
  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);
  const transcriber = createGeminiYouTubeTranscriber({
    apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GEMINI_TRANSCRIPTION_MODEL,
    timeoutMs: process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS?.trim() ? Number(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS) : undefined,
  });
  const result = await transcriber.transcribe(args[0]);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
} catch (error) {
  const failure = error instanceof YouTubeTranscriptError ? error : { code: "TRANSCRIPTION_FAILED", message: "Check local configuration." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  process.exitCode = 1;
}
