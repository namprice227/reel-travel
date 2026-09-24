-- Unsupported-country itineraries stay place ideas. Apply after 202609240001_itinerary_draft_trips.sql;
-- this function was split out because that migration had already been applied.
begin;

-- While the attempt still owns its job, record how the source presents itself. An itinerary for a country
-- trips do not support stays place ideas; "itinerary" with no tripId lets the app explain why.
create function public.reel_record_account_reel_format(p_job jsonb, p_format text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare work jsonb;
begin
  if p_format not in ('itinerary', 'places') then raise exception using errcode = '22023', message = 'Invalid format'; end if;
  select data into work from public.reel_account_reel_jobs where id = p_job->>'id' for update;
  if not found or work->>'status' <> 'running'
    or (work->>'attempt')::integer is distinct from (p_job->>'attempt')::integer then return false; end if;
  update public.reel_account_reels set data = data || jsonb_build_object('format', p_format)
    where id = work->>'targetId' and owner_id = work->>'ownerId';
  return found;
end $$;

revoke all on function public.reel_record_account_reel_format(jsonb,text) from public, anon, authenticated;
grant execute on function public.reel_record_account_reel_format(jsonb,text) to service_role;

commit;
