// Isolated PostgreSQL regression. No cloud credentials or production connection.
// node supabase/tests/design_roles_test.mjs [path/to/@electric-sql/pglite/dist/index.js]
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite');
const db = new PGlite();
const designs = ['game-systems-designer', 'game-balance-designer'];
const allowedParents = {
  'game-producer': [],
  'game-tech-lead': ['game-producer'],
  'game-developer': ['game-producer', 'game-tech-lead'],
  'game-verifier': ['game-producer'],
  'game-art-lead': ['game-producer', 'game-tech-lead'],
  'game-asset-artist': ['game-producer', 'game-tech-lead', 'game-art-lead'],
  'game-ui-artist': ['game-producer', 'game-tech-lead', 'game-art-lead'],
  'game-vfx-artist': ['game-producer', 'game-tech-lead', 'game-art-lead'],
  'game-systems-designer': ['game-producer'],
  'game-balance-designer': ['game-producer'],
};
const roles = Object.keys(allowedParents);
const hashes = Object.fromEntries(roles.map((role, index) => [role, (index + 1).toString(16).repeat(64)]));
function event(role, changes = {}) {
  return {
    schema_version: 1, event_id: randomUUID(), occurred_at: '2026-10-25T00:00:00.123456+00:00',
    run_id: randomUUID(), instance_id: 'isolated-sql-qa', parent_run_id: null,
    project_id: '3match', role, lead: role === 'game-tech-lead', task_id: 'isolated-sql-qa',
    milestone: { id: 'QA', name: 'TEST ONLY' }, step: { id: 'QA.1', name: 'TEST ONLY' },
    kind: 'started', summary: 'ISOLATED SQL TEST ONLY', evidence: [], ...changes,
  };
}
async function ingest(value, token = hashes[value.role]) {
  await db.exec('set role service_role');
  try {
    return (await db.query('select public.agentboard_ingest($1::jsonb,$2) as result', [JSON.stringify(value), token])).rows[0].result;
  } finally { await db.exec('reset role'); }
}
async function reject(value, code = '23514', token) {
  await assert.rejects(() => ingest(value, token), (error) => error.code === code);
}
async function runPayload(id) {
  return (await db.query('select context,payload from public.agentboard_runs where run_id=$1', [id])).rows[0];
}

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create publication supabase_realtime;`);
  const migrations = new URL('../migrations/', import.meta.url);
  const files = (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files.filter((name) => !name.endsWith('_design_roles.sql'))) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  for (const role of roles.filter((role) => !designs.includes(role))) {
    await db.query('insert into private.agentboard_writers(token_hash,role) values ($1,$2)', [hashes[role], role]);
  }
  const legacy = event('game-developer', { lead: true });
  await ingest(legacy);
  const before = await runPayload(legacy.run_id);
  const projectsBefore = (await db.query('select payload from public.agentboard_projects order by project_id')).rows;
  const designMigration = files.filter((name) => name.endsWith('_design_roles.sql'));
  assert.equal(designMigration.length, 1, 'exactly one design role migration');
  await db.exec(await readFile(new URL(designMigration[0], migrations), 'utf8'));
  assert.deepEqual(await runPayload(legacy.run_id), before, 'old developer lead history remains unchanged');
  for (const role of designs) {
    await db.query('insert into private.agentboard_writers(token_hash,role) values ($1,$2)', [hashes[role], role]);
  }

  let projections = 0;
  for (const [role, label] of [['game-systems-designer', '玩法策划'], ['game-balance-designer', '数值策划']]) {
    const submission = event(role, { kind: 'submitted', evidence: ['docs/design.md'] });
    assert.equal((await ingest(submission)).accepted, true);
    assert.deepEqual(await ingest(submission), { accepted: true, event_id: submission.event_id, duplicate: true });
    await reject({ ...submission, summary: 'conflicting duplicate' }, '23505');
    await reject({ ...submission, event_id: randomUUID(), task_id: 'changed immutable task' });
    await ingest({ ...submission, event_id: randomUUID(), kind: 'checkpoint', occurred_at: '2026-10-25T02:00:00Z', summary: 'latest checkpoint', evidence: [] });
    await ingest({ ...submission, event_id: randomUUID(), kind: 'started', occurred_at: '2026-10-24T23:00:00Z', evidence: [] });
    const { payload } = await runPayload(submission.run_id);
    assert.equal(payload.label, label); assert.equal(payload.status, 'submitted');
    assert.equal(payload.role, role); assert.equal(payload.lead, false);
    assert.equal(payload.verdict, undefined); assert.equal(payload.summary, 'latest checkpoint');
    assert.deepEqual(payload.evidence, ['docs/design.md']);
    await reject(event(role), '42501', hashes['game-developer']);
    await reject(event(role), '42501', hashes[designs.find((value) => value !== role)]);
    projections++;
  }
  assert.deepEqual((await db.query('select payload from public.agentboard_projects order by project_id')).rows, projectsBefore, 'design submissions never advance project stage');

  let validPairs = 0, invalidPairs = 0;
  for (const childRole of roles) for (const parentRole of roles) for (const parentFirst of [true, false]) {
    const parent = event(parentRole), child = event(childRole, { parent_run_id: parent.run_id });
    await ingest(parentFirst ? parent : child);
    if (allowedParents[childRole].includes(parentRole)) {
      assert.equal((await ingest(parentFirst ? child : parent)).accepted, true);
      const { payload } = await runPayload(child.run_id);
      assert.equal(payload.parentRunId, parent.run_id);
      assert.deepEqual(payload.stage, parent.milestone); assert.deepEqual(payload.step, parent.step);
      assert.equal(payload.projectId, parent.project_id);
      validPairs++;
    } else { await reject(parentFirst ? child : parent); invalidPairs++; }
  }
  for (const role of designs) for (const difference of [
    { project_id: 'cat-and-dog' }, { milestone: { id: 'OTHER', name: 'TEST ONLY' } }, { step: { id: 'OTHER', name: 'TEST ONLY' } },
  ]) for (const parentFirst of [true, false]) {
    const parent = event('game-producer'), child = event(role, { parent_run_id: parent.run_id, ...difference });
    await ingest(parentFirst ? parent : child); await reject(parentFirst ? child : parent);
  }
  await ingest({ ...legacy, event_id: randomUUID(), kind: 'stopped', occurred_at: '2026-10-25T03:00:00Z' });
  assert.equal((await runPayload(legacy.run_id)).payload.lead, true);
  assert.equal((await runPayload(legacy.run_id)).payload.label, '开发 · 主程');
  assert.equal((await runPayload(legacy.run_id)).payload.role, 'game-developer');
  await db.query('insert into public.agentboard_projects(project_id,payload) values ($1,$2)', ['registered-new', { id: 'registered-new' }]);
  await reject(event(designs[0], { project_id: 'registered-new' }), '42501');
  await db.query('update private.agentboard_writers set project_ids=array_append(project_ids,$1) where role=$2', ['registered-new', designs[0]]);
  await ingest(event(designs[0], { project_id: 'registered-new' }));
  await db.query('update private.agentboard_writers set project_ids=array_append(project_ids,$1) where role=$2', ['unknown-project', designs[0]]);
  await reject(event(designs[0], { project_id: 'unknown-project' }), '23503');
  await assert.rejects(() => db.query('insert into private.agentboard_writers(token_hash,role) values ($1,$2)', ['f'.repeat(64), 'game-designer']), (error) => error.code === '23514');
  await assert.rejects(() => db.query('update private.agentboard_writers set project_ids=array[null]::text[] where role=$1', [designs[0]]), (error) => error.code === '23514');
  const security = (await db.query(`select
    has_function_privilege('anon','public.agentboard_ingest(jsonb,text)','execute') as anon_ingest,
    has_function_privilege('authenticated','public.agentboard_ingest(jsonb,text)','execute') as viewer_ingest,
    has_function_privilege('service_role','public.agentboard_ingest(jsonb,text)','execute') as service_ingest,
    has_function_privilege('authenticated','public.agentboard_snapshot()','execute') as viewer_snapshot,
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relname like 'agentboard_%' and c.relkind='r' and c.relrowsecurity) as rls_tables,
    (select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.agentboard_ingest(jsonb,text)'::regprocedure) as invoker_empty_path`)).rows[0];
  assert.deepEqual(security, { anon_ingest: false, viewer_ingest: false, service_ingest: true, viewer_snapshot: true, rls_tables: 6, invoker_empty_path: true });
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select public.agentboard_snapshot() as snapshot')).rows[0].snapshot, { projects: [], runs: [], events: [] });
  await db.exec('reset role');
  console.log(JSON.stringify({ result: 'passed', database: 'isolated PGlite PostgreSQL', validPairs, invalidPairs, crossContextCases: 12, designProjections: projections, legacyHistory: true, registeredProjectScope: true, deduplication: true, immutableContext: true, outOfOrder: true, security }));
} finally { await db.close(); }
