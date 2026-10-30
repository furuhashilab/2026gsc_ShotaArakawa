-- Run once as postgres. This creates PRIVATE photo storage only.
-- It does not upload files, publish photos, or change card information.
begin;

do $$
begin
  if not exists (select 1 from auth.users where id = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid) then
    raise exception 'Admin user not found';
  end if;
  if not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity) then
    raise exception 'Storage objects RLS must be enabled';
  end if;
  if not exists (select 1 from pg_class where oid = 'storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage buckets RLS must be enabled';
  end if;
end;
$$;

-- Fail on an existing bucket rather than changing its privacy or contents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gyoda-private-photos', 'gyoda-private-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']);

-- Restrictive policies prevent unrelated broad permissive policies from
-- accidentally giving other browser users access to this new bucket.
create policy gyoda_private_photos_guard on storage.objects
  as restrictive for all to public
  using (
    bucket_id <> 'gyoda-private-photos'
    or (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  )
  with check (
    bucket_id <> 'gyoda-private-photos'
    or ((select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
      and name ~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

create policy gyoda_private_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'gyoda-private-photos'
    and (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  );
create policy gyoda_private_photos_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'gyoda-private-photos'
    and (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
    and name ~ '^spot-[0-9]{3,}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

-- Immutable uploads until reference-aware cleanup is implemented.
create policy gyoda_private_photos_no_overwrite on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'gyoda-private-photos')
  with check (bucket_id <> 'gyoda-private-photos');
create policy gyoda_private_photos_no_delete on storage.objects
  as restrictive for delete to public using (bucket_id <> 'gyoda-private-photos');

-- Browser clients must not turn this bucket public or delete/recreate it.
create policy gyoda_private_bucket_no_update on storage.buckets
  as restrictive for update to public
  using (id <> 'gyoda-private-photos') with check (id <> 'gyoda-private-photos');
create policy gyoda_private_bucket_no_delete on storage.buckets
  as restrictive for delete to public using (id <> 'gyoda-private-photos');
create policy gyoda_private_bucket_no_insert on storage.buckets
  as restrictive for insert to public with check (id <> 'gyoda-private-photos');

commit;

select 'Private photo storage ready' as result;
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'gyoda-private-photos';
