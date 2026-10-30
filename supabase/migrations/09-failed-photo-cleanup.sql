-- Run once after 01-08. Registration does not delete any file.
begin;
alter table public.spot_photo_publish_jobs add column rejected_at timestamptz;
-- Historical failure times are unknown: start their safety interval now.
update public.spot_photo_publish_jobs set rejected_at=clock_timestamp() where status='rejected';
create function public.stamp_photo_rejection() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='rejected' then
    if tg_op='INSERT' then new.rejected_at:=clock_timestamp();
    elsif old.status is distinct from 'rejected' then new.rejected_at:=clock_timestamp();
    else new.rejected_at:=old.rejected_at;
    end if;
  else new.rejected_at:=null;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_photo_rejection() from public,anon,authenticated;
create trigger stamp_photo_rejection before insert or update on public.spot_photo_publish_jobs
  for each row execute function public.stamp_photo_rejection();

create table public.failed_photo_cleanups (
  object_name text primary key references public.spot_photo_publish_jobs(target_path),
  status text not null default 'pending' check(status in ('pending','completed')),
  requested_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.failed_photo_cleanups enable row level security;
alter table public.failed_photo_cleanups force row level security;
revoke all on public.failed_photo_cleanups from public,anon,authenticated;
grant select on public.failed_photo_cleanups to authenticated;
create policy admin_read_failed_cleanups on public.failed_photo_cleanups for select to authenticated
  using ((select auth.uid())='affc8719-3bac-49ce-b251-24106f2929f4'::uuid);

-- Decode ASCII percent-encoding so encoded photo URLs cannot evade protection.
create function public.photo_reference_text(p_value text) returns text
language plpgsql immutable set search_path='' as $$
declare result text:=coalesce(p_value,''); token text; code integer;
begin
  for token in select distinct m[1] from regexp_matches(result,'%([0-9A-Fa-f]{2})','g') m loop
    code:=get_byte(decode(token,'hex'),0);
    if code between 1 and 127 then result:=replace(result,'%'||token,chr(code)); end if;
  end loop;
  return result;
end;
$$;
revoke all on function public.photo_reference_text(text) from public,anon,authenticated;
create function public.failed_photo_cleanup_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.spot_photo_publish_jobs j where j.target_path=p_path
      and j.status='rejected' and j.rejected_at <= now()-interval '24 hours')
    and not exists(select 1 from public.spot_content_published where strpos(public.photo_reference_text(photo),p_path)>0)
    and not exists(select 1 from public.spot_content_drafts where strpos(public.photo_reference_text(photo),p_path)>0)
    and not exists(select 1 from public.spot_publication_state where strpos(public.photo_reference_text(previous_content->>'photo'),p_path)>0);
$$;
revoke all on function public.failed_photo_cleanup_allowed(text) from public,anon,authenticated;

create function public.guard_cleaned_public_photo() returns trigger
language plpgsql security definer set search_path='' as $$
declare value text; item text;
begin
  if tg_table_name='spot_photo_publish_jobs' then
    if tg_op='UPDATE' then
      if new.target_path=old.target_path and new.status='rejected' then return new; end if;
    end if;
    value:=new.target_path;
  elsif tg_table_name='spot_publication_state' then value:=new.previous_content->>'photo';
  else value:=new.photo;
  end if;
  for item in select distinct m[1] from regexp_matches(public.photo_reference_text(value),
    '(spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))','g') m order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('failed-photo-cleanup:'||item,0));
    if exists(select 1 from public.failed_photo_cleanups where object_name=item) then
      raise exception 'Public photo cleanup requested; choose another photo' using errcode='40001';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_cleaned_public_photo() from public,anon,authenticated;
create trigger guard_cleaned_public_photo before insert or update on public.spot_photo_publish_jobs for each row execute function public.guard_cleaned_public_photo();
create trigger guard_cleaned_public_photo before insert or update on public.spot_content_drafts for each row execute function public.guard_cleaned_public_photo();
create trigger guard_cleaned_public_photo before insert or update on public.spot_content_published for each row execute function public.guard_cleaned_public_photo();
create trigger guard_cleaned_public_photo before insert or update on public.spot_publication_state for each row execute function public.guard_cleaned_public_photo();

create function public.prepare_failed_photo_cleanup(p_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.failed_photo_cleanups%rowtype;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_path is null or p_path !~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then raise exception 'Invalid path'; end if;
  perform pg_advisory_xact_lock(hashtextextended('failed-photo-cleanup:'||p_path,0));
  select * into job from public.failed_photo_cleanups where object_name=p_path;
  if found then return to_jsonb(job); end if;
  if not public.failed_photo_cleanup_allowed(p_path) then
    raise exception 'Not an unreferenced failure older than 24 hours' using errcode='40001';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='gyoda-published-photos' and name=p_path) then raise exception 'Copy not found'; end if;
  insert into public.failed_photo_cleanups(object_name) values(p_path) returning * into job;
  return to_jsonb(job);
end;
$$;
create function public.finish_failed_photo_cleanup(p_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.failed_photo_cleanups%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('failed-photo-cleanup:'||p_path,0));
  select * into job from public.failed_photo_cleanups where object_name=p_path for update;
  if not found then raise exception 'Cleanup not reserved'; end if;
  if exists(select 1 from storage.objects where bucket_id='gyoda-published-photos' and name=p_path) then raise exception 'Copy still exists'; end if;
  update public.failed_photo_cleanups set status='completed',completed_at=coalesce(completed_at,now()) where object_name=p_path returning * into job;
  return to_jsonb(job);
end;
$$;
revoke all on function public.prepare_failed_photo_cleanup(text) from public,anon,authenticated;
revoke all on function public.finish_failed_photo_cleanup(text) from public,anon,authenticated;
grant execute on function public.prepare_failed_photo_cleanup(text) to authenticated;
grant execute on function public.finish_failed_photo_cleanup(text) to service_role;

alter function public.list_spot_photo_inventory(text,integer) rename to list_spot_photo_inventory_v8;
revoke all on function public.list_spot_photo_inventory_v8(text,integer) from public,anon,authenticated;
create function public.list_spot_photo_inventory(p_spot_id text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; items jsonb; pending jsonb;
begin
  result:=public.list_spot_photo_inventory_v8(p_spot_id,p_offset);
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'can_cleanup',item->>'bucket'='gyoda-published-photos' and (item->>'tracked')::boolean and public.failed_photo_cleanup_allowed(item->>'path'),
    'cleanup_status',(select status from public.failed_photo_cleanups where object_name=item->>'path' and item->>'bucket'='gyoda-published-photos'),
    'cleanup_after',(select rejected_at+interval '24 hours' from public.spot_photo_publish_jobs where target_path=item->>'path' and status='rejected' and item->>'bucket'='gyoda-published-photos')
  ) order by n),'[]'::jsonb) into items from jsonb_array_elements(result->'items') with ordinality as rows(item,n);
  select coalesce(jsonb_agg(to_jsonb(d) order by d.requested_at,d.object_name),'[]'::jsonb) into pending from (
    select object_name,requested_at from public.failed_photo_cleanups where status='pending' and split_part(object_name,'/',1)=p_spot_id order by requested_at,object_name limit 50
  ) d;
  return jsonb_set(result,'{items}',items)||jsonb_build_object('pending_cleanups',pending);
end;
$$;
revoke all on function public.list_spot_photo_inventory(text,integer) from public,anon,authenticated;
grant execute on function public.list_spot_photo_inventory(text,integer) to authenticated;
commit;
select 'Failed photo cleanup server ready' as result;
