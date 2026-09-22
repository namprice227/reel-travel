import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { extractAndMapImagePlaces } from "../packages/ai/src/map-places";
import { ProviderError } from "../packages/ai/src/provider-request";

let heartbeat: ReturnType<typeof setInterval> | undefined;
let stageLabel = "";
let stageStarted = 0;

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      throw new ProviderError("INVALID_INPUT", `Unsupported image extension: ${ext}. Use PNG, JPEG, WebP, or GIF.`);
  }
}

try {
  const args = process.argv.slice(2);
  let imagePath = "";
  let destination = "";
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output") {
      outputPath = args[++i];
      if (!outputPath) {
        throw new ProviderError("INVALID_INPUT", "Must specify a filename after --output.");
      }
    } else if (!imagePath) {
      imagePath = args[i]!;
    } else if (!destination) {
      destination = args[i]!;
    } else {
      throw new ProviderError(
        "INVALID_INPUT",
        'Unexpected extra argument. Usage: npm run analyze:image -- "<image file>" "<destination>" [--output "<new.json>"]',
      );
    }
  }

  if (!imagePath || !destination) {
    throw new ProviderError(
      "INVALID_INPUT",
      'Usage: npm run analyze:image -- "<image file>" "<destination>" [--output "<new.json>"]',
    );
  }

  if (!existsSync(imagePath)) {
    throw new ProviderError("INVALID_INPUT", `Image file not found: ${imagePath}`);
  }

  if (outputPath && existsSync(outputPath)) {
    throw new ProviderError("OUTPUT_EXISTS", `Output file already exists at ${outputPath}; choose a new filename.`);
  }

  const envFile = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);

  // Validate required keys (Places key optional when Gemini Search tool is used)
  for (const key of ["GOOGLE_AI_API_KEY", "OPENAI_API_KEY"]) {
    if (!process.env[key]?.trim()) {
      throw new ProviderError("API_KEY_MISSING", `Set ${key} in apps/web/.env.local.`);
    }
  }

  const contentType = detectContentType(imagePath);
  const bytes = new Uint8Array(await readFile(imagePath));
  const timeout = (value: string | undefined) => (value?.trim() ? Number(value) : undefined);

  const result = await extractAndMapImagePlaces(
    { bytes, contentType },
    {
      destination,
      geminiApiKey: process.env.GOOGLE_AI_API_KEY,
      geminiModel: process.env.GEMINI_IMAGE_MODEL || process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.5-flash-lite",
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_EXTRACTION_MODEL,
      googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS),
      onProgress(stage, detail) {
        clearInterval(heartbeat);
        stageStarted = Date.now();
        stageLabel =
          stage === "observation"
            ? "Gemini: reading visual observations, signs, and landmarks"
            : stage === "extraction"
              ? "OpenAI: extracting structured travel stops"
              : stage === "mapping"
                ? `Places: ${detail ?? "mapping to candidate places"}`
                : "Completed";

        console.error(`[analyze:image] ${stageLabel}`);
        if (stage !== "completed") {
          heartbeat = setInterval(() => {
            const elapsed = Math.round((Date.now() - stageStarted) / 1000);
            console.error(`[analyze:image] Still in ${stage} stage (${elapsed}s)...`);
          }, 15000);
          heartbeat.unref();
        }
      },
    },
  );

  clearInterval(heartbeat);
  const json = JSON.stringify(result, null, 2);

  if (outputPath) {
    try {
      await writeFile(outputPath, json + "\n", { encoding: "utf8", flag: "wx" });
      console.error(`[analyze:image] Results saved to ${outputPath}`);
    } catch {
      throw new ProviderError("OUTPUT_WRITE_FAILED", "Could not write to output path.");
    }
  }

  console.log(json);
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
} catch (error) {
  const failure =
    error instanceof ProviderError
      ? error
      : { code: "IMAGE_ANALYSIS_FAILED", message: error instanceof Error ? error.message : String(error) };
  console.error(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
}
