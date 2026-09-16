-- Apply once to Supabase with the SQL editor or psql, as the database owner.
-- Documents keep the shared TypeScript contracts; generated columns enforce/index relationships.
begin;

create table public.reel_users (
  id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  data jsonb not null,
  email text generated always as (lower(data->>'email')) stored not null unique,
  check (data->>'id' = id), check (id = auth_user_id::text)
);
create table public.reel_sessions (
  id text primary key, data jsonb not null,
  user_id text generated always as (data->>'userId') stored not null references public.reel_users(id) on delete cascade,
  expires_at text generated always as (data->>'expiresAt') stored not null,
  check (data->>'id' = id)
);
create index on public.reel_sessions(user_id);
create index on public.reel_sessions(expires_at);
create table public.reel_trips (
  id text primary key, data jsonb not null,
  owner_id text generated always as (data->>'ownerId') stored not null references public.reel_users(id) on delete cascade,
  check (data->>'id' = id), unique(id, owner_id)
);
create index on public.reel_trips(owner_id);

-- All trip children are scoped to a real trip, including after process/server restarts.
do $$
declare t text;
begin
  foreach t in array array['reservations','inspirations','places','itineraries','shares','jobs','assets'] loop
    execute format('create table public.reel_%I (
      id text primary key, data jsonb not null,
      trip_id text generated always as (data->>''tripId'') stored not null references public.reel_trips(id) on delete cascade,
      check (data->>''id'' = id))', t);
    execute format('create index on public.reel_%I(trip_id)', t);
  end loop;
end $$;

alter table public.reel_itineraries add column version integer generated always as ((data->>'version')::integer) stored not null;
alter table public.reel_itineraries add constraint reel_itinerary_version_unique unique(trip_id, version);
alter table public.reel_itineraries add constraint reel_itinerary_positive_version check(version > 0);
alter table public.reel_shares add column token_hash text generated always as (data->>'tokenHash') stored not null unique;
alter table public.reel_assets add column owner_id text generated always as (data->>'ownerId') stored not null;
alter table public.reel_assets add foreign key(trip_id, owner_id) references public.reel_trips(id, owner_id) on delete cascade;
alter table public.reel_jobs add column status text generated always as (data->>'status') stored not null;
alter table public.reel_jobs add column run_after text generated always as (data->>'runAfter') stored not null;
alter table public.reel_jobs add column updated_at text generated always as (data->>'updatedAt') stored not null;
alter table public.reel_jobs add column target_id text generated always as (data->>'targetId') stored not null;
create index on public.reel_jobs(status, run_after);
create index on public.reel_jobs(status, updated_at);
create index on public.reel_jobs(target_id);

create table public.reel_rate_limits (
  key text primary key, count integer not null check(count > 0), expires_at timestamptz not null
);
create index on public.reel_rate_limits(expires_at);

-- RLS with NO browser policies. All data goes through the owner-checked Next.js services.
-- Explicit grants avoid depending on a project's default table privileges.
do $$
declare t text;
begin
  foreach t in array array['users','sessions','trips','reservations','inspirations','places','itineraries','shares','jobs','assets','rate_limits'] loop
    execute format('alter table public.reel_%I enable row level security', t);
    execute format('revoke all on public.reel_%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.reel_%I to service_role', t);
  end loop;
end $$;

create function public.reel_save_itinerary(p_data jsonb, p_expected_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare trip jsonb; current_version integer;
begin
  select data into trip from public.reel_trips where id = p_data->>'tripId' for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  current_version := (trip->>'currentItineraryVersion')::integer;
  if current_version is distinct from p_expected_version
    or (p_data->>'version')::integer is distinct from coalesce(current_version, 0) + 1 then
    raise exception using errcode = 'P0001', message = 'STALE_VERSION',
      detail = jsonb_build_object('currentVersion', current_version)::text;
  end if;
  insert into public.reel_itineraries(id, data) values(p_data->>'id', p_data);
  update public.reel_trips set data = trip || jsonb_build_object(
    'currentItineraryVersion', (p_data->>'version')::integer, 'updatedAt', p_data->>'createdAt'
  ) where id = p_data->>'tripId';
end $$;

create function public.reel_update_trip(p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  update public.reel_trips set data = p_data || jsonb_build_object(
    'currentItineraryVersion', data->'currentItineraryVersion', 'ownerId', data->>'ownerId'
  ) where id = p_data->>'id' returning data into result;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  return result;
end $$;

create function public.reel_revoke_share(p_id text, p_revoked_at text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  update public.reel_shares set data = case when data->>'revokedAt' is null
    then data || jsonb_build_object('revokedAt', p_revoked_at) else data end
    where id = p_id returning data into result;
  return result;
end $$;

create function public.reel_view_share(p_id text, p_viewed_at text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  update public.reel_shares set data = case when data->>'revokedAt' is null
    and (data->>'lastViewedAt' is null or data->>'lastViewedAt' < p_viewed_at)
    then data || jsonb_build_object('lastViewedAt', p_viewed_at) else data end
    where id = p_id returning data into result;
  return result;
end $$;

create function public.reel_claim_job(p_id text, p_now text, p_stale_before text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  update public.reel_jobs set data = data || jsonb_build_object(
    'status', 'running', 'attempt', (data->>'attempt')::integer + 1, 'updatedAt', p_now
  ) where id = p_id and ((status = 'queued' and run_after <= p_now) or (status = 'running' and updated_at < p_stale_before))
    returning data into result;
  return result;
end $$;

create function public.reel_consume_rate_limit(p_key text, p_window_ms integer, p_limit integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); row public.reel_rate_limits;
begin
  if p_window_ms < 1 or p_limit < 1 or length(p_key) > 256 then
    raise exception using errcode = '22023', message = 'Invalid rate limit policy';
  end if;
  -- Bounded cleanup uses an expiry index. The DB clock is authoritative across application instances.
  delete from public.reel_rate_limits where key in (
    select key from public.reel_rate_limits where expires_at <= stamp and key <> p_key limit 100
  );
  insert into public.reel_rate_limits(key, count, expires_at)
    values(p_key, 1, stamp + p_window_ms * interval '1 millisecond')
  on conflict(key) do update set
    count = case when reel_rate_limits.expires_at <= stamp then 1 else least(reel_rate_limits.count + 1, p_limit + 1) end,
    expires_at = case when reel_rate_limits.expires_at <= stamp then excluded.expires_at else reel_rate_limits.expires_at end
  returning * into row;
  return jsonb_build_object('allowed', row.count <= p_limit, 'retryAfterSeconds',
    case when row.count <= p_limit then 0 else greatest(1, ceil(extract(epoch from row.expires_at - stamp))::integer) end);
end $$;

-- Immutable versions cannot be patched or deleted directly by the application service role.
revoke update, delete on public.reel_itineraries from service_role;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('reel_save_itinerary','reel_update_trip','reel_revoke_share',
      'reel_view_share','reel_claim_job','reel_consume_rate_limit') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Private bucket: no storage.objects policies grant browser access. The server proxies owner-checked bytes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reel-private-uploads', 'reel-private-uploads', false, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
