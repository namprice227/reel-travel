import type { HandlerMap } from "../http/types";
import { runDueJobs } from "../jobs/queue";

// Background jobs. Owner: Member 4.
export const jobHandlers = {
  "jobs.runDue": async () => runDueJobs(),
} satisfies Partial<HandlerMap>;
