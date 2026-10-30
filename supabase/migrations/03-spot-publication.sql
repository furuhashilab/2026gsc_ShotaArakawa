-- Run once as postgres after migrations 01 and 02.
-- No drafts are published by this migration. No existing rows are modified.
begin;

-- Public data contains only card fields, never administrator identity/history.
create table public.spot_content_published (
  spot_id text primary key check (spot_id ~ '^spot-[0-9]{3,}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(description) <= 3000),
  photo text not null check (char_length(photo) <= 2000),
  youtube2 text not null check (char_length(youtube2) <= 2000),
  youtube text not null check (char_length(youtube) <= 2000),
  homepage text not null check (char_length(homepage) <= 2000)
);

-- NULL previous_content means that the previous state used the static JSON.
-- Revision survives an initial-publication undo to reject stale requests.
create table public.spot_publication_state (
  spot_id text primary key check (spot_id ~ '^spot-[0-9]{3,}$'),
  revision bigint not null default 0 check (revision >= 0),
  previous_content jsonb,
  undo_available boolean not null default false
);

alter table public.spot_content_published enable row level security;
alter table public.spot_content_published force row level security;
alter table public.spot_publication_state enable row level security;
alter table public.spot_publication_state force row level security;
revoke all on public.spot_content_published from public, anon, authenticated;
revoke all on public.spot_publication_state from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.spot_content_published to anon, authenticated;
grant select on public.spot_publication_state to authenticated;

create policy read_published_cards on public.spot_content_published
  for select to anon, authenticated using (true);
create policy admin_read_publication_state on public.spot_publication_state
  for select to authenticated using (
    (select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid
  );

-- Only these functions can write publication data from a browser session.
-- Compare the exact reviewed draft and revision before making any changes.
create function public.publish_spot_card(
  p_spot_id text, p_expected_draft jsonb, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  draft public.spot_content_drafts%rowtype;
  state public.spot_publication_state%rowtype;
  content jsonb;
  previous jsonb;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected publication revision is required';
  end if;

  select * into draft from public.spot_content_drafts
    where spot_id = p_spot_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Draft not found'; end if;
  if draft.photo is null or draft.youtube2 is null or draft.youtube is null or draft.homepage is null then
    raise exception 'Save all six draft fields before publishing';
  end if;
  content := jsonb_build_object(
    'spot_id', draft.spot_id, 'name', draft.name, 'description', draft.description,
    'photo', draft.photo, 'youtube2', draft.youtube2,
    'youtube', draft.youtube, 'homepage', draft.homepage
  );
  if content is distinct from p_expected_draft then
    raise exception 'Draft changed; reload and review again' using errcode = '40001';
  end if;

  insert into public.spot_publication_state (spot_id) values (p_spot_id)
    on conflict (spot_id) do nothing;
  select * into state from public.spot_publication_state
    where spot_id = p_spot_id for update;
  if state.revision <> p_expected_revision then
    raise exception 'Publication changed; reload and review again' using errcode = '40001';
  end if;
  select to_jsonb(p) into previous from public.spot_content_published p where p.spot_id = p_spot_id;
  -- Repeating an unchanged publication must not overwrite the undo snapshot.
  if previous is not distinct from content then
    return jsonb_build_object('spot_id', p_spot_id, 'revision', state.revision, 'changed', false);
  end if;
  update public.spot_publication_state
    set previous_content = previous, undo_available = true, revision = revision + 1
    where spot_id = p_spot_id;
  insert into public.spot_content_published (spot_id, name, description, photo, youtube2, youtube, homepage)
    values (draft.spot_id, draft.name, draft.description, draft.photo, draft.youtube2, draft.youtube, draft.homepage)
    on conflict (spot_id) do update set
      name = excluded.name, description = excluded.description, photo = excluded.photo,
      youtube2 = excluded.youtube2, youtube = excluded.youtube, homepage = excluded.homepage;
  return jsonb_build_object('spot_id', p_spot_id, 'revision', state.revision + 1, 'changed', true);
end;
$$;

create function public.undo_spot_publication(p_spot_id text, p_expected_revision bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  state public.spot_publication_state%rowtype;
  previous public.spot_content_published%rowtype;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  select * into state from public.spot_publication_state where spot_id = p_spot_id for update;
  if not found then raise exception 'No publication to undo'; end if;
  if p_expected_revision is null or state.revision <> p_expected_revision then
    raise exception 'Publication changed; reload and review again' using errcode = '40001';
  end if;
  if not state.undo_available then raise exception 'No publication to undo'; end if;
  if state.previous_content is null then
    delete from public.spot_content_published where spot_id = p_spot_id;
  else
    select * into previous from jsonb_populate_record(null::public.spot_content_published, state.previous_content);
    insert into public.spot_content_published (spot_id, name, description, photo, youtube2, youtube, homepage)
      values (previous.spot_id, previous.name, previous.description, previous.photo, previous.youtube2, previous.youtube, previous.homepage)
      on conflict (spot_id) do update set
        name = excluded.name, description = excluded.description, photo = excluded.photo,
        youtube2 = excluded.youtube2, youtube = excluded.youtube, homepage = excluded.homepage;
  end if;
  update public.spot_publication_state
    set previous_content = null, undo_available = false, revision = revision + 1
    where spot_id = p_spot_id;
  return jsonb_build_object('spot_id', p_spot_id, 'revision', state.revision + 1,
    'uses_static_data', state.previous_content is null);
end;
$$;

revoke all on function public.publish_spot_card(text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.undo_spot_publication(text, bigint) from public, anon, authenticated;
grant execute on function public.publish_spot_card(text, jsonb, bigint) to authenticated;
grant execute on function public.undo_spot_publication(text, bigint) to authenticated;

commit;
select 'Spot publication setup complete' as result;
