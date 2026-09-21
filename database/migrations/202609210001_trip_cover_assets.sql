-- Store owner-uploaded trip covers in the existing private asset bucket.
-- The database retains metadata and an asset id; image bytes never enter JSONB.
begin;

update public.reel_trips
set data = data || jsonb_build_object('coverAssetId', null)
where not (data ? 'coverAssetId');

create function public.reel_set_trip_cover(p_trip jsonb, p_asset jsonb, p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_data jsonb; result jsonb; owner text; previous_asset_id text; previous_size bigint := 0;
begin
  select data, owner_id into current_data, owner
  from public.reel_trips where id = p_trip->>'id' for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;

  if (current_data - 'currentItineraryVersion' - 'updatedAt') is distinct from
     (p_expected - 'currentItineraryVersion' - 'updatedAt') then
    raise exception using errcode = 'P0001', message = 'STALE_TRIP';
  end if;

  if p_asset->>'ownerId' is distinct from owner
    or p_asset->>'tripId' is distinct from current_data->>'id'
    or p_asset->>'id' is distinct from p_trip->>'coverAssetId'
    or (p_asset->>'size')::bigint not between 1 and 4194304
    or p_asset->>'contentType' not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception using errcode = '22023', message = 'Invalid trip cover metadata';
  end if;

  -- Serialize storage accounting across every trip owned by this user.
  perform id from public.reel_users where id = owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  previous_asset_id := current_data->>'coverAssetId';
  if previous_asset_id is not null then
    select coalesce((data->>'size')::bigint, 0) into previous_size
    from public.reel_assets where id = previous_asset_id;
    previous_size := coalesce(previous_size, 0);
  end if;
  if (select coalesce(sum((data->>'size')::bigint), 0) from public.reel_assets where owner_id = owner)
      - previous_size + (p_asset->>'size')::bigint > 104857600 then
    raise exception using errcode = 'P0001', message = 'TRIP_COVER_STORAGE_FULL';
  end if;

  result := p_trip || jsonb_build_object(
    'ownerId', current_data->'ownerId',
    'currentItineraryVersion', current_data->'currentItineraryVersion'
  );
  insert into public.reel_assets(id, data) values (p_asset->>'id', p_asset);
  update public.reel_trips set data = result where id = current_data->>'id';
  if previous_asset_id is not null and previous_asset_id is distinct from p_asset->>'id' then
    delete from public.reel_assets where id = previous_asset_id;
  end if;
  return result;
end $$;

revoke all on function public.reel_set_trip_cover(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reel_set_trip_cover(jsonb,jsonb,jsonb) to service_role;

commit;
