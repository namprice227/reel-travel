import type { Inspiration, Job } from "@reel/contracts";
import { repos } from "../db";
import { newId, nowIso } from "../ids";
import { markImportFailed, markImportQueued, processImport } from "./import-inspiration";

// Durable job execution (owner: Member 4). Jobs are rows, so progress survives restarts.
// In dev, handlers run a job right after the response; apps/worker (or a cron) calls runDueJobs()
// for retries and abandoned runs.

export const MAX_IMPORT_ATTEMPTS = 3;
const RETRY_DELAY_SECONDS = [10, 60];
const ABANDONED_AFTER_MINUTES = 5;

export async function enqueueImport(inspiration: Inspiration): Promise<Job> {
  const now = nowIso();
  const job: Job = {
    id: newId("job"),
    tripId: inspiration.tripId,
    kind: "import_inspiration",
    targetId: inspiration.id,
    status: "queued",
    attempt: 0,
    maxAttempts: MAX_IMPORT_ATTEMPTS,
    runAfter: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await repos().jobs.insert(job);
  return job;
}

export type JobOutcome = "succeeded" | "retrying" | "failed" | "not_run";

/** Run one job if it is due. Safe to call concurrently: only one caller claims it. */
export async function runJob(jobId: string): Promise<JobOutcome> {
  const r = repos();
  const job = await r.jobs.claim(jobId, { now: nowIso(), staleBefore: abandonedBefore() });
  if (!job) return "not_run";

  try {
    await processImport(job.targetId);
    await r.jobs.update({ ...job, status: "succeeded", lastError: null, updatedAt: nowIso() });
    return "succeeded";
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    if (job.attempt < job.maxAttempts) {
      const delaySeconds = RETRY_DELAY_SECONDS[job.attempt - 1] ?? 60;
      const runAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
      await r.jobs.update({ ...job, status: "queued", lastError, runAfter, updatedAt: nowIso() });
      await markImportQueued(job.targetId);
      return "retrying";
    }
    await r.jobs.update({ ...job, status: "failed", lastError, updatedAt: nowIso() });
    await markImportFailed(job.targetId, job.attempt);
    return "failed";
  }
}

export async function runDueJobs(limit = 10): Promise<{ processed: number; succeeded: number; failed: number }> {
  const due = await repos().jobs.listDue({ now: nowIso(), staleBefore: abandonedBefore(), limit });
  const tally = { processed: 0, succeeded: 0, failed: 0 };
  for (const job of due) {
    const outcome = await runJob(job.id);
    if (outcome === "not_run") continue;
    tally.processed += 1;
    if (outcome === "succeeded") tally.succeeded += 1;
    if (outcome === "failed") tally.failed += 1;
  }
  return tally;
}

const abandonedBefore = () => new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60_000).toISOString();
