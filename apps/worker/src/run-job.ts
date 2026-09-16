import { IMPORT_ATTEMPT_TIMEOUT_MS } from "../../web/src/server/jobs/policy";

// Independent deadline also applies if the supervisor disappears. IPC closes when the parent exits.
process.once("disconnect", () => process.exit(1));
const deadline = setTimeout(() => process.exit(124), IMPORT_ATTEMPT_TIMEOUT_MS);
try {
  const { config } = await import("../../web/src/server/config");
  if (config.dataBackend !== "supabase") throw new Error("Worker requires Supabase.");
  const id = process.argv[2];
  if (!id || !/^job_[a-z0-9]+$/.test(id)) throw new Error("Invalid job id.");
  const { runJob } = await import("../../web/src/server/jobs/queue");
  const outcome = await runJob(id);
  console.info(`[worker] job ${outcome}`);
} catch {
  console.error("[worker] attempt failed outside import handling; persisted state will be recovered");
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  // Exit after completed awaited writes; no provider work is allowed to outlive the attempt.
  process.exit(process.exitCode ?? 0);
}
