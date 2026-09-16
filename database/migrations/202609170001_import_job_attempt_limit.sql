-- Apply AFTER 202609160001_supabase.sql; upgrade existing projects without recreating their tables.
begin;
create or replace function public.reel_claim_job(p_id text, p_now text, p_stale_before text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job jsonb; result jsonb;
  exhausted_message constant text := 'Import failed after exhausting its attempts. Retry, or add details.';
begin
  select data into job from public.reel_jobs where id = p_id
    and ((status = 'queued' and run_after <= p_now) or (status = 'running' and updated_at < p_stale_before))
    for update;
  if not found then return null; end if;
  if (job->>'attempt')::integer >= (job->>'maxAttempts')::integer then
    result := job || jsonb_build_object('status', 'failed', 'lastError', exhausted_message, 'updatedAt', p_now);
    -- Same transaction: keep skipped/finished saves intact and preserve source/partial place references.
    update public.reel_inspirations set data = data || jsonb_build_object(
      'status', 'failed', 'failureCode', 'EXTRACTION_ERROR', 'failureMessage', exhausted_message,
      'attempts', greatest(coalesce((data->>'attempts')::integer, 0), (job->>'attempt')::integer), 'updatedAt', p_now
    ) where id = job->>'targetId' and trip_id = job->>'tripId' and data->>'status' in ('queued', 'processing');
  else
    result := job || jsonb_build_object('status', 'running', 'attempt', (job->>'attempt')::integer + 1, 'updatedAt', p_now);
  end if;
  update public.reel_jobs set data = result where id = p_id;
  return result;
end $$;
revoke all on function public.reel_claim_job(text, text, text) from public, anon, authenticated;
grant execute on function public.reel_claim_job(text, text, text) to service_role;
commit;
