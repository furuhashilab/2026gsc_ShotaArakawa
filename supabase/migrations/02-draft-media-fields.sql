-- Run once in the Supabase SQL Editor after 01-private-spot-drafts.sql.
-- This adds private draft fields only. Existing content and RLS stay unchanged.
begin;

-- NULL means this field has not yet been saved online (legacy draft).
-- An empty string means the administrator explicitly cleared the field.
alter table public.spot_content_drafts
  add column photo text check (char_length(photo) <= 2000),
  add column youtube2 text check (char_length(youtube2) <= 2000),
  add column youtube text check (char_length(youtube) <= 2000),
  add column homepage text check (char_length(homepage) <= 2000);

commit;

select 'Private draft media fields added' as result;
