-- Account shelf for reels. Apply before deploying the matching web and worker code.
-- Existing trip saves and candidates stay attached to their original trips.
begin;

create table public.reel_account_reels (
  id text primary key, data jsonb not null,
  owner_id text generated always as (data->>'ownerId') stored not null references public.reel_users(id) on delete cascade,
  check (data->>'id' = id),
  unique (id, owner_id)
);
create index on public.reel_account_reels(owner_id);

create table public.reel_account_places (
  id text primary key, data jsonb not null,
  owner_id text generated always as (data->>'ownerId') stored not null,
  reel_id text generated always as (data->>'reelId') stored not null,
  check (data->>'id' = id),
  foreign key (reel_id, owner_id) references public.reel_account_reels(id, owner_id) on delete cascade
);
create index on public.reel_account_places(owner_id);
create index on public.reel_account_places(reel_id);

create table public.reel_account_reel_jobs (
  id text primary key, data jsonb not null,
  owner_id text generated always as (data->>'ownerId') stored not null references public.reel_users(id) on delete cascade,
  target_id text generated always as (data->>'targetId') stored not null,
  status text generated always as (data->>'status') stored not null,
  run_after text generated always as (data->>'runAfter') stored not null,
  updated_at text generated always as (data->>'updatedAt') stored not null,
  check (data->>'id' = id),
  foreign key (target_id, owner_id) references public.reel_account_reels(id, owner_id) on delete cascade
);
create index on public.reel_account_reel_jobs(status, run_after);
create index on public.reel_account_reel_jobs(status, updated_at);
create unique index reel_account_reel_one_active_job on public.reel_account_reel_jobs(target_id)
  where status in ('queued', 'running');

do $$
declare t text;
begin
  foreach t in array array['account_reels','account_places','account_reel_jobs'] loop
    execute format('alter table public.reel_%I enable row level security', t);
    execute format('revoke all on public.reel_%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.reel_%I to service_role', t);
  end loop;
end $$;

create function public.reel_submit_account_reel(p_reel jsonb, p_job jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner text := p_reel->>'ownerId'; quota jsonb;
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  source jsonb; work jsonb;
begin
  perform id from public.reel_users where id = owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if p_job->>'ownerId' is distinct from owner or p_job->>'targetId' is distinct from p_reel->>'id'
    or p_job->>'status' is distinct from 'queued' or p_reel->>'status' is distinct from 'queued'
    or (p_job->>'attempt')::integer is distinct from 0
    or (p_job->>'maxAttempts')::integer is distinct from 3 then
    raise exception using errcode = '22023', message = 'Invalid account reel input';
  end if;
  if (select count(*) from public.reel_jobs j join public.reel_trips t on t.id = j.trip_id
      where t.owner_id = owner and j.status in ('queued','running'))
    + (select count(*) from public.reel_account_reel_jobs where owner_id = owner and status in ('queued','running')) >= 5 then
    raise exception using errcode = 'P0001', message = 'IMPORT_ACTIVE_LIMIT', detail = '{"retryAfterSeconds":30}';
  end if;
  quota := public.reel_consume_rate_limit('import-day:' || owner, 86400000, 30);
  if not (quota->>'allowed')::boolean then
    raise exception using errcode = 'P0001', message = 'IMPORT_DAILY_LIMIT', detail = quota::text;
  end if;
  source := p_reel || jsonb_build_object('createdAt',stamp,'updatedAt',stamp);
  work := p_job || jsonb_build_object('createdAt',stamp,'updatedAt',stamp,'runAfter',stamp);
  insert into public.reel_account_reels(id,data) values(source->>'id',source);
  insert into public.reel_account_reel_jobs(id,data) values(work->>'id',work);
  return jsonb_build_object('reel',source,'job',work);
end $$;

create function public.reel_claim_account_reel(p_id text, p_now text, p_stale_before text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare work jsonb; source jsonb;
begin
  select data into work from public.reel_account_reel_jobs where id = p_id for update;
  if not found or not ((work->>'status' = 'queued' and work->>'runAfter' <= p_now)
    or (work->>'status' = 'running' and work->>'updatedAt' < p_stale_before)) then return null; end if;
  select data into source from public.reel_account_reels where id = work->>'targetId' for update;
  if not found then return null; end if;
  if (work->>'attempt')::integer >= (work->>'maxAttempts')::integer then
    work := work || jsonb_build_object('status','failed','lastError','Import attempt limit reached. Retry or add details.','updatedAt',p_now);
    source := source || jsonb_build_object('status','failed','failureCode','EXTRACTION_ERROR',
      'failureMessage','Import attempt limit reached. Retry or add details.','updatedAt',p_now);
  else
    work := work || jsonb_build_object('status','running','attempt',(work->>'attempt')::integer + 1,'updatedAt',p_now);
    source := source || jsonb_build_object('status','processing','attempts',(work->>'attempt')::integer,'updatedAt',p_now);
  end if;
  update public.reel_account_reel_jobs set data = work where id = p_id;
  update public.reel_account_reels set data = source where id = source->>'id';
  return work;
end $$;

create function public.reel_recover_account_reel(p_id text, p_owner text, p_text text, p_job jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actual_owner text; source jsonb; active_job jsonb; work jsonb; quota jsonb; details text;
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select owner_id into actual_owner from public.reel_account_reels where id = p_id;
  if actual_owner is distinct from p_owner then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  perform id from public.reel_users where id = p_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if p_job->>'ownerId' is distinct from p_owner or p_job->>'targetId' is distinct from p_id
    or p_job->>'status' is distinct from 'queued' or (p_job->>'attempt')::integer is distinct from 0
    or (p_job->>'maxAttempts')::integer is distinct from 3 then
    raise exception using errcode = '22023', message = 'Invalid account reel recovery';
  end if;
  select data into active_job from public.reel_account_reel_jobs
    where target_id = p_id and status in ('queued','running') for update;
  if found then raise exception using errcode = 'P0001', message = 'IMPORT_BUSY'; end if;
  select data into source from public.reel_account_reels where id = p_id and owner_id = p_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if source->>'status' not in ('needs_input','failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_NOT_RECOVERABLE';
  end if;
  details := concat_ws(E'\n', nullif(source->>'details',''), p_text);
  if length(details) > 10000 then raise exception using errcode = '22023', message = 'Details are too long'; end if;
  if (select count(*) from public.reel_jobs j join public.reel_trips t on t.id = j.trip_id
      where t.owner_id = p_owner and j.status in ('queued','running'))
    + (select count(*) from public.reel_account_reel_jobs where owner_id = p_owner and status in ('queued','running')) >= 5 then
    raise exception using errcode = 'P0001', message = 'IMPORT_ACTIVE_LIMIT', detail = '{"retryAfterSeconds":30}';
  end if;
  quota := public.reel_consume_rate_limit('import-day:' || p_owner, 86400000, 30);
  if not (quota->>'allowed')::boolean then
    raise exception using errcode = 'P0001', message = 'IMPORT_DAILY_LIMIT', detail = quota::text;
  end if;
  source := source || jsonb_build_object('details',details,'status','queued','failureCode',null,
    'failureMessage',null,'updatedAt',stamp);
  work := p_job || jsonb_build_object('createdAt',stamp,'updatedAt',stamp,'runAfter',stamp);
  update public.reel_account_reels set data = source where id = p_id;
  insert into public.reel_account_reel_jobs(id,data) values(work->>'id',work);
  return jsonb_build_object('reel',source,'job',work);
end $$;

create function public.reel_settle_account_reel(p_job jsonb, p_update jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare work jsonb; source jsonb; item jsonb; ids jsonb := '[]'::jsonb;
begin
  select data into work from public.reel_account_reel_jobs where id = p_job->>'id' for update;
  if not found or work->>'status' <> 'running'
    or (work->>'attempt')::integer is distinct from (p_job->>'attempt')::integer then return false; end if;
  select data into source from public.reel_account_reels where id = work->>'targetId' for update;
  if not found or source->>'ownerId' is distinct from work->>'ownerId'
    or p_job->>'ownerId' is distinct from work->>'ownerId'
    or coalesce(p_update->>'status','') not in ('queued','ready','needs_input','failed')
    or coalesce(p_job->>'status','') not in ('queued','succeeded','failed') then return false; end if;
  if p_update ? 'places' then
    if jsonb_typeof(p_update->'places') <> 'array' then return false; end if;
    for item in select value from jsonb_array_elements(p_update->'places') loop
      if item->>'ownerId' is distinct from source->>'ownerId' or item->>'reelId' is distinct from source->>'id' then return false; end if;
      ids := ids || to_jsonb(item->>'id');
    end loop;
    delete from public.reel_account_places where reel_id = source->>'id';
    for item in select value from jsonb_array_elements(p_update->'places') loop
      insert into public.reel_account_places(id,data) values(item->>'id',item);
    end loop;
    source := source || jsonb_build_object('placeIds',ids);
  end if;
  source := source || jsonb_build_object('status',p_update->>'status','failureCode',p_update->'failureCode',
    'failureMessage',p_update->'failureMessage','updatedAt',p_job->>'updatedAt');
  work := work || jsonb_build_object('status',p_job->>'status','runAfter',p_job->>'runAfter',
    'lastError',p_job->'lastError','updatedAt',p_job->>'updatedAt');
  update public.reel_account_reels set data = source where id = source->>'id';
  update public.reel_account_reel_jobs set data = work where id = work->>'id';
  return true;
end $$;

revoke all on function public.reel_submit_account_reel(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.reel_claim_account_reel(text,text,text) from public, anon, authenticated;
revoke all on function public.reel_recover_account_reel(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.reel_settle_account_reel(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reel_submit_account_reel(jsonb,jsonb) to service_role;
grant execute on function public.reel_claim_account_reel(text,text,text) to service_role;
grant execute on function public.reel_recover_account_reel(text,text,text,jsonb) to service_role;
grant execute on function public.reel_settle_account_reel(jsonb,jsonb) to service_role;

-- Keep the existing trip import path's active limit shared with account reels.
create or replace function public.reel_submit_import(p_inspiration jsonb, p_job jsonb, p_asset jsonb,
  p_recover boolean, p_details text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner text; source jsonb; active_job jsonb; result_job jsonb; quota jsonb;
  stamp timestamptz := clock_timestamp(); iso_stamp text;
begin
  select owner_id into owner from public.reel_trips where id = p_job->>'tripId';
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  perform id from public.reel_users where id = owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if p_job->>'targetId' is distinct from p_inspiration->>'id'
    or p_job->>'tripId' is distinct from p_inspiration->>'tripId'
    or p_job->>'status' is distinct from 'queued' or p_job->>'kind' is distinct from 'import_inspiration'
    or (p_job->>'attempt')::integer is distinct from 0 or (p_job->>'maxAttempts')::integer is distinct from 3 then
    raise exception using errcode = '22023', message = 'Invalid import input';
  end if;
  iso_stamp := to_char(stamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  result_job := p_job || jsonb_build_object('createdAt',iso_stamp,'updatedAt',iso_stamp,'runAfter',iso_stamp);
  if p_recover then
    select data into source from public.reel_inspirations
      where id = p_inspiration->>'id' and trip_id = p_job->>'tripId' for update;
    if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
    select data into active_job from public.reel_jobs
      where target_id = source->>'id' and status in ('queued','running');
    if found then
      if p_details is not null then raise exception using errcode = 'P0001', message = 'IMPORT_BUSY'; end if;
      return jsonb_build_object('inspiration', source, 'job', active_job);
    end if;
    if source->>'status' not in ('failed','needs_input') then
      raise exception using errcode = 'P0001', message = 'IMPORT_NOT_RECOVERABLE';
    end if;
    source := source || jsonb_build_object('status','queued','failureCode',null,'failureMessage',null,'updatedAt',iso_stamp);
    if p_details is not null then
      source := source || jsonb_build_object('details', concat_ws(E'\n', nullif(source->>'details',''), p_details));
    end if;
  else
    source := p_inspiration || jsonb_build_object('createdAt',iso_stamp,'updatedAt',iso_stamp);
    if source->>'status' is distinct from 'queued' then raise exception using errcode = '22023', message = 'Invalid import state'; end if;
  end if;
  if (select count(*) from public.reel_jobs j join public.reel_trips t on t.id = j.trip_id
      where t.owner_id = owner and j.status in ('queued','running'))
    + (select count(*) from public.reel_account_reel_jobs where owner_id = owner and status in ('queued','running')) >= 5 then
    raise exception using errcode = 'P0001', message = 'IMPORT_ACTIVE_LIMIT', detail = '{"retryAfterSeconds":30}';
  end if;
  if p_asset is not null then
    if p_recover or p_asset->>'ownerId' is distinct from owner or p_asset->>'tripId' is distinct from p_job->>'tripId'
      or p_asset->>'id' is distinct from source->>'assetId' or (p_asset->>'size')::bigint not between 1 and 4194304 then
      raise exception using errcode = '22023', message = 'Invalid asset input';
    end if;
    if (select coalesce(sum((data->>'size')::bigint),0) from public.reel_assets where owner_id = owner)
        + (p_asset->>'size')::bigint > 104857600 then
      raise exception using errcode = 'P0001', message = 'IMPORT_STORAGE_FULL';
    end if;
  end if;
  quota := public.reel_consume_rate_limit('import-day:' || owner, 86400000, 30);
  if not (quota->>'allowed')::boolean then
    raise exception using errcode = 'P0001', message = 'IMPORT_DAILY_LIMIT', detail = quota::text;
  end if;
  if p_recover then update public.reel_inspirations set data = source where id = source->>'id';
  else insert into public.reel_inspirations(id,data) values(source->>'id',source); end if;
  if p_asset is not null then insert into public.reel_assets(id,data) values(p_asset->>'id',p_asset); end if;
  insert into public.reel_jobs(id,data) values(result_job->>'id',result_job);
  return jsonb_build_object('inspiration',source,'job',result_job);
end $$;

commit;
