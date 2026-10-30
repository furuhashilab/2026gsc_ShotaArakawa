-- Run once as postgres after 01-05. No photos/cards are published here.
begin;

create table public.spot_photo_publish_jobs (
  id uuid primary key,
  spot_id text not null references public.spot_content_drafts(spot_id),
  expected_draft jsonb not null,
  expected_revision bigint not null check (expected_revision >= 0),
  expected_photo_revision bigint not null check (expected_photo_revision > 0),
  source_path text not null,
  target_path text not null unique,
  status text not null default 'pending' check (status in ('pending','completed','rejected')),
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.spot_photo_publish_jobs enable row level security;
alter table public.spot_photo_publish_jobs force row level security;
revoke all on public.spot_photo_publish_jobs from public, anon, authenticated;
grant select on public.spot_photo_publish_jobs to authenticated;
create policy admin_read_photo_jobs on public.spot_photo_publish_jobs
  for select to authenticated using ((select auth.uid()) = 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid);

create function public.prepare_spot_photo_publication(
  p_request_id uuid, p_spot_id text, p_expected_draft jsonb,
  p_expected_revision bigint, p_expected_photo_revision bigint, p_expected_source text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  job public.spot_photo_publish_jobs%rowtype;
  draft public.spot_content_drafts%rowtype;
  choice public.spot_photo_drafts%rowtype;
  state public.spot_publication_state%rowtype;
  content jsonb;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_expected_photo_revision is null or p_expected_photo_revision < 1 or p_expected_source is null then
    raise exception 'Invalid publication request';
  end if;
  -- Serialize duplicate request IDs, including when no row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into job from public.spot_photo_publish_jobs where id = p_request_id for update;
  if found then
    if job.spot_id is distinct from p_spot_id or job.expected_draft is distinct from p_expected_draft
      or job.expected_revision <> p_expected_revision or job.expected_photo_revision <> p_expected_photo_revision
      or job.source_path is distinct from p_expected_source then
      raise exception 'Request ID already used for different content' using errcode = '40001';
    end if;
    if job.status <> 'pending' then return to_jsonb(job); end if;
  end if;
  select * into draft from public.spot_content_drafts where spot_id = p_spot_id for update;
  if not found then raise exception 'Draft not found'; end if;
  select * into choice from public.spot_photo_drafts where spot_id = p_spot_id for update;
  if not found or choice.object_name is null then raise exception 'Private photo not selected'; end if;
  insert into public.spot_publication_state(spot_id) values(p_spot_id) on conflict(spot_id) do nothing;
  select * into state from public.spot_publication_state where spot_id = p_spot_id for update;
  content := jsonb_build_object('spot_id',draft.spot_id,'name',draft.name,'description',draft.description,
    'photo',draft.photo,'youtube2',draft.youtube2,'youtube',draft.youtube,'homepage',draft.homepage);
  if draft.photo is null or draft.youtube2 is null or draft.youtube is null or draft.homepage is null then
    raise exception 'Save all six fields first';
  end if;
  if content is distinct from p_expected_draft or state.revision <> p_expected_revision
    or choice.revision <> p_expected_photo_revision or choice.object_name is distinct from p_expected_source then
    raise exception 'Content changed; review again' using errcode = '40001';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='gyoda-private-photos' and name=choice.object_name) then
    raise exception 'Source photo not found';
  end if;
  if job.id is null then
    insert into public.spot_photo_publish_jobs(id,spot_id,expected_draft,expected_revision,expected_photo_revision,source_path,target_path)
    values(p_request_id,p_spot_id,content,state.revision,choice.revision,choice.object_name,
      p_spot_id || '/' || p_request_id::text || '.' || split_part(choice.object_name,'.',2))
    returning * into job;
  end if;
  return to_jsonb(job);
end;
$$;

-- Only the server role can finalize a copied image. Never grant this to a browser.
create function public.finish_spot_photo_publication(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  job public.spot_photo_publish_jobs%rowtype;
  draft public.spot_content_drafts%rowtype;
  choice public.spot_photo_drafts%rowtype;
  state public.spot_publication_state%rowtype;
  content jsonb;
  previous jsonb;
  photo_url text;
  response jsonb;
begin
  select * into job from public.spot_photo_publish_jobs where id=p_request_id for update;
  if not found then raise exception 'Publication job not found'; end if;
  if job.status <> 'pending' then return jsonb_build_object('status',job.status,'result',job.result); end if;
  select * into draft from public.spot_content_drafts where spot_id=job.spot_id for update;
  select * into choice from public.spot_photo_drafts where spot_id=job.spot_id for update;
  select * into state from public.spot_publication_state where spot_id=job.spot_id for update;
  content := jsonb_build_object('spot_id',draft.spot_id,'name',draft.name,'description',draft.description,
    'photo',draft.photo,'youtube2',draft.youtube2,'youtube',draft.youtube,'homepage',draft.homepage);
  if content is distinct from job.expected_draft or state.revision is distinct from job.expected_revision
    or choice.revision is distinct from job.expected_photo_revision or choice.object_name is distinct from job.source_path then
    update public.spot_photo_publish_jobs set status='rejected' where id=job.id;
    return jsonb_build_object('status','rejected');
  end if;
  if not exists(select 1 from storage.objects where bucket_id='gyoda-published-photos' and name=job.target_path) then
    raise exception 'Public photo copy missing';
  end if;
  photo_url := 'https://vdchpxtbqkufzscgszuh.supabase.co/storage/v1/object/public/gyoda-published-photos/' || job.target_path;
  select to_jsonb(p) into previous from public.spot_content_published p where p.spot_id=job.spot_id;
  update public.spot_publication_state set previous_content=previous, undo_available=true, revision=revision+1
    where spot_id=job.spot_id;
  insert into public.spot_content_published(spot_id,name,description,photo,youtube2,youtube,homepage)
    values(draft.spot_id,draft.name,draft.description,photo_url,draft.youtube2,draft.youtube,draft.homepage)
    on conflict(spot_id) do update set name=excluded.name,description=excluded.description,photo=excluded.photo,
      youtube2=excluded.youtube2,youtube=excluded.youtube,homepage=excluded.homepage;
  response := jsonb_build_object('spot_id',job.spot_id,'revision',state.revision+1,'photo',photo_url,'request_id',job.id);
  update public.spot_photo_publish_jobs set status='completed',result=response where id=job.id;
  return jsonb_build_object('status','completed','result',response);
end;
$$;

-- Persist a terminal failure before deleting any copy. Completed jobs stay intact.
create function public.reject_spot_photo_publication(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare job public.spot_photo_publish_jobs%rowtype;
begin
  select * into job from public.spot_photo_publish_jobs where id=p_request_id for update;
  if not found then raise exception 'Publication job not found'; end if;
  if job.status='pending' then
    update public.spot_photo_publish_jobs set status='rejected' where id=job.id;
    job.status := 'rejected';
  end if;
  return jsonb_build_object('status',job.status,'result',job.result,'target_path',job.target_path);
end;
$$;

revoke all on function public.prepare_spot_photo_publication(uuid,text,jsonb,bigint,bigint,text) from public,anon,authenticated;
revoke all on function public.finish_spot_photo_publication(uuid) from public,anon,authenticated;
revoke all on function public.reject_spot_photo_publication(uuid) from public,anon,authenticated;
grant execute on function public.prepare_spot_photo_publication(uuid,text,jsonb,bigint,bigint,text) to authenticated;
grant execute on function public.finish_spot_photo_publication(uuid) to service_role;
grant execute on function public.reject_spot_photo_publication(uuid) to service_role;

-- Prevent the old URL-only route from ignoring an active private-photo choice.
alter function public.publish_spot_card(text,jsonb,bigint) rename to publish_spot_card_url_only;
revoke all on function public.publish_spot_card_url_only(text,jsonb,bigint) from public,anon,authenticated;
create function public.publish_spot_card(p_spot_id text,p_expected_draft jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare choice public.spot_photo_drafts%rowtype;
begin
  if auth.uid() is distinct from 'affc8719-3bac-49ce-b251-24106f2929f4'::uuid then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  perform 1 from public.spot_content_drafts where spot_id=p_spot_id for update;
  -- A stable row also prevents a simultaneous first-time photo selection.
  insert into public.spot_photo_drafts(spot_id,object_name) values(p_spot_id,null) on conflict(spot_id) do nothing;
  select * into choice from public.spot_photo_drafts where spot_id=p_spot_id for update;
  if choice.object_name is not null then
    raise exception 'Use the private-photo publication function';
  end if;
  return public.publish_spot_card_url_only(p_spot_id,p_expected_draft,p_expected_revision);
end;
$$;
revoke all on function public.publish_spot_card(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.publish_spot_card(text,jsonb,bigint) to authenticated;

commit;
select 'Photo publication server ready' as result;
