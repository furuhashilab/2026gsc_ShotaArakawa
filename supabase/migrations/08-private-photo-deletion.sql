-- Run once after 01-07. No Storage files are deleted by this migration.
begin;
create table public.private_photo_deletions (
  object_name text primary key check (object_name ~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  status text not null default 'pending' check (status in ('pending','completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.private_photo_deletions enable row level security;
alter table public.private_photo_deletions force row level security;
revoke all on public.private_photo_deletions from public,anon,authenticated;
grant select on public.private_photo_deletions to authenticated;
create policy admin_read_private_deletions on public.private_photo_deletions for select to authenticated
  using ((select auth.uid())='affc8719-3bac-49ce-b251-24106f2929f4'::uuid);

-- Conservative first release: retain every source with ANY publication history.
create function public.private_photo_is_unreferenced(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.spot_photo_drafts where object_name=p_path)
    and not exists(select 1 from public.spot_photo_publish_jobs where source_path=p_path)
    and not exists(select 1 from public.spot_content_drafts where strpos(photo,p_path)>0)
    and not exists(select 1 from public.spot_content_published where strpos(photo,p_path)>0)
    and not exists(select 1 from public.spot_publication_state where strpos(previous_content->>'photo',p_path)>0);
$$;
revoke all on function public.private_photo_is_unreferenced(text) from public,anon,authenticated;

-- Serialize new references with deletion reservation. Tombstones remain permanently.
create function public.guard_deleted_private_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare value text; item text;
begin
  if tg_table_name='spot_photo_drafts' then value:=new.object_name;
  elsif tg_table_name='spot_photo_publish_jobs' then value:=new.source_path;
  elsif tg_table_name='spot_publication_state' then value:=new.previous_content->>'photo';
  else value:=new.photo;
  end if;
  for item in select distinct m[1] from regexp_matches(coalesce(value,''),
    '(spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))','g') m order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('private-photo-delete:' || item,0));
    if exists(select 1 from public.private_photo_deletions where object_name=item) then
      raise exception 'Photo deletion already requested; select another photo' using errcode='40001';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_deleted_private_photo() from public,anon,authenticated;
create trigger guard_deleted_private_photo before insert or update on public.spot_photo_drafts
  for each row execute function public.guard_deleted_private_photo();
create trigger guard_deleted_private_photo before insert or update on public.spot_photo_publish_jobs
  for each row execute function public.guard_deleted_private_photo();
create trigger guard_deleted_private_photo before insert or update on public.spot_content_drafts
  for each row execute function public.guard_deleted_private_photo();
create trigger guard_deleted_private_photo before insert or update on public.spot_content_published
  for each row execute function public.guard_deleted_private_photo();
create trigger guard_deleted_private_photo before insert or update on public.spot_publication_state
  for each row execute function public.guard_deleted_private_photo();

create policy gyoda_private_no_reupload_deleted on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'gyoda-private-photos' or not exists(
    select 1 from public.private_photo_deletions d where d.object_name=name));

create function public.prepare_private_photo_deletion(p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.private_photo_deletions%rowtype;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_path is null or p_path !~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    raise exception 'Invalid private photo path';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('private-photo-delete:' || p_path,0));
  select * into job from public.private_photo_deletions where object_name=p_path;
  if found then return to_jsonb(job); end if;
  if not exists(select 1 from storage.objects where bucket_id='gyoda-private-photos' and name=p_path) then
    raise exception 'Private photo not found';
  end if;
  if not public.private_photo_is_unreferenced(p_path) then
    raise exception 'Photo is referenced or has publication history' using errcode='40001';
  end if;
  insert into public.private_photo_deletions(object_name) values(p_path) returning * into job;
  return to_jsonb(job);
end;
$$;

-- Only call after the Storage API has removed the actual file.
create function public.finish_private_photo_deletion(p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.private_photo_deletions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('private-photo-delete:' || p_path,0));
  select * into job from public.private_photo_deletions where object_name=p_path for update;
  if not found then raise exception 'Deletion not reserved'; end if;
  if exists(select 1 from storage.objects where bucket_id='gyoda-private-photos' and name=p_path) then
    raise exception 'Photo still exists';
  end if;
  update public.private_photo_deletions set status='completed',completed_at=coalesce(completed_at,now())
    where object_name=p_path returning * into job;
  return to_jsonb(job);
end;
$$;
revoke all on function public.prepare_private_photo_deletion(text) from public,anon,authenticated;
revoke all on function public.finish_private_photo_deletion(text) from public,anon,authenticated;
grant execute on function public.prepare_private_photo_deletion(text) to authenticated;
grant execute on function public.finish_private_photo_deletion(text) to service_role;

-- Extend the read-only inventory without exposing the internal reference helper.
alter function public.list_spot_photo_inventory(text,integer) rename to list_spot_photo_inventory_v7;
revoke all on function public.list_spot_photo_inventory_v7(text,integer) from public,anon,authenticated;
create function public.list_spot_photo_inventory(p_spot_id text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; items jsonb; pending jsonb;
begin
  result:=public.list_spot_photo_inventory_v7(p_spot_id,p_offset);
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'deletion_status',(select status from public.private_photo_deletions where object_name=item->>'path' and item->>'bucket'='gyoda-private-photos'),
    'can_delete',item->>'bucket'='gyoda-private-photos' and (item->>'tracked')::boolean
      and public.private_photo_is_unreferenced(item->>'path'),
    'has_publication_history',item->>'bucket'='gyoda-private-photos' and exists(
      select 1 from public.spot_photo_publish_jobs where source_path=item->>'path')
  ) order by n),'[]'::jsonb) into items from jsonb_array_elements(result->'items') with ordinality as rows(item,n);
  select coalesce(jsonb_agg(to_jsonb(d) order by d.requested_at,d.object_name),'[]'::jsonb) into pending
    from (select object_name,requested_at from public.private_photo_deletions
      where status='pending' and split_part(object_name,'/',1)=p_spot_id
      order by requested_at,object_name limit 50) d;
  -- Include interrupted deletions even when the Storage file is already gone.
  return jsonb_set(result,'{items}',items) || jsonb_build_object('pending_deletions',pending);
end;
$$;
revoke all on function public.list_spot_photo_inventory(text,integer) from public,anon,authenticated;
grant execute on function public.list_spot_photo_inventory(text,integer) to authenticated;
commit;
select 'Private photo deletion server ready' as result;
