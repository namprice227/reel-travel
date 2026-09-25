-- Home's detected-places popup. Apply after 202609240002_account_reel_format.sql.
-- A reel's `review` ("pending" | "done") lives in its jsonb data: the popup reappears while it is pending.
-- Rows written before this migration have no `review` key and read as "done" through the app's contract default.
-- Removing unticked (or, on Cancel, all) place ideas happens in the same write as the review change.
-- Copies already added to trips live in reel_places and are untouched.
begin;

create function public.reel_set_account_reel_review(p_reel_id text, p_owner text, p_review text, p_discard jsonb, p_now text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare source jsonb; removed integer := 0;
begin
  if p_review not in ('pending', 'done') or jsonb_typeof(p_discard) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid review';
  end if;
  select data into source from public.reel_account_reels where id = p_reel_id and owner_id = p_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'NOT_FOUND'; end if;
  if jsonb_array_length(p_discard) > 0 then
    if source->>'status' is distinct from 'ready' or (source->>'tripId') is not null then
      raise exception using errcode = '22023', message = 'PLACES_NOT_DISCARDABLE';
    end if;
    delete from public.reel_account_places
      where reel_id = p_reel_id and owner_id = p_owner
        and id in (select jsonb_array_elements_text(p_discard));
    get diagnostics removed = row_count;
  end if;
  if removed > 0 then
    source := source || jsonb_build_object('placeIds', coalesce((select jsonb_agg(value)
      from jsonb_array_elements(source->'placeIds') as value where not (p_discard ? (value #>> '{}'))), '[]'::jsonb));
  end if;
  if removed > 0 or coalesce(source->>'review', 'done') is distinct from p_review then
    source := source || jsonb_build_object('review', p_review, 'updatedAt', p_now);
    update public.reel_account_reels set data = source where id = p_reel_id;
  end if;
  return source;
end $$;

revoke all on function public.reel_set_account_reel_review(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.reel_set_account_reel_review(text,text,text,jsonb,text) to service_role;

commit;
