-- Apply after 202609180001_atomic_imports.sql. Stop old workers before deploying new code.
-- Shared lock order: user -> job(s) -> inspiration. Submit/recover already lock the user.
begin;

create function public.reel_skip_import(p_id text, p_now text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source jsonb;
begin
  perform u.id from public.reel_users u join public.reel_trips t on t.owner_id = u.id
    join public.reel_inspirations i on i.trip_id = t.id where i.id = p_id for update of u;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  perform id from public.reel_jobs where target_id = p_id and status in ('queued','running') order by id for update;
  select data into source from public.reel_inspirations where id = p_id for update;
  if source->>'status' not in ('queued','failed','needs_input','skipped') then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_SKIPPABLE';
  end if;
  source := source || jsonb_build_object('status','skipped','updatedAt',p_now);
  update public.reel_inspirations set data = source where id = p_id;
  update public.reel_jobs set data = data || jsonb_build_object('status','cancelled','updatedAt',p_now,'lastError',null)
    where target_id = p_id and status in ('queued','running');
  return source;
end $$;

create function public.reel_transition_import(p_id text, p_changes jsonb, p_now text, p_job_id text, p_attempt integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source jsonb;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or p_changes - array['status','failureCode','failureMessage','placeIds'] <> '{}'::jsonb
    or (p_changes ? 'status' and coalesce(p_changes->>'status','') not in ('processing','queued','failed','needs_input','needs_confirmation','ready')) then
    raise exception using errcode = '22023', message = 'Invalid import patch';
  end if;
  perform u.id from public.reel_users u join public.reel_trips t on t.owner_id = u.id
    join public.reel_inspirations i on i.trip_id = t.id where i.id = p_id for update of u;
  if not found then return null; end if;
  if p_job_id is not null then
    perform id from public.reel_jobs where id = p_job_id and target_id = p_id
      and status = 'running' and (data->>'attempt')::integer = p_attempt for update;
    if not found then return null; end if;
  end if;
  select data into source from public.reel_inspirations where id = p_id for update;
  if not found or source->>'status' = 'skipped' then return null; end if;
  source := source || p_changes || jsonb_build_object('updatedAt',p_now);
  if p_changes->>'status' = 'processing' then
    source := source || jsonb_build_object('attempts',coalesce((source->>'attempts')::integer,0)+1);
  end if;
  update public.reel_inspirations set data = source where id = p_id;
  return source;
end $$;

create function public.reel_settle_import_job(p_job jsonb, p_changes jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_job jsonb; source jsonb;
begin
  if coalesce(p_job->>'status','') not in ('queued','succeeded','failed')
    or (p_changes is not null and (jsonb_typeof(p_changes) <> 'object'
      or p_changes - array['status','failureCode','failureMessage','placeIds'] <> '{}'::jsonb
      or (p_changes ? 'status' and coalesce(p_changes->>'status','') not in ('queued','failed')))) then
    raise exception using errcode = '22023', message = 'Invalid job settlement';
  end if;
  perform u.id from public.reel_users u join public.reel_trips t on t.owner_id = u.id
    join public.reel_jobs j on j.trip_id = t.id where j.id = p_job->>'id' for update of u;
  if not found then return false; end if;
  select data into current_job from public.reel_jobs where id = p_job->>'id' for update;
  if not found or current_job->>'status' <> 'running'
    or (current_job->>'attempt')::integer is distinct from (p_job->>'attempt')::integer then return false; end if;
  select data into source from public.reel_inspirations where id = current_job->>'targetId' for update;
  if source->>'status' = 'skipped' then
    update public.reel_jobs set data = current_job || jsonb_build_object('status','cancelled','lastError',null,'updatedAt',p_job->>'updatedAt')
      where id = current_job->>'id';
    return false;
  end if;
  if source is not null and p_changes is not null then
    update public.reel_inspirations set data = source || p_changes || jsonb_build_object('updatedAt',p_job->>'updatedAt')
      where id = source->>'id';
  end if;
  update public.reel_jobs set data = current_job || jsonb_build_object('status',p_job->>'status',
    'lastError',p_job->'lastError','runAfter',p_job->>'runAfter','updatedAt',p_job->>'updatedAt')
    where id = current_job->>'id';
  return true;
end $$;

revoke all on function public.reel_skip_import(text,text) from public, anon, authenticated;
revoke all on function public.reel_transition_import(text,jsonb,text,text,integer) from public, anon, authenticated;
revoke all on function public.reel_settle_import_job(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reel_skip_import(text,text) to service_role;
grant execute on function public.reel_transition_import(text,jsonb,text,text,integer) to service_role;
grant execute on function public.reel_settle_import_job(jsonb,jsonb) to service_role;

-- Honor earlier explicit skips; release their abandoned active capacity without refunding daily usage.
update public.reel_jobs j set data = j.data || jsonb_build_object('status','cancelled','lastError',null,
  'updatedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
from public.reel_inspirations i where i.id = j.target_id and i.data->>'status' = 'skipped'
  and j.status in ('queued','running');
commit;
