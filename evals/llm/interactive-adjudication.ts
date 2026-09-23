import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { DatasetSchema, type Dataset } from "./schema";
import { evaluate, replayHistorical, type Row } from "./benchmark";
import { rowKey, scoringReview, validateAdjudication, type adjudicationDraft } from "./adjudication";
import { predictionKey } from "./metrics";
import type { Ask } from "./youtube-review";
type Review = ReturnType<typeof adjudicationDraft>;
const pricing = { currency: "USD" as const, models: {} };
export async function adjudicateInteractively(original: Review, dataset: Dataset, rows: Row[], ask: Ask, show: (text: string) => void) {
  const doc = structuredClone(original);
  const answer = async (question: string) => {
    const value = (await ask(question)).trim();
    if (value.toUpperCase() === "Q") throw Error("Adjudication cancelled; nothing saved");
    return value;
  };
  const reason = async () => { for (;;) { const value = await answer("Decision reason (required): "); if (value) return value; } };
  show("Adjudicate saved responses only. Q cancels without saving. Lookup results are not source evidence.");
  for (const c of doc.cases) {
    show("Source scope: " + JSON.stringify(c.caseId));
    show(JSON.stringify(dataset.cases.find(item => item.id === c.caseId), null, 2));
    show("Ground-truth indices (zero-based): " + JSON.stringify(c.entities));
    show("Existing exclusions: " + JSON.stringify(c.exclusions));
    for (;;) {
      const input = await answer("Additional incidental/ambiguous truth indices to exclude, comma-separated (blank keeps current): ");
      if (!input) break;
      const tokens = input.split(",").map(s => s.trim());
      if (tokens.some(s => !/^\d+$/.test(s) || !c.entities.some(e => e.truthIndex === Number(s)))) { show("Invalid truth index."); continue; }
      const why = await reason();
      for (const index of new Set(tokens.map(Number))) if (!c.exclusions.some(e => e.truthIndex === index)) c.exclusions.push({ truthIndex: index, reason: why });
      break;
    }
    for (;;) {
      if (await answer("Type SCOPE to confirm remaining entities were intentionally presented/recommended by the source: ") === "SCOPE") { c.scopeConfirmed = true; break; }
      show("Scope confirmation required.");
    }
  }
  // Temporary in-memory activation permits preview scoring, never persistence without final confirmation.
  doc.reviewer = "Interactive preview"; doc.confirmation = "ADJUDICATED";
  const assess = (row: Row) => evaluate(dataset.cases.find(c => c.id === row.caseId)!, row, pricing, scoringReview(doc, row)).score;
  for (const row of rows) {
    const record = doc.rows.find(r => r.rowKey === rowKey(row))!;
    for (const item of assess(row).manualReview) {
      const entry = record.entries.find(e => e.predictionKey === predictionKey(item.prediction))!;
      show(row.provider + "/" + row.requestedModel + " ? unresolved entity:");
      show(JSON.stringify(item, null, 2));
      show("Suggested truth indices: " + JSON.stringify(entry.suggestedTruthIndices.map(i =>
        ({ truthIndex: i, label: dataset.cases.find(c => c.id === row.caseId)!.ground_truth[i] }))));
      for (;;) {
        const choice = (await answer("C correct match | I incorrect/unsupported | X ambiguous/excluded | Q cancel: ")).toUpperCase();
        if (!["C", "I", "X"].includes(choice)) { show("Choose C, I or X."); continue; }
        let truthIndex: number | null = null;
        if (choice === "C") {
          const input = await answer("Correct ground-truth index (zero-based): ");
          truthIndex = Number(input);
          const scope = doc.cases.find(c => c.caseId === row.caseId)!;
          if (!/^\d+$/.test(input) || !scope.entities.some(e => e.truthIndex === truthIndex) || scope.exclusions.some(e => e.truthIndex === truthIndex)) {
            show("Choose an existing non-excluded truth index."); continue;
          }
        }
        entry.outcome = choice === "C" ? "correct" : choice === "I" ? "incorrect" : "excluded";
        entry.truthIndex = truthIndex; entry.reason = await reason(); break;
      }
    }
    for (const claim of assess(row).locationClaims.filter(l => l.status === "unresolved" &&
      !assess(row).incorrect.some(p => predictionKey(p) === predictionKey(l.prediction)))) {
      const entry = record.entries.find(e => e.predictionKey === predictionKey(claim.prediction))!;
      show("Unresolved source location claim: " + JSON.stringify(claim.prediction));
      for (;;) {
        const choice = (await answer("S source-supported | U unsupported | X ambiguous/excluded | Q cancel: ")).toUpperCase();
        if (!["S", "U", "X"].includes(choice)) continue;
        entry.location = choice === "S" ? "supported" : choice === "U" ? "unsupported" : "excluded";
        entry.reason = [entry.reason, await reason()].filter(Boolean).join("; ");
        try { assess(row); break; } catch { entry.location = "auto"; show("Decision rejected by source-evidence validation. Choose again."); }
      }
    }
  }
  for (const row of rows) {
    const result = assess(row);
    if (!result.audit.finalized || result.audit.locationUnresolved) throw Error("Adjudication remains unresolved; nothing saved");
  }
  show("Final scope exclusions and decisions:");
  show(JSON.stringify({ cases: doc.cases, rows: doc.rows.map(r => ({ provider: r.provider, caseId: r.caseId,
    decisions: r.entries.filter(e => e.outcome !== "auto" || e.location !== "auto") })) }, null, 2));
  for (;;) { const reviewer = await answer("Reviewer name or pseudonym: "); if (reviewer) { doc.reviewer = reviewer; break; } }
  if (await answer("Type ADJUDICATED to save these decisions: ") !== "ADJUDICATED") throw Error("Adjudication not confirmed; nothing saved");
  return validateAdjudication(doc, dataset, rows);
}
export async function adjudicateRun(dir: string, options: { ask?: Ask; show?: (text: string) => void; replayCommand: string }) {
  const show = options.show ?? console.log;
  if (!options.ask && (!process.stdin.isTTY || !process.stdout.isTTY)) throw Error("Adjudication requires an interactive terminal");
  const files = ["dataset.json", "cache.json", "evaluation-review.json"].map(name => path.join(dir, name));
  const snapshots = await Promise.all(files.map(f => readFile(f, "utf8")));
  const dataset = DatasetSchema.parse(JSON.parse(snapshots[0]));
  const report = await readFile(path.join(dir, "llm-place-extraction-results.json"), "utf8").catch(() => "null");
  const cache = replayHistorical(JSON.parse(snapshots[1]), dataset, JSON.parse(report)).cache;
  const doc = validateAdjudication(JSON.parse(snapshots[2]), dataset, cache.rows);
  const terminal = options.ask ? undefined : createInterface({ input: process.stdin, output: process.stdout });
  try {
    const completed = await adjudicateInteractively(doc, dataset, cache.rows, options.ask ?? (q => terminal!.question(q)), show);
    const current = await Promise.all(files.map(f => readFile(f, "utf8")));
    if (current.some((text, i) => text !== snapshots[i])) throw Error("Adjudication inputs changed during review; nothing saved");
    const temp = files[2] + ".tmp";
    await writeFile(temp, JSON.stringify(completed, null, 2) + "\n", { mode: 0o600 });
    await rename(temp, files[2]);
    show("Adjudication saved. Unresolved matches: 0. Replay offline:");
    show(options.replayCommand);
  } finally { terminal?.close(); }
}
