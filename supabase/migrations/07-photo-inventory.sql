-- Read-only inventory. Run after 01-06. This does not delete or publish photos.
begin;
create function public.list_spot_photo_inventory(p_spot_id text, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare response jsonb;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_spot_id is null or p_spot_id !~ '^spot-[0-9]{3,}$'
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Invalid inventory request';
  end if;
  with objects as (
    select o.bucket_id,o.name,o.created_at,o.metadata
    from storage.objects o
    where o.bucket_id in ('gyoda-private-photos','gyoda-published-photos')
      and split_part(o.name,'/',1)=p_spot_id
    order by o.bucket_id,o.name limit 51 offset p_offset
  ), classified as (
    select o.*, array_remove(array[
      case when exists(select 1 from public.spot_photo_drafts c
        where o.bucket_id='gyoda-private-photos' and c.object_name=o.name) then 'candidate' end,
      case when exists(select 1 from public.spot_content_published c
        where split_part(split_part(btrim(c.photo),'?',1),'#',1)=any(links.urls)) then 'published' end,
      case when exists(select 1 from public.spot_publication_state s where s.undo_available
        and split_part(split_part(btrim(s.previous_content->>'photo'),'?',1),'#',1)=any(links.urls)) then 'undo' end,
      case when exists(select 1 from public.spot_content_drafts d
        where split_part(split_part(btrim(d.photo),'?',1),'#',1)=any(links.urls)) then 'draft' end,
      case when exists(select 1 from public.spot_photo_publish_jobs j where j.status='pending'
        and ((o.bucket_id='gyoda-private-photos' and j.source_path=o.name)
          or (o.bucket_id='gyoda-published-photos' and j.target_path=o.name))) then 'pending' end
    ],null) as uses,
    exists(select 1 from public.spot_photo_publish_jobs j where j.status='rejected'
      and o.bucket_id='gyoda-published-photos' and j.target_path=o.name) as failed_copy,
    (o.name ~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
      and (o.bucket_id='gyoda-private-photos' or exists(select 1 from public.spot_photo_publish_jobs j where j.target_path=o.name))) as tracked
    from objects o
    cross join lateral (
      select array_agg('https://vdchpxtbqkufzscgszuh.supabase.co/storage/v1/object/public/gyoda-published-photos/' || paths.path) as urls
      from (
        select o.name as path where o.bucket_id='gyoda-published-photos'
        union select j.target_path from public.spot_photo_publish_jobs j
          where o.bucket_id='gyoda-private-photos' and j.source_path=o.name
      ) paths
    ) links
  ), page as (
    select * from classified order by bucket_id,name limit 50
  )
  select jsonb_build_object('spot_id',p_spot_id,'offset',p_offset,
    'has_more',(select count(*) > 50 from objects),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'bucket',bucket_id,'path',name,'created_at',created_at,
      'size_bytes',case when metadata->>'size' ~ '^[0-9]{1,15}$' then (metadata->>'size')::bigint else null end,
      'uses',uses,'failed_copy',failed_copy,'tracked',tracked
    ) order by bucket_id,name) from page),'[]'::jsonb)) into response;
  return response;
end;
$$;
revoke all on function public.list_spot_photo_inventory(text,integer) from public,anon,authenticated;
grant execute on function public.list_spot_photo_inventory(text,integer) to authenticated;
commit;
select 'Photo inventory ready' as result;
