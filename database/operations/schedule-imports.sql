-- Run after connecting Supabase/Vercel. Enable pg_cron, pg_net and Vault in Supabase first.
-- In Vault create reel_web_url (HTTPS origin, no trailing slash) and reel_worker_secret
-- (same value as WORKER_SECRET in Vercel). Do not put either secret value in this repository.
-- Minute-level Supabase Cron avoids Vercel Hobby's daily-only cron restriction.
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name = 'reel_web_url')
    or not exists(select 1 from vault.decrypted_secrets where name = 'reel_worker_secret') then
    raise exception 'Create reel_web_url and reel_worker_secret in Vault first';
  end if;
end $$;
select cron.schedule('reel-import-retries', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reel_web_url') || '/api/internal/jobs/run-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'reel_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
