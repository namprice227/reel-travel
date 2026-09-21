import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOpenAIItineraryProvider } from "@reel/ai/openai-itinerary";
import type { ItineraryProvider } from "@reel/ai/itinerary";
import { baselineProvider, benchmarkItinerary } from "../evals/itinerary/benchmark";
import { itineraryCases } from "../evals/itinerary/cases";

const args = process.argv.slice(2);
const value = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const name = value("--provider") ?? "baseline";
const adapter = value("--adapter");
const maxAttempts = Number(value("--max-attempts") ?? (name === "baseline" && !adapter ? 1 : 2));
if (maxAttempts !== 1 && maxAttempts !== 2) throw Error("--max-attempts must be 1 or 2.");
const repeats = Number(value("--runs") ?? 1);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw Error("--runs must be 1 to 10.");
if ((name !== "baseline" || adapter) && !args.includes("--live")) throw Error("Use --live to permit provider calls. Default baseline is offline.");
let provider: ItineraryProvider | undefined;
if (adapter) provider = (await import(pathToFileURL(path.resolve(adapter)).href)).default as ItineraryProvider;
else if (name === "openai") provider = createOpenAIItineraryProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ITINERARY_MODEL });
else if (name !== "baseline") throw Error("Use --provider baseline|openai, or --adapter path/to/provider.ts.");
if (provider && (typeof provider.id !== "string" || typeof provider.generate !== "function")) throw Error("Adapter must default-export an ItineraryProvider.");
const cases = itineraryCases.filter(c => !value("--case") || c.id === value("--case"));
if (!cases.length) throw Error("Unknown --case.");
const rows = [];
for (let run = 1; run <= repeats; run++) for (const fixture of cases) {
  const input = structuredClone(fixture.input);
  const result = await benchmarkItinerary(input, provider ?? baselineProvider(input), { maxAttempts });
  rows.push({ caseId: fixture.id, run, ...result });
  console.log(`${fixture.id} run ${run}: ${result.accepted ? "accepted" : "rejected"}`);
}
const output = path.resolve(value("--out") ?? `.local/itinerary-benchmark-${Date.now()}.json`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ synthetic: true, split: "development-not-held-out", measuredAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), node: process.version,
  runs: rows.length, maxAttempts, attempts: rows.reduce((sum, r) => sum + r.attempts, 0), accepted: rows.filter(r => r.accepted).length, rows }, null, 2) + "\n");
console.log(`Wrote ${output}`);
