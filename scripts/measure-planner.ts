/** Synthetic planner-only comparison. Does not measure network, AI, retries or monetary cost. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultTripPreferences } from "@reel/contracts";
import { generatePlan, toMinutes, type PlannablePlace, type PlannerContext, type PlanResult } from "@reel/planner";

const root = process.cwd();
const baselineRef = process.argv[2];
if (!baselineRef || !/^[a-f0-9]{7,40}$/.test(baselineRef)) {
  throw new Error("Usage: npm run measure:planner -- <baseline-commit-hash>");
}
const baselineCommit = execFileSync("git", ["rev-parse", "--verify", `${baselineRef}^{commit}`], { encoding: "utf8" }).trim();
fs.mkdirSync(path.join(root, ".local"), { recursive: true });
const snapshot = fs.mkdtempSync(path.join(root, ".local", "planner-baseline-"));
const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baselineCommit, "packages/planner/src"], { encoding: "utf8" })
  .trim().split(/\r?\n/).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
for (const file of files) {
  fs.writeFileSync(path.join(snapshot, path.basename(file)), execFileSync("git", ["show", `${baselineCommit}:${file}`]));
}
const baseline = (await import(pathToFileURL(path.join(snapshot, "generate.ts")).href)).generatePlan as typeof generatePlan;

const location = { lat: 35.68, lng: 139.76 };
const place = (placeId: string, overrides: Partial<PlannablePlace> = {}): PlannablePlace => ({
  placeId, title: `Synthetic ${placeId}`, location, visitMinutes: 60, sourceInspirationIds: [],
  openingHours: { status: "known", windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "09:00", close: "21:00" })) },
  ...overrides,
});
const base: PlannerContext = {
  startDate: "2026-10-01", endDate: "2026-10-01", timezone: "Asia/Tokyo", reservations: [], places: [],
  preferences: { ...defaultTripPreferences, breakMinutes: 0, accommodation: { name: "Synthetic hotel", location } },
};
const cases: Record<string, PlannerContext> = {
  late_opening: { ...base, places: [place("late", {
    openingHours: { status: "known", windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "10:20", close: "21:00" })) },
  }), place("open", { location: { lat: 35.681, lng: 139.761 } })] },
  budget_and_interest: { ...base, preferences: { ...base.preferences, dayEnd: "10:00", budget: "low", interests: ["art"] },
    places: [place("expensive", { priceLevel: 4, category: "museum" }), place("art", { priceLevel: 1, category: "art_museum" })] },
  unknown_hours: { ...base, places: [place("unknown", { openingHours: { status: "unknown" } })] },
  locked_booking: { ...base, places: [place("morning"), place("afternoon")], reservations: [{
    id: "synthetic-dinner", tripId: "synthetic-trip", title: "Synthetic locked dinner", placeId: null,
    start: "2026-10-01T19:30", end: "2026-10-01T21:00", locked: true, note: null,
    createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
  }] },
};

function measure(fn: typeof generatePlan, fixture: PlannerContext) {
  const runtimes: number[] = [];
  let result!: PlanResult;
  for (let i = 0; i < 220; i++) {
    let serial = 0;
    const ctx = structuredClone(fixture);
    ctx.newId = () => `synthetic-stop-${++serial}`;
    const start = performance.now();
    result = fn(ctx);
    const duration = performance.now() - start;
    if (i >= 20) runtimes.push(duration);
  }
  runtimes.sort((a, b) => a - b);
  let idleMinutes = 0;
  let travelMinutes = 0;
  let unknownTravelLegs = 0;
  for (const day of result.days) {
    let cursor = toMinutes(fixture.preferences.dayStart);
    for (const stop of day.stops) {
      if (stop.travelMinutesBefore === null) unknownTravelLegs++;
      else {
        idleMinutes += Math.max(0, toMinutes(stop.start) - cursor - stop.travelMinutesBefore);
        travelMinutes += stop.travelMinutesBefore;
      }
      cursor = Math.max(cursor, toMinutes(stop.end));
    }
  }
  return { samples: runtimes.length, p50Ms: runtimes[99], p95Ms: runtimes[189],
    idleMinutes: unknownTravelLegs ? null : idleMinutes, travelMinutes: unknownTravelLegs ? null : travelMinutes, unknownTravelLegs,
    scheduledPlaceIds: result.days.flatMap((day) => day.stops.flatMap((stop) => stop.placeId ? [stop.placeId] : [])),
    unscheduledPlaceIds: result.unscheduledPlaceIds, conflicts: result.conflicts.map((c) => c.code),
    validationStatus: result.validationStatus,
    bookings: result.days.flatMap((day) => day.stops.filter((s) => s.kind === "reservation").map((s) => ({ start: s.start, end: s.end }))),
  };
}

const output = {
  measuredAt: new Date().toISOString(), node: process.version, baselineCommit,
  candidate: "working tree", warmupRuns: 20,
  limitations: "Four fictional fixtures; planner-only in-process timings, baseline measured before candidate. No network, provider costs, retry costs, pilot data or statistical significance claims. Snapshots retained in ignored .local.",
  fixtures: Object.fromEntries(Object.entries(cases).map(([name, fixture]) => [name, {
    input: fixture, before: measure(baseline, fixture), after: measure(generatePlan, fixture),
  }])),
};
const outputPath = path.join(root, "evals", "results", "planner-comparison.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, outputPath)} (synthetic planner-only measurements).`);
