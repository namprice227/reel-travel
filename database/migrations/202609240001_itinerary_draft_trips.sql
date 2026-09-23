-- Itinerary reels become draft trips. Apply after 202609230001_account_reels.sql and before deploying
-- the matching web and worker code. Trip and reel fields live in JSONB, so no column changes are needed:
-- draft trips have status "draft" and null dates/timezone until the traveler adds them.
begin;

-- While the attempt still owns its job, insert the draft trip once and link it to the reel.
-- A retried attempt receives the already-linked trip instead of creating another one.
create function public.reel_attach_account_reel_trip(p_job jsonb, p_trip jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare work jsonb; source jsonb; linked jsonb;
begin
  select data into work from public.reel_account_reel_jobs where id = p_job->>'id' for update;
  if not found or work->>'status' <> 'running'
    or (work->>'attempt')::integer is distinct from (p_job->>'attempt')::integer then return null; end if;
  select data into source from public.reel_account_reels where id = work->>'targetId' for update;
  if not found or source->>'ownerId' is distinct from work->>'ownerId' then return null; end if;
  if p_trip->>'ownerId' is distinct from source->>'ownerId' or p_trip->>'status' is distinct from 'draft'
    or p_trip->'draft'->>'sourceReelId' is distinct from source->>'id' then
    raise exception using errcode = '22023', message = 'Invalid draft trip input';
  end if;
  if source->>'tripId' is not null then
    select data into linked from public.reel_trips where id = source->>'tripId' and owner_id = source->>'ownerId';
    if found then return linked; end if;
  end if;
  insert into public.reel_trips(id, data) values (p_trip->>'id', p_trip);
  update public.reel_account_reels
    set data = source || jsonb_build_object('tripId', p_trip->>'id', 'format', 'itinerary', 'updatedAt', p_trip->>'createdAt')
    where id = source->>'id';
  return p_trip;
end $$;

-- Undo an automatic draft: delete the still-draft trip (children cascade) and keep its places as ideas.
create function public.reel_convert_draft_to_ideas(p_reel_id text, p_owner text, p_places jsonb, p_now text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source jsonb; draft jsonb; item jsonb; ids jsonb := '[]'::jsonb;
begin
  select data into source from public.reel_account_reels where id = p_reel_id and owner_id = p_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  select data into draft from public.reel_trips where id = source->>'tripId' and owner_id = p_owner for update;
  if not found or draft->>'status' is distinct from 'draft' then
    raise exception using errcode = '22023', message = 'DRAFT_NOT_CONVERTIBLE';
  end if;
  if jsonb_typeof(p_places) <> 'array' then raise exception using errcode = '22023', message = 'Invalid place ideas'; end if;
  for item in select value from jsonb_array_elements(p_places) loop
    if item->>'ownerId' is distinct from p_owner or item->>'reelId' is distinct from p_reel_id then
      raise exception using errcode = '22023', message = 'Invalid place ideas';
    end if;
    ids := ids || to_jsonb(item->>'id');
  end loop;
  delete from public.reel_trips where id = draft->>'id';
  delete from public.reel_account_places where reel_id = p_reel_id;
  for item in select value from jsonb_array_elements(p_places) loop
    insert into public.reel_account_places(id, data) values (item->>'id', item);
  end loop;
  source := source || jsonb_build_object('tripId', null, 'format', 'places', 'placeIds', ids, 'updatedAt', p_now);
  update public.reel_account_reels set data = source where id = p_reel_id;
  return source;
end $$;

revoke all on function public.reel_attach_account_reel_trip(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.reel_convert_draft_to_ideas(text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.reel_attach_account_reel_trip(jsonb,jsonb) to service_role;
grant execute on function public.reel_convert_draft_to_ideas(text,text,jsonb,text) to service_role;

commit;
