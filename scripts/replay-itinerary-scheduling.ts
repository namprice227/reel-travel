/** Offline regression replay. No model/provider calls; this does not benchmark the v6 prompt. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { compileProposal, scheduleProposal, type PlannerContext, type PlanResult } from "@reel/planner";
const source = "evals/results/itinerary-2026-09-22/main";
const output = "evals/results/itinerary-scheduling-2026-09-23";
const manifest = JSON.parse(await readFile(`${source}/manifest.json`, "utf8"));
const fixtures = new Map<string, { input: PlannerContext; feasible: boolean }>(manifest.fixtures.map((f: any) => [f.id, f]));
const raw = await readFile(`${source}/rows.jsonl`, "utf8");
const sources = ["packages/planner/src/schedule.ts", "packages/planner/src/quality.ts", "packages/planner/src/nearby.ts", "packages/planner/src/proposal.ts", "packages/planner/src/validate.ts"];
const checksums = await Promise.all(sources.map(async path => ({ path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") })));
const evaluate = (run: () => PlanResult) => {
  try {
    const plan = run();
    return { accepted: true, scheduledIds: [...new Set(plan.days.flatMap(d => d.stops.flatMap(s => s.placeId ? [s.placeId] : [])))],
      unscheduled: plan.unscheduledPlaceIds, quality: plan.quality ?? null };
  } catch (error) { return { accepted: false, scheduledIds: [], issues: (error as { issues?: string[] }).issues ?? ["ERROR"] }; }
};
const rows = raw.trim().split("\n").map(line => {
  const row = JSON.parse(line); const fixture = fixtures.get(row.caseId)!;
  const proposal = row.attemptDetails[0]?.response?.proposal;
  let counter = 0;
  const ctx = { ...structuredClone(fixture.input), newId: () => `replay-${++counter}` };
  return { provider: row.provider, caseId: row.caseId, feasible: fixture.feasible,
    hasFirstResponse: !!proposal,
    before: proposal ? evaluate(() => compileProposal(proposal, ctx)) : null,
    after: proposal ? evaluate(() => scheduleProposal(proposal, ctx)) : null };
});
const summary = [...new Set(rows.map(r => r.provider))].map(provider => {
  const eligible = rows.filter(r => r.provider === provider && r.feasible && r.hasFirstResponse);
  return { provider, replayableFeasibleCases: eligible.length,
    strictFirstResponseAccepted: eligible.filter(r => r.before?.accepted).length,
    scheduledFirstResponseAccepted: eligible.filter(r => r.after?.accepted).length,
    beforeSavedIds: eligible.reduce((n, r) => n + (r.before?.scheduledIds.length ?? 0), 0),
    afterSavedIds: eligible.reduce((n, r) => n + (r.after?.scheduledIds.length ?? 0), 0),
    impossibleBookingRejected: rows.filter(r => r.provider === provider && !r.feasible && r.hasFirstResponse && !r.after?.accepted).length };
});
await mkdir(output, { recursive: true });
await writeFile(`${output}/replay.json`, JSON.stringify({ executedAt: new Date().toISOString(),
  method: "Replay only the first raw v5 response with the old strict compiler and new deterministic scheduler; no new provider calls or model quality claims. Provider failures remain excluded and explicitly counted. Synthetic regression set, not held-out.",
  source, sourceSha256: createHash("sha256").update(raw).digest("hex"), checksums, summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
