-- Apply after prior migrations, before deploying the matching web code.
-- Stop import submissions during rollout. Existing duplicate active targets must be reviewed first;
-- this migration deliberately fails rather than deleting or arbitrarily cancelling their work.
begin;

create unique index reel_jobs_one_active_target on public.reel_jobs(target_id)
  where status in ('queued', 'running');

create function public.reel_update_trip_checked(p_data jsonb, p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; result jsonb;
begin
  select data into current_data from public.reel_trips where id = p_data->>'id' for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if (current_data - 'currentItineraryVersion' - 'updatedAt') is distinct from
     (p_expected - 'currentItineraryVersion' - 'updatedAt') then
    raise exception using errcode = 'P0001', message = 'STALE_TRIP';
  end if;
  result := p_data || jsonb_build_object('ownerId', current_data->'ownerId',
    'currentItineraryVersion', current_data->'currentItineraryVersion');
  update public.reel_trips set data = result where id = p_data->>'id';
  return result;
end $$;

create function public.reel_submit_import(p_inspiration jsonb, p_job jsonb, p_asset jsonb,
  p_recover boolean, p_details text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner text; source jsonb; active_job jsonb; result_job jsonb; quota jsonb;
  stamp timestamptz := clock_timestamp(); iso_stamp text;
begin
  select owner_id into owner from public.reel_trips where id = p_job->>'tripId';
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  -- Serialize submissions across every trip of this user, including daily/active/storage checks.
  perform id from public.reel_users where id = owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if p_job->>'targetId' is distinct from p_inspiration->>'id'
    or p_job->>'tripId' is distinct from p_inspiration->>'tripId'
    or p_job->>'status' is distinct from 'queued' or p_job->>'kind' is distinct from 'import_inspiration'
    or (p_job->>'attempt')::integer is distinct from 0 or (p_job->>'maxAttempts')::integer is distinct from 3 then
    raise exception using errcode = '22023', message = 'Invalid import input';
  end if;
  iso_stamp := to_char(stamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  result_job := p_job || jsonb_build_object('createdAt', iso_stamp, 'updatedAt', iso_stamp, 'runAfter', iso_stamp);
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
      where t.owner_id = owner and j.status in ('queued','running')) >= 5 then
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

revoke all on function public.reel_update_trip_checked(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reel_update_trip_checked(jsonb,jsonb) to service_role;
revoke all on function public.reel_submit_import(jsonb,jsonb,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.reel_submit_import(jsonb,jsonb,jsonb,boolean,text) to service_role;
update storage.buckets set file_size_limit = 4194304 where id = 'reel-private-uploads';
commit;
