import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { extractAndMapPlaces } from "../packages/ai/src/map-places";
import { ProviderError } from "../packages/ai/src/provider-request";
import { YouTubeTranscriptError } from "../packages/ai/src/youtube";

let heartbeat: ReturnType<typeof setInterval> | undefined;
let stageLabel = "";
let stageStarted = 0;

try {
  const args = process.argv.slice(2);
  let input = "";
  let destination = "";
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") {
      outputPath = args[++i];
      if (!outputPath) {
        throw new ProviderError("INVALID_INPUT", "Must specify a filename after --output.");
      }
    } else if (!input) {
      input = args[i]!;
    } else if (!destination) {
      destination = args[i]!;
    } else {
      throw new ProviderError(
        "INVALID_INPUT",
        'Unexpected extra argument. Usage: npm run analyze:map-places -- "<YouTube URL or audio file>" "<destination>" [--output "<new.json>"]',
      );
    }
  }

  if (!input || !destination) {
    throw new ProviderError(
      "INVALID_INPUT",
      'Usage: npm run analyze:map-places -- "<YouTube URL or audio file>" "<destination>" [--output "<new.json>"]',
    );
  }

  if (outputPath && existsSync(outputPath)) {
    throw new ProviderError("OUTPUT_EXISTS", `Output file already exists at ${outputPath}; choose a new filename.`);
  }

  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);

  // Validate required keys
  for (const key of ["OPENAI_API_KEY", "GOOGLE_PLACES_API_KEY"]) {
    if (!process.env[key]?.trim()) {
      throw new ProviderError("API_KEY_MISSING", `Set ${key} in apps/web/.env.local.`);
    }
  }
  if (!process.env.GOOGLE_AI_API_KEY?.trim() && (input.includes("youtube") || input.includes("youtu.be"))) {
    throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_AI_API_KEY in apps/web/.env.local for YouTube video analysis.");
  }

  const timeout = (value: string | undefined) => (value?.trim() ? Number(value) : undefined);

  const result = await extractAndMapPlaces(input, {
    destination,
    geminiApiKey: process.env.GOOGLE_AI_API_KEY,
    geminiModel: process.env.GEMINI_TRANSCRIPTION_MODEL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_EXTRACTION_MODEL,
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS),
    onProgress(stage, detail) {
      clearInterval(heartbeat);
      stageStarted = Date.now();
      stageLabel = detail ?? stage;
      console.error(`[analyze:map-places] ${stageLabel}`);
      if (stage !== "completed") {
        heartbeat = setInterval(() => {
          console.error(
            `[analyze:map-places] Still working on ${stageLabel} (${Math.round((Date.now() - stageStarted) / 1000)}s)...`,
          );
        }, 10000);
        heartbeat.unref();
      }
    },
  });

  clearInterval(heartbeat);
  const json = JSON.stringify(result, null, 2);

  if (outputPath) {
    try {
      await writeFile(outputPath, json + "\n", { encoding: "utf8", flag: "wx" });
      console.error(`[analyze:map-places] Result saved to ${outputPath}`);
    } catch {
      throw new ProviderError("OUTPUT_WRITE_FAILED", "Could not write output file. Ensure parent directory exists.");
    }
  }

  console.log(json);
} catch (error) {
  clearInterval(heartbeat);
  const failure =
    error instanceof ProviderError || error instanceof YouTubeTranscriptError
      ? error
      : { code: "WORKFLOW_FAILED", message: (error as Error).message || "Check local provider configuration." };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  process.exitCode = 1;
}
