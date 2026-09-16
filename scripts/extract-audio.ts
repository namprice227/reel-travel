import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { AudioPipelineError, createOpenAIAudioProviders, extractPlacesFromAudio } from "@reel/ai/audio";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0] || args[0].startsWith("--")) {
    throw new AudioPipelineError("INVALID_FILE", "Usage: npm run extract:audio -- <local-audio-filepath>");
  }
  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile); // Existing process variables take precedence.
  const providers = createOpenAIAudioProviders({
    apiKey: process.env.OPENAI_API_KEY,
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL,
    extractionModel: process.env.OPENAI_EXTRACTION_MODEL,
    timeoutMs: process.env.OPENAI_TIMEOUT_MS?.trim() ? Number(process.env.OPENAI_TIMEOUT_MS) : undefined,
  });
  console.log(JSON.stringify(await extractPlacesFromAudio(args[0], providers), null, 2));
} catch (error) {
  const failure = error instanceof AudioPipelineError ? error : { code: "AUDIO_PIPELINE_FAILED", message: "Audio pipeline failed. Check local configuration." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  process.exitCode = 1;
}
