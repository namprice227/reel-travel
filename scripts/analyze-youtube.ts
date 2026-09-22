import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { analyzeYouTubeReel } from "@reel/ai/reel";
import { YouTubeTranscriptError, normalizeYouTubeUrl } from "@reel/ai/youtube";
import { ProviderError } from "../packages/ai/src/provider-request";

let heartbeat: ReturnType<typeof setInterval> | undefined;
let stageLabel = "";
let stageStarted = 0;

try {
  const [url, flag, output, ...rest] = process.argv.slice(2);
  if (!url || rest.length || (flag !== undefined && (flag !== "--output" || !output)))
    throw new ProviderError("INVALID_INPUT", 'Usage: npm run analyze:youtube -- "<YouTube URL>" [--output "<new.json>"]');
  if (!normalizeYouTubeUrl(url)) {
    console.log(JSON.stringify({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE",
      message: "Provide a supported public HTTPS YouTube video URL." }, null, 2));
    process.exitCode = 1;
  } else {
    if (output && existsSync(output)) throw new ProviderError("OUTPUT_EXISTS", "Output already exists; choose a new filename.");
    const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
    if (existsSync(envFile)) loadEnvFile(envFile);
    const timeout = (value: string | undefined) => value?.trim() ? Number(value) : undefined;
    const result = await analyzeYouTubeReel(url, {
      onProgress(stage) {
        clearInterval(heartbeat);
        stageStarted = Date.now();
        stageLabel = stage === "evidence" ? "Gemini: reading speech and visual observations"
          : stage === "classification" ? "OpenAI: classifying and extracting itinerary/place"
          : "Validated result";
        console.error(`[analyze:youtube] ${stageLabel}`);
        if (stage !== "validated") {
          heartbeat = setInterval(() => {
            console.error(`[analyze:youtube] Still waiting for ${stage === "evidence" ? "Gemini" : "OpenAI"} (${Math.round((Date.now() - stageStarted) / 1000)}s)`);
          }, 15000);
          heartbeat.unref();
        }
      },
      gemini: { apiKey: process.env.GOOGLE_AI_API_KEY, model: process.env.GEMINI_TRANSCRIPTION_MODEL,
        timeoutMs: timeout(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS) },
      openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_EXTRACTION_MODEL,
        timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS) },
    });
    clearInterval(heartbeat);
    const json = JSON.stringify(result, null, 2);
    if (result.status === "ok" && output) {
      try { await writeFile(output, json + "\n", { encoding: "utf8", flag: "wx" }); }
      catch { throw new ProviderError("OUTPUT_WRITE_FAILED", "Could not create output. Use a new filename in an existing writable directory."); }
    }
    console.log(json);
    if (result.status !== "ok") process.exitCode = 1;
  }
} catch (error) {
  const failure = error instanceof ProviderError || error instanceof YouTubeTranscriptError ? error :
    { code: "REEL_ANALYSIS_FAILED", message: "Check local configuration; no complete result available." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
}
