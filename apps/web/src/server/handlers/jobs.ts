import type { HandlerMap } from "../http/types";
import { runDueJobs } from "../jobs/queue";
import { config } from "../config";

// Background jobs. Owner: Member 4.
export const jobHandlers = {
  "jobs.runDue": async () => runDueJobs(config.isProduction ? 1 : 10),
} satisfies Partial<HandlerMap>;
