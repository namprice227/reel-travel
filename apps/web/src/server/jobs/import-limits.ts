// Keep these defaults aligned with reel_submit_import in the additive SQL migration.
export const IMPORT_REQUEST_LIMIT = { limit: 10, windowMs: 60_000 };
export const IMPORT_DAILY_LIMIT = 30;
export const IMPORT_ACTIVE_LIMIT = 5;
export const PRIVATE_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;
