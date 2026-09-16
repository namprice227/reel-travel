-- Retirement script: the HTTP executor is local-fake-only as of 2026-09-17.
-- Run only if the earlier Supabase Cron job was installed. Run imports using apps/worker instead.
-- Does not modify unrelated schedules or Vault secrets.
select cron.unschedule(jobid) from cron.job where jobname = 'reel-import-retries';
