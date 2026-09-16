import type { HandlerMap } from "../http/types";
import { runDueJobs } from "../jobs/queue";
import { config } from "../config";
import { AppError } from "../errors";

// Background jobs. Owner: Member 4.
export const jobHandlers = {
  "jobs.runDue": async () => {
    if (!config.inlineImportsEnabled) throw new AppError("FORBIDDEN", "Imports run in the dedicated worker in this environment.");
    return runDueJobs(10);
  },
} satisfies Partial<HandlerMap>;
