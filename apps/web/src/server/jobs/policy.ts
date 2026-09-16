// Every deployed worker uses the same bounds. An attempt must die before another worker can reclaim it.
export const IMPORT_ATTEMPT_TIMEOUT_MS = 15 * 60_000;
export const IMPORT_ABANDONED_AFTER_MS = 20 * 60_000;
export const exhaustedImportMessage = "Import failed after exhausting its attempts. Retry, or add details.";

export const abandonedBefore = (now = Date.now()) => new Date(now - IMPORT_ABANDONED_AFTER_MS).toISOString();
