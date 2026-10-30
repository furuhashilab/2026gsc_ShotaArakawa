-- Run once in the Supabase SQL Editor as postgres.
-- This creates private drafts only. It does not change the public map.
begin;

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  ) then
    raise exception 'Admin user not found. Check the project and user ID.';
  end if;
end;
$$;

-- Intentionally fail rather than overwrite an existing table.
create table public.spot_content_drafts (
  spot_id text primary key check (spot_id ~ '^spot-[0-9]{3,}$'),
  owner_id uuid not null default auth.uid()
    references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default ''
    check (char_length(description) <= 3000),
  constraint single_admin_owner check (
    owner_id = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  )
);

alter table public.spot_content_drafts enable row level security;
alter table public.spot_content_drafts force row level security;

revoke all on table public.spot_content_drafts from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on table public.spot_content_drafts to authenticated;

create policy admin_read_drafts on public.spot_content_drafts
  for select to authenticated
  using (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
    and owner_id = (select auth.uid())
  );

create policy admin_insert_drafts on public.spot_content_drafts
  for insert to authenticated
  with check (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
    and owner_id = (select auth.uid())
  );

create policy admin_update_drafts on public.spot_content_drafts
  for update to authenticated
  using (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
    and owner_id = (select auth.uid())
  )
  with check (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
    and owner_id = (select auth.uid())
  );

commit;

select 'Private draft table created' as result;
