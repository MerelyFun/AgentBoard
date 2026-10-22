import { ART_ROLES, sha256, validateReport, writerAllows } from '../functions/_shared/protocol.ts';
import { allowedOrigin, readJson, respond } from '../functions/_shared/http.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'expected rejection'); }
function base() {
  return {
    schema_version: 1, event_id: '11111111-1111-4111-8111-111111111111',
    occurred_at: '2026-10-21T16:21:42.123456+00:00', run_id: '22222222-2222-4222-8222-222222222222',
    instance_id: 'test', parent_run_id: null, project_id: '3match', role: 'game-producer', lead: false,
    task_id: 'backend-qa', milestone: { id: 'QA', name: '测试' }, step: { id: 'QA1', name: '协议' },
    kind: 'started', summary: '测试记录', evidence: [],
  };
}
Deno.test('validates canonical v1 events and preserves microseconds', () => {
  const event = validateReport(base()); assert(event.occurred_at.endsWith('123456+00:00')); assert(event.role === 'game-producer');
  const upper = { ...base(), event_id: 'AAAAAAAA-1111-4111-8111-111111111111' };
  assert(validateReport(upper).event_id.startsWith('aaaaaaaa'));
});
Deno.test('role credentials cannot impersonate another role or project', () => {
  const event = validateReport(base());
  assert(writerAllows(event, { role: 'game-producer', project_ids: ['3match'] }));
  assert(!writerAllows(event, { role: 'game-developer', project_ids: ['3match'] }));
  assert(!writerAllows(event, { role: 'game-producer', project_ids: ['cat-and-dog'] }));
});
Deno.test('rejects unknown/missing fields, bad schema, limits and UUIDs', () => {
  throws(() => validateReport({ ...base(), extra: true }));
  throws(() => validateReport({ ...base(), schema_version: 2 }));
  throws(() => validateReport({ ...base(), event_id: 'x' }));
  throws(() => validateReport({ ...base(), summary: 'x'.repeat(2001) }));
  throws(() => validateReport({ ...base(), evidence: Array(33).fill('x') }));
  throws(() => validateReport({ ...base(), evidence: ['x'.repeat(2049)] }));
  throws(() => validateReport({ ...base(), step: { id: 'x', name: 'x', extra: true } }));
  throws(() => validateReport({ ...base(), task_id: '\u0000' }));
  throws(() => validateReport({ ...base(), parent_run_id: base().run_id }));
});
Deno.test('rejects invalid calendar dates and accepts leap dates/timezones', () => {
  for (const date of ['2026-02-29T00:00:00Z', '2024-04-31T00:00:00Z', '2026-10-21T24:00:00Z', '2026-10-21T00:00:00+24:00', '2026-10-21T00:00:00.1234567Z', '2026-10-21']) throws(() => validateReport({ ...base(), occurred_at: date }));
  assert(validateReport({ ...base(), occurred_at: '2024-02-29T23:59:59.1+08:00' }).occurred_at.includes('02-29'));
});
Deno.test('enforces actions and keeps legacy developer lead compatibility', () => {
  throws(() => validateReport({ ...base(), kind: 'submitted' }));
  throws(() => validateReport({ ...base(), kind: 'verification', verdict: 'pass' }));
  throws(() => validateReport({ ...base(), verdict: 'pass' }));
  throws(() => validateReport({ ...base(), lead: true }));
  assert(validateReport({ ...base(), role: 'game-developer', lead: true, kind: 'submitted' }).lead);
  assert(validateReport({ ...base(), role: 'game-tech-lead', lead: false, kind: 'submitted' }).lead);
  assert(validateReport({ ...base(), role: 'game-verifier', kind: 'verification', verdict: 'inconclusive' }).verdict === 'inconclusive');
});
Deno.test('art roles submit in their own identity but cannot claim technical lead or verification', () => {
  for (const role of ART_ROLES) {
    const event = validateReport({ ...base(), role, kind: 'submitted', evidence: ['assets/review.png'] });
    assert(event.role === role && event.lead === false && event.verdict === undefined);
    assert(writerAllows(event, { role, project_ids: ['3match'] }));
    assert(!writerAllows(event, { role: 'game-developer', project_ids: ['3match'] }));
    throws(() => validateReport({ ...base(), role, lead: true }));
    throws(() => validateReport({ ...base(), role, kind: 'verification', verdict: 'pass' }));
    throws(() => validateReport({ ...base(), role, kind: 'submitted', verdict: 'pass' }));
  }
  throws(() => validateReport({ ...base(), role: 'game-artist' }));
});
Deno.test('SHA-256 is hex and deterministic without persisting raw credentials', async () => {
  assert(await sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
Deno.test('CORS only echoes approved origins and responses are never cached', () => {
  const request = new Request('https://example.test', { headers: { origin: 'https://xn--hyvt5k.club' } });
  assert(allowedOrigin(request)); assert(respond(request, 200, {}).headers.get('Access-Control-Allow-Origin') === 'https://xn--hyvt5k.club');
  const denied = new Request('https://example.test', { headers: { origin: 'https://evil.example' } });
  assert(!allowedOrigin(denied)); assert(!respond(denied, 403, {}).headers.has('Access-Control-Allow-Origin'));
  assert(respond(request, 200, {}).headers.get('Cache-Control') === 'no-store');
});
Deno.test('body limit works without Content-Length', async () => {
  const request = new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'too long' }) });
  let rejected = false; try { await readJson(request, 4); } catch { rejected = true; } assert(rejected);
  const small = new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' });
  assert((await readJson(small, 30) as { ok: boolean }).ok);
});
