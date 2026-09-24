import { repos } from "../db";
import { runJob, type JobOutcome } from "./queue";

// Inline execution for development without the worker (ENABLE_INLINE_IMPORTS). The worker remains the
// durable path; this only keeps a request's own job moving until it settles.

/** The database stamps runAfter with its clock; this process may run slightly behind it. */
export const CLOCK_SKEW_ALLOWANCE_MS = 2_000;
/** First attempt, up to two retries, and a few not-yet-due passes. */
const MAX_PASSES = 8;

export interface InlineDeps {
  run: (jobId: string) => Promise<JobOutcome>;
  /** runAfter of a still-queued job; null once it is running elsewhere, finished or gone. */
  dueAt: (jobId: string) => Promise<string | null>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaults: InlineDeps = {
  run: runJob,
  async dueAt(jobId) {
    const job = jobId.startsWith("reeljob_") ? await repos().accountReels.getJob(jobId) : await repos().jobs.get(jobId);
    return job?.status === "queued" ? job.runAfter : null;
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/**
 * Run a job now and follow up in-process: a claim declined because this clock is behind the database's,
 * or a scheduled retry after a busy provider, runs again once due. Stops when the job settles or another
 * runner (the worker) has claimed it.
 */
export async function runJobInline(jobId: string, overrides: Partial<InlineDeps> = {}): Promise<JobOutcome> {
  const deps = { ...defaults, ...overrides };
  let outcome: JobOutcome = "not_run";
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    outcome = await deps.run(jobId);
    if (outcome === "succeeded" || outcome === "failed") return outcome;
    const due = await deps.dueAt(jobId);
    if (!due) return outcome;
    await deps.sleep(Math.max(0, Date.parse(due) - deps.now()) + CLOCK_SKEW_ALLOWANCE_MS);
  }
  return outcome;
}
