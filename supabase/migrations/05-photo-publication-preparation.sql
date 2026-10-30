-- Run once as postgres after migrations 01-04.
-- Preparation only: no image is copied and no existing card is changed.
begin;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'gyoda-private-photos' and public = false
  ) then
    raise exception 'Private photo bucket missing or not private';
  end if;
  if not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity)
    or not exists (select 1 from pg_class where oid = 'storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage RLS must be enabled';
  end if;
end;
$$;

-- A private choice, separate from the existing public-compatible photo URL.
-- NULL means use the existing card photo URL. Rows retain their revision on clear.
create table public.spot_photo_drafts (
  spot_id text primary key references public.spot_content_drafts(spot_id),
  object_name text,
  revision bigint not null default 1 check (revision > 0),
  constraint photo_belongs_to_spot check (
    object_name is null or object_name ~ (
      '^' || spot_id || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  )
);
alter table public.spot_photo_drafts enable row level security;
alter table public.spot_photo_drafts force row level security;
revoke all on public.spot_photo_drafts from public, anon, authenticated;
grant select on public.spot_photo_drafts to authenticated;
grant insert (spot_id, object_name) on public.spot_photo_drafts to authenticated;
grant update (object_name) on public.spot_photo_drafts to authenticated;

create policy admin_read_photo_choice on public.spot_photo_drafts
  for select to authenticated using (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  );
create policy admin_insert_photo_choice on public.spot_photo_drafts
  for insert to authenticated with check (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  );
create policy admin_update_photo_choice on public.spot_photo_drafts
  for update to authenticated using (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  ) with check (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  );

create function public.validate_spot_photo_choice()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.object_name is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'gyoda-private-photos' and name = new.object_name
  ) then
    raise exception 'Private photo not found or not accessible';
  end if;
  if tg_op = 'INSERT' then
    new.revision := 1;
  elsif new.object_name is distinct from old.object_name then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_spot_photo_choice() from public, anon, authenticated;
create trigger validate_spot_photo_choice
  before insert or update on public.spot_photo_drafts
  for each row execute function public.validate_spot_photo_choice();

-- This bucket is empty. Only future server-side publication code may write it.
-- Files copied here will be public by URL; never put unapproved photos here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gyoda-published-photos', 'gyoda-published-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']);

-- Supabase's server service role bypasses RLS. Browser roles do not.
create policy gyoda_published_objects_server_only on storage.objects
  as restrictive for all to public
  using (bucket_id <> 'gyoda-published-photos')
  with check (bucket_id <> 'gyoda-published-photos');
create policy gyoda_published_bucket_server_only on storage.buckets
  as restrictive for all to public
  using (id <> 'gyoda-published-photos')
  with check (id <> 'gyoda-published-photos');

commit;
select 'Photo publication preparation complete' as result;
select id, public from storage.buckets
where id in ('gyoda-private-photos', 'gyoda-published-photos') order by id;
