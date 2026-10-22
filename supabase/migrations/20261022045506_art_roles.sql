-- Extend the existing v1 protocol without rewriting runs or old developer-lead history.
-- Tokens remain private and role-scoped. Existing writer grants/RLS are unchanged.
alter table private.agentboard_writers
  drop constraint agentboard_writers_role_check,
  add constraint agentboard_writers_role_check check (role in (
    'game-producer','game-tech-lead','game-developer','game-verifier',
    'game-art-lead','game-asset-artist','game-ui-artist','game-vfx-artist'
  ));

-- Replace only the dispatch allowlist and display labels. Project/run/event locks,
-- immutable context, deduplication, late-parent validation, ordering and privileges
-- retain the original implementation. An art lead never becomes a technical lead.
create or replace function public.agentboard_ingest(p_event jsonb, p_token_hash text) returns jsonb
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
        or (v_related.child_context->>'role' = 'game-art-lead' and v_related.parent_context->>'role' in ('game-producer','game-tech-lead'))
        or (v_related.child_context->>'role' in ('game-asset-artist','game-ui-artist','game-vfx-artist') and v_related.parent_context->>'role' in ('game-producer','game-tech-lead','game-art-lead'))
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
      when 'game-verifier' then '验收' when 'game-art-lead' then '美术统筹'
      when 'game-asset-artist' then '原画与资产' when 'game-ui-artist' then 'UI设计'
      when 'game-vfx-artist' then '动效与特效'
      else case when (p_event->>'lead')::boolean then '开发 · 主程' else '开发' end end,
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

-- CREATE OR REPLACE retains privileges; restate the service-only boundary explicitly.
revoke all on function public.agentboard_ingest(jsonb,text) from public, anon, authenticated;
grant execute on function public.agentboard_ingest(jsonb,text) to service_role;
