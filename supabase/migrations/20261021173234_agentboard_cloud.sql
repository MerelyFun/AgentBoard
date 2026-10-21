-- One private board. Browser access is authenticated AND explicitly authorized.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.agentboard_writers (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  role text not null check (role in ('game-producer','game-tech-lead','game-developer','game-verifier')),
  project_ids text[] not null default array['3match','cat-and-dog','incremental-xxx'],
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  check (project_ids <@ array['3match','cat-and-dog','incremental-xxx']::text[] and cardinality(project_ids) > 0)
);
create table private.agentboard_access_codes (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  viewer_email text not null unique check (viewer_email like '%@example.invalid'),
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.agentboard_writers enable row level security;
alter table private.agentboard_access_codes enable row level security;
revoke all on private.agentboard_writers, private.agentboard_access_codes from public, anon, authenticated;
grant select on private.agentboard_writers, private.agentboard_access_codes to service_role;

create table public.agentboard_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.agentboard_projects (
  project_id text primary key check (project_id in ('3match','cat-and-dog','incremental-xxx')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.agentboard_runs (
  run_id uuid primary key,
  project_id text not null references public.agentboard_projects(project_id),
  parent_run_id uuid,
  context jsonb not null,
  payload jsonb not null,
  last_event_at timestamptz not null,
  last_event_id uuid not null,
  updated_at timestamptz not null default now()
);
create table public.agentboard_events (
  event_id uuid primary key,
  run_id uuid not null,
  project_id text not null references public.agentboard_projects(project_id),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  projection jsonb not null
);
create index agentboard_events_run_order on public.agentboard_events(run_id, occurred_at desc, event_id desc);
create index agentboard_events_project_order on public.agentboard_events(project_id, occurred_at desc, event_id desc);
create index agentboard_events_order on public.agentboard_events(occurred_at desc, event_id desc);
create index agentboard_runs_project on public.agentboard_runs(project_id);
create index agentboard_runs_parent on public.agentboard_runs(parent_run_id) where parent_run_id is not null;
create index agentboard_runs_order on public.agentboard_runs(last_event_at desc, last_event_id desc);

alter table public.agentboard_viewers enable row level security;
alter table public.agentboard_projects enable row level security;
alter table public.agentboard_runs enable row level security;
alter table public.agentboard_events enable row level security;
revoke all on public.agentboard_viewers, public.agentboard_projects, public.agentboard_runs, public.agentboard_events from public, anon, authenticated;
grant select on public.agentboard_viewers, public.agentboard_projects, public.agentboard_runs, public.agentboard_events to authenticated;
grant select, insert, update, delete on public.agentboard_viewers, public.agentboard_projects, public.agentboard_runs, public.agentboard_events to service_role;

create policy viewer_own_membership on public.agentboard_viewers for select to authenticated using (user_id = (select auth.uid()));
create policy authorized_viewers on public.agentboard_projects for select to authenticated
  using (exists (select 1 from public.agentboard_viewers v where v.user_id = (select auth.uid())));
create policy authorized_viewers on public.agentboard_runs for select to authenticated
  using (exists (select 1 from public.agentboard_viewers v where v.user_id = (select auth.uid())));
create policy authorized_viewers on public.agentboard_events for select to authenticated
  using (exists (select 1 from public.agentboard_viewers v where v.user_id = (select auth.uid())));

insert into public.agentboard_projects(project_id, payload) values
  ('3match', '{"id":"3match","name":"3Match","gameName":"星灯魔女","shortName":"3M","color":"#7C5CFC"}'),
  ('cat-and-dog', '{"id":"cat-and-dog","name":"CatAndDog","gameName":"毛球街保卫战","shortName":"CD","color":"#188B80"}'),
  ('incremental-xxx', '{"id":"incremental-xxx","name":"IncrementalXxx","gameName":"星际财团","shortName":"IX","color":"#E8A522"}');

-- These RPCs are callable only by the Edge Functions' service role.
create function public.agentboard_writer(p_token_hash text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('role', w.role, 'project_ids', to_jsonb(w.project_ids))
  from private.agentboard_writers w where w.token_hash = p_token_hash and not w.revoked;
$$;
create function public.agentboard_viewer_credential(p_token_hash text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('viewer_email', a.viewer_email)
  from private.agentboard_access_codes a where a.token_hash = p_token_hash and not a.revoked;
$$;
create function public.agentboard_add_viewer(p_user_id uuid, p_token_hash text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from private.agentboard_access_codes a
    where a.token_hash = p_token_hash and not a.revoked
  ) then return false; end if;
  insert into public.agentboard_viewers(user_id) values (p_user_id) on conflict do nothing;
  return true;
end;
$$;

create function public.agentboard_ingest(p_event jsonb, p_token_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_event_id uuid := (p_event->>'event_id')::uuid;
  v_run_id uuid := (p_event->>'run_id')::uuid;
  v_project text := p_event->>'project_id';
  v_role text := p_event->>'role';
  v_context jsonb;
  v_existing jsonb;
  v_latest jsonb;
  v_status_event jsonb;
  v_evidence jsonb;
  v_verdict text;
  v_status text;
  v_projection jsonb;
  v_run_payload jsonb;
  v_related record;
begin
  if not exists (select 1 from private.agentboard_writers w where w.token_hash = p_token_hash
    and not w.revoked and w.role = v_role and v_project = any(w.project_ids)) then
    raise exception 'writer_scope_mismatch' using errcode = '42501';
  end if;
  -- Serialize a project's projections; the event UUID lock also covers retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agentboard-project:' || v_project, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agentboard-run:' || v_run_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agentboard-event:' || v_event_id::text, 0));
  select e.payload into v_existing from public.agentboard_events e where e.event_id = v_event_id;
  if found then
    if v_existing <> p_event then raise exception 'event_id_conflict' using errcode = '23505'; end if;
    return jsonb_build_object('accepted', true, 'event_id', v_event_id, 'duplicate', true);
  end if;
  v_context := p_event - array['schema_version','event_id','occurred_at','kind','summary','evidence','verdict'];
  select r.context into v_existing from public.agentboard_runs r where r.run_id = v_run_id;
  if found and v_existing <> v_context then raise exception 'run_context_conflict' using errcode = '23514'; end if;

  -- Missing parents are allowed: independently queued events can arrive out of order.
  -- Once both ends exist, enforce dispatch role and immutable stage/project context.
  for v_related in
    select r.context as parent_context, v_context as child_context from public.agentboard_runs r
      where r.run_id = (p_event->>'parent_run_id')::uuid
    union all
    select v_context, r.context from public.agentboard_runs r where r.parent_run_id = v_run_id
  loop
    if v_related.child_context->>'project_id' <> v_related.parent_context->>'project_id'
      or v_related.child_context->'milestone' <> v_related.parent_context->'milestone'
      or v_related.child_context->'step' <> v_related.parent_context->'step'
      or not (
        (v_related.child_context->>'role' in ('game-tech-lead','game-verifier') and v_related.parent_context->>'role' = 'game-producer')
        or (v_related.child_context->>'role' = 'game-developer' and v_related.parent_context->>'role' in ('game-producer','game-tech-lead'))
      ) then raise exception 'parent_context_conflict' using errcode = '23514'; end if;
  end loop;

  v_projection := jsonb_strip_nulls(jsonb_build_object(
    'id', v_event_id, 'projectId', v_project, 'runId', v_run_id, 'role', v_role,
    'kind', p_event->>'kind', 'summary', p_event->>'summary', 'at', p_event->>'occurred_at',
    'evidence', p_event->'evidence', 'verdict', p_event->>'verdict'));
  insert into public.agentboard_events(event_id, run_id, project_id, occurred_at, payload, projection)
    values (v_event_id, v_run_id, v_project, (p_event->>'occurred_at')::timestamptz, p_event, v_projection);

  select e.payload into v_latest from public.agentboard_events e where e.run_id = v_run_id order by e.occurred_at desc, e.event_id desc limit 1;
  select e.payload into v_status_event from public.agentboard_events e where e.run_id = v_run_id and e.payload->>'kind' <> 'checkpoint'
    order by e.occurred_at desc, e.event_id desc limit 1;
  select e.payload->'evidence' into v_evidence from public.agentboard_events e
    where e.run_id = v_run_id and jsonb_array_length(e.payload->'evidence') > 0 order by e.occurred_at desc, e.event_id desc limit 1;
  select e.payload->>'verdict' into v_verdict from public.agentboard_events e where e.run_id = v_run_id and e.payload->>'kind' = 'verification'
    order by e.occurred_at desc, e.event_id desc limit 1;
  v_status := case v_status_event->>'kind'
    when 'started' then 'running' when 'unblocked' then 'running'
    when 'blocked' then 'blocked' when 'submitted' then 'submitted'
    when 'stopped' then 'stopped' when 'cancelled' then 'stopped'
    when 'verification' then case v_status_event->>'verdict' when 'pass' then 'passed' when 'fail' then 'failed' else 'inconclusive' end
    else 'unknown' end;
  v_run_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', v_run_id, 'projectId', v_project, 'role', v_role,
    'label', case v_role when 'game-producer' then '制作人' when 'game-tech-lead' then '技术负责人'
      when 'game-verifier' then '验收' else case when (p_event->>'lead')::boolean then '开发 · 主程' else '开发' end end,
    'task', p_event->>'task_id', 'stage', p_event->'milestone', 'step', p_event->'step',
    'status', v_status, 'lastReportedAt', v_latest->>'occurred_at', 'summary', v_latest->>'summary',
    'evidence', coalesce(v_evidence, '[]'::jsonb), 'parentRunId', p_event->>'parent_run_id',
    'instanceId', p_event->>'instance_id', 'lead', p_event->'lead', 'verdict', v_verdict));
  insert into public.agentboard_runs(run_id, project_id, parent_run_id, context, payload, last_event_at, last_event_id)
    values (v_run_id, v_project, (p_event->>'parent_run_id')::uuid, v_context, v_run_payload,
      (v_latest->>'occurred_at')::timestamptz, (v_latest->>'event_id')::uuid)
    on conflict (run_id) do update set payload = excluded.payload, last_event_at = excluded.last_event_at,
      last_event_id = excluded.last_event_id, updated_at = now();
  if v_role = 'game-producer' then
    select e.payload into v_latest from public.agentboard_events e
      where e.project_id = v_project and e.payload->>'role' = 'game-producer' order by e.occurred_at desc, e.event_id desc limit 1;
    update public.agentboard_projects set payload = payload || jsonb_build_object(
      'stage', v_latest->'milestone', 'step', v_latest->'step', 'summary', v_latest->>'summary', 'lastReportedAt', v_latest->>'occurred_at'),
      updated_at = now() where project_id = v_project;
  end if;
  return jsonb_build_object('accepted', true, 'event_id', v_event_id, 'duplicate', false);
end;
$$;

-- Invoker preserves RLS even for direct RPC calls. A non-member gets no data.
create function public.agentboard_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(p.payload order by p.project_id) from public.agentboard_projects p), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(r.payload order by r.last_event_at desc, r.last_event_id desc) from public.agentboard_runs r), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(t.projection order by t.occurred_at desc, t.event_id desc) from
      (select e.projection, e.occurred_at, e.event_id from public.agentboard_events e order by e.occurred_at desc, e.event_id desc limit 200) t), '[]'::jsonb));
$$;

revoke all on function public.agentboard_writer(text), public.agentboard_viewer_credential(text),
  public.agentboard_add_viewer(uuid,text), public.agentboard_ingest(jsonb,text), public.agentboard_snapshot() from public, anon, authenticated;
grant execute on function public.agentboard_writer(text), public.agentboard_viewer_credential(text),
  public.agentboard_add_viewer(uuid,text), public.agentboard_ingest(jsonb,text) to service_role;
grant execute on function public.agentboard_snapshot() to authenticated, service_role;

alter publication supabase_realtime add table public.agentboard_projects, public.agentboard_runs, public.agentboard_events;
