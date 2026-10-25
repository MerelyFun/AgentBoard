/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importReportFiles, REPORT_IMPORT_LIMITS } from './report-import';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const event = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1, event_id: id(1), occurred_at: '2026-10-22T04:00:00.000001+00:00',
  run_id: id(100), instance_id: 'codex-thread-a', parent_run_id: null,
  project_id: 'cat-and-dog', role: 'game-developer', lead: false, task_id: 'M1a-battle',
  milestone: { id: 'M1', name: '核心原型' }, step: { id: 'M1a', name: '完整单局胜败与重试' },
  kind: 'started', summary: '开始本次任务', evidence: [], ...overrides,
});
const file = (value: unknown, name = 'event.json') => ({ name, text: JSON.stringify(value) });

describe('local report projection', () => {
  it('imports parallel runs independently, with no demo data or invented project stages', () => {
    const snapshot = importReportFiles([
      file(event()),
      file(event({ event_id: id(2), run_id: id(101), instance_id: 'codex-thread-b', lead: true, task_id: 'M1a-ui', kind: 'submitted' })),
    ]);
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]).toMatchObject({ id: 'cat-and-dog', name: 'CatAndDog', gameName: '毛球街保卫战' });
    expect(snapshot.projects.every((project) => project.stage === undefined)).toBe(true);
    expect(snapshot.runs).toHaveLength(2);
    expect(snapshot.runs.find((run) => run.id === id(100))).toMatchObject({ status: 'running', stage: { id: 'M1' }, step: { id: 'M1a' } });
    expect(snapshot.runs.find((run) => run.id === id(101))).toMatchObject({ status: 'submitted', lead: true });
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.events.every((item) => !item.id.startsWith('demo-'))).toBe(true);
  });

  it('builds the project roster from imported reports for any number of projects', () => {
    const projectIds = ['cat-and-dog', 'new-project', 'project-3', 'project-4', 'project-5', '中文项目'];
    const files = projectIds.map((project_id, index) => file(event({
      event_id: id(index + 1), run_id: id(index + 100), project_id,
      ...(project_id === 'new-project' ? { role: 'game-producer' } : {}),
    })));
    const snapshot = importReportFiles(files);
    expect(snapshot.projects.map((project) => project.id)).toEqual(projectIds);
    expect(snapshot.projects.find((project) => project.id === 'new-project')).toMatchObject({
      name: 'new-project', gameName: 'new-project', stage: { id: 'M1' }, step: { id: 'M1a' },
    });
    expect(snapshot.projects.some((project) => project.id === '3match')).toBe(false);
    expect(snapshot.runs).toHaveLength(projectIds.length);
    expect(snapshot.events).toHaveLength(projectIds.length);
  });

  it('orders microseconds correctly and deduplicates exact events regardless of input order', () => {
    const started = event({ event_id: id(9), occurred_at: '2026-10-22T04:00:00.000100Z' });
    const blocked = event({ event_id: id(1), occurred_at: '2026-10-22T04:00:00.000900Z', kind: 'blocked' });
    const snapshot = importReportFiles([file(blocked, 'blocked.json'), file(started), file(started, 'copy.json')]);
    expect(snapshot.runs[0].status).toBe('blocked');
    expect(snapshot.events.map((item) => item.id)).toEqual([id(1), id(9)]);
    expect(importReportFiles([file(started), file(blocked)])).toEqual(snapshot);
  });

  it('uses event ID as a stable tie breaker and allows a partial run to start unknown', () => {
    const first = file(event({ kind: 'checkpoint', event_id: id(1) }));
    expect(importReportFiles([first]).runs[0].status).toBe('unknown');
    const second = file(event({ kind: 'blocked', event_id: id(2) }));
    expect(importReportFiles([second, first])).toEqual(importReportFiles([first, second]));
    expect(importReportFiles([first, second]).runs[0].status).toBe('blocked');
  });

  it('does not let checkpoint clear blocked, submitted or verification states', () => {
    const files = [
      file(event({ kind: 'blocked' })),
      file(event({ event_id: id(2), kind: 'checkpoint', occurred_at: '2026-10-22T04:01:00Z', summary: '补充阻塞证据' })),
    ];
    expect(importReportFiles(files).runs[0]).toMatchObject({ status: 'blocked', summary: '补充阻塞证据' });
    files.push(file(event({ event_id: id(3), kind: 'unblocked', occurred_at: '2026-10-22T04:02:00Z' })));
    expect(importReportFiles(files).runs[0].status).toBe('running');
    files.push(file(event({ event_id: id(4), kind: 'submitted', occurred_at: '2026-10-22T04:03:00Z' })));
    files.push(file(event({ event_id: id(5), kind: 'checkpoint', occurred_at: '2026-10-22T04:04:00Z' })));
    expect(importReportFiles(files).runs[0].status).toBe('submitted');
  });

  it.each([['pass', 'passed'], ['fail', 'failed'], ['inconclusive', 'inconclusive']])('maps verdict %s and retains it after stopped', (verdict, status) => {
    const verification = event({ role: 'game-verifier', kind: 'verification', verdict, evidence: ['docs/result.md'] });
    expect(importReportFiles([file(verification)]).runs[0].status).toBe(status);
    const checkpoint = event({ role: 'game-verifier', kind: 'checkpoint', event_id: id(3), occurred_at: '2026-10-22T04:30:00Z' });
    expect(importReportFiles([file(checkpoint), file(verification)]).runs[0]).toMatchObject({ status, verdict });
    const stopped = event({ role: 'game-verifier', kind: 'stopped', event_id: id(2), occurred_at: '2026-10-22T05:00:00Z' });
    expect(importReportFiles([file(stopped), file(verification)]).runs[0]).toMatchObject({ status: 'stopped', verdict, evidence: ['docs/result.md'] });
  });

  it('keeps cancellation explicit in the event history while ending the run', () => {
    const snapshot = importReportFiles([file(event({ kind: 'cancelled', summary: '用户取消本次执行' }))]);
    expect(snapshot.runs[0].status).toBe('stopped');
    expect(snapshot.events[0]).toMatchObject({ kind: 'cancelled', summary: '用户取消本次执行' });
  });

  it('only takes project stage from the latest producer event, while keeping each run stage', () => {
    const producer = event({ role: 'game-producer', run_id: id(102), task_id: 'plan', milestone: { id: 'M0', name: '准备' }, step: { id: 'M0a', name: '确认目标' } });
    const dev = event({ event_id: id(2), occurred_at: '2026-10-22T06:00:00Z' });
    const snapshot = importReportFiles([file(dev), file(producer)]);
    expect(snapshot.projects.find((project) => project.id === 'cat-and-dog')!.stage).toEqual({ id: 'M0', name: '准备' });
    expect(snapshot.runs.find((run) => run.role === 'game-developer')!.stage.id).toBe('M1');
    expect(snapshot.projects.find((project) => project.id === '3match')).toBeUndefined();
  });

  it('returns a clean empty snapshot and keeps source files and metadata unchanged', () => {
    const files = Object.freeze([Object.freeze(file(event()))]);
    expect(importReportFiles([...files]).events).toHaveLength(1);
    const empty = importReportFiles([]);
    expect(empty.projects).toEqual([]);
    expect(empty.runs).toEqual([]);
    expect(empty.events).toEqual([]);
    expect(empty.projects.every((project) => project.stage === undefined)).toBe(true);
  });

  it('supports independent tech leads and older developer lead=true reports', () => {
    const snapshot = importReportFiles([
      file(event({ role: 'game-tech-lead', lead: true, kind: 'submitted' })),
      file(event({ event_id: id(2), run_id: id(101), role: 'game-developer', lead: true, kind: 'submitted' })),
    ]);
    expect(snapshot.runs.find((run) => run.role === 'game-tech-lead')).toMatchObject({ lead: true, status: 'submitted', label: '技术负责人' });
    expect(snapshot.runs.find((run) => run.role === 'game-developer')).toMatchObject({ lead: true, status: 'submitted', label: '开发 · 主程' });
    const techLead = importReportFiles([file(event({ role: 'game-tech-lead', lead: false }))]).runs[0];
    expect(techLead.lead).toBe(true);
  });

  it.each([
    ['game-art-lead', '美术统筹'], ['game-asset-artist', '原画与资产'],
    ['game-ui-artist', 'UI设计'], ['game-vfx-artist', '动效与特效'],
    ['game-systems-designer', '玩法策划'], ['game-balance-designer', '数值策划'],
  ])('imports %s submissions as their reported role without assigning technical leadership', (role, label) => {
    const snapshot = importReportFiles([
      file(event({ role })),
      file(event({ event_id: id(2), role, kind: 'submitted', occurred_at: '2026-10-22T04:01:00Z' })),
      file(event({ event_id: id(3), role, kind: 'checkpoint', occurred_at: '2026-10-22T04:02:00Z' })),
    ]);
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.runs[0]).toMatchObject({ role, label, status: 'submitted', lead: false,
      instanceId: 'codex-thread-a', stage: { id: 'M1' }, step: { id: 'M1a' } });
    expect(snapshot.events.every((item) => item.role === role)).toBe(true);
    expect(snapshot.projects.every((project) => project.stage === undefined)).toBe(true);
  });

  it('keeps legacy art summaries as developer reports instead of guessing a new role', () => {
    const snapshot = importReportFiles([file(event({ summary: '[game-ui-artist] 岗位：UI设计' }))]);
    expect(snapshot.runs[0]).toMatchObject({ role: 'game-developer', label: '开发' });
    expect(snapshot.events[0].role).toBe('game-developer');
  });
});

describe('all-or-nothing validation', () => {
  it.each([
    ['schema_version', 2, 'schema_version'], ['project_id', '', 'project_id'],
    ['role', 'boss', 'role'], ['kind', 'heartbeat', 'kind'], ['run_id', 'not-a-uuid', 'run_id'],
    ['occurred_at', '2026-02-30T00:00:00Z', 'occurred_at'], ['occurred_at', '2026-10-22T00:00:00', 'occurred_at'],
    ['lead', 'true', 'lead'], ['evidence', 'README.md', 'evidence'], ['summary', '', 'summary'],
  ])('rejects invalid %s and names the offending file', (field, value, message) => {
    expect(() => importReportFiles([file(event(), 'good.json'), file(event({ event_id: id(2), [field]: value }), 'broken.json')]))
      .toThrow(new RegExp(`broken\\.json.*${message}`));
  });

  it.each([' ', ' new-project', 'new-project ', 'new\nproject', 'all', 'a'.repeat(201), 123, null])('rejects malformed project identifier %j', (project_id) => {
    expect(() => importReportFiles([file(event({ project_id }))])).toThrow(/project_id/);
  });

  it('rejects arrays, malformed JSON, missing fields and unknown extra fields', () => {
    expect(() => importReportFiles([file([event()], 'array.json')])).toThrow(/array\.json.*对象/);
    expect(() => importReportFiles([{ name: 'truncated.json', text: '{' }])).toThrow(/truncated\.json.*JSON/);
    const missing: Record<string, unknown> = event();
    delete missing.task_id;
    expect(() => importReportFiles([file(missing)])).toThrow(/缺少字段 task_id/);
    expect(() => importReportFiles([file(event({ access_token: 'not accepted' }))])).toThrow(/未知字段 access_token/);
  });

  it('enforces role and verdict constraints, including developer verification', () => {
    expect(() => importReportFiles([file(event({ kind: 'verification', verdict: 'pass' }))])).toThrow(/仅供 game-verifier/);
    expect(() => importReportFiles([file(event({ role: 'game-tech-lead', lead: true, kind: 'verification', verdict: 'pass' }))])).toThrow(/仅供 game-verifier/);
    expect(() => importReportFiles([file(event({ role: 'game-verifier', kind: 'verification' }))])).toThrow(/verdict/);
    expect(() => importReportFiles([file(event({ role: 'game-verifier', kind: 'verification', verdict: 'passed' }))])).toThrow(/verdict/);
    expect(() => importReportFiles([file(event({ verdict: 'pass' }))])).toThrow(/只能出现在 verification/);
    expect(() => importReportFiles([file(event({ role: 'game-producer', kind: 'submitted' }))])).toThrow(/submitted 仅供/);
    expect(() => importReportFiles([file(event({ role: 'game-producer', lead: true }))])).toThrow(/仅 game-developer/);
  });

  it.each(['game-art-lead', 'game-asset-artist', 'game-ui-artist', 'game-vfx-artist', 'game-systems-designer', 'game-balance-designer'])('rejects technical lead and formal verification claims from %s', (role) => {
    expect(() => importReportFiles([file(event({ role, lead: true }))])).toThrow(/仅 game-developer 或 game-tech-lead/);
    expect(() => importReportFiles([file(event({ role, kind: 'verification', verdict: 'pass' }))])).toThrow(/仅供 game-verifier/);
    expect(() => importReportFiles([file(event({ role, kind: 'submitted', verdict: 'pass' }))])).toThrow(/只能出现在 verification/);
  });

  it('rejects conflicting duplicate IDs and changing a run identity instead of silently overwriting', () => {
    expect(() => importReportFiles([file(event(), 'original.json'), file(event({ summary: '冲突' }), 'conflict.json')])).toThrow(/conflict\.json.*original\.json.*冲突/);
    expect(() => importReportFiles([file(event()), file(event({ event_id: id(2), role: 'game-producer' }), 'changed-role.json')])).toThrow(/changed-role\.json.*上下文.*冲突/);
  });

  it('bounds counts, bytes, summary length and evidence arrays', () => {
    expect(() => importReportFiles(Array.from({ length: 501 }, () => file(event())))).toThrow(/最多.*500/);
    expect(() => importReportFiles([{ name: 'large.json', text: ' '.repeat(REPORT_IMPORT_LIMITS.fileBytes + 1) }])).toThrow(/large\.json.*256 KiB/);
    expect(() => importReportFiles([file(event({ summary: 'a'.repeat(2_001) }))])).toThrow(/summary 超过/);
    expect(() => importReportFiles([file(event({ evidence: Array(33).fill('docs/proof.md') }))])).toThrow(/evidence.*32/);
    const padded = { name: 'padded.json', text: `${JSON.stringify(event())}${' '.repeat(250_000)}` };
    expect(() => importReportFiles(Array(43).fill(padded))).toThrow(/合计超过 10 MiB/);
  });
});

describe('Python reporter contract', () => {
  it('imports real CLI outbox events including both design roles and rejects forbidden CLI actions', () => {
    const temporaryRoot = resolve(tmpdir());
    const dataDir = mkdtempSync(join(temporaryRoot, 'agentboard-report-qa-'));
    const reporter = fileURLToPath(new URL('../../tools/report.py', import.meta.url));
    const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const options = { encoding: 'utf8' as const, env: { ...process.env, AGENTBOARD_DATA_DIR: dataDir, AGENTBOARD_TRANSPORT_CONFIG: join(dataDir, 'no-transport.json'), PYTHONUTF8: '1' } };
    const cli = (...args: string[]): { run_id: string; delivery: string } => JSON.parse(execFileSync(python, [reporter, ...args], options));
    try {
      const producer = cli('begin', '--project', 'cat-and-dog', '--role', 'game-producer',
        '--milestone', 'QA', '隔离合同测试', '--step', 'QA.1', '真实文件导入',
        '--task', 'QA-contract-plan', '--summary', 'QA：临时目录合同测试，不代表游戏进度');
      const lead = cli('begin', '--parent', producer.run_id, '--role', 'game-tech-lead',
        '--task', 'QA-contract-design', '--summary', 'QA：验证技术负责人派工');
      const developer = cli('begin', '--parent', lead.run_id, '--role', 'game-developer',
        '--task', 'QA-contract-dev', '--summary', 'QA：验证开发继承上下文');
      const verifier = cli('begin', '--parent', producer.run_id, '--role', 'game-verifier',
        '--task', 'QA-contract-verify', '--summary', 'QA：验证独立验收事件');
      const designers = ['game-systems-designer', 'game-balance-designer'].map((role) => {
        const designer = cli('begin', '--parent', producer.run_id, '--role', role,
          '--task', `QA-contract-${role}`, '--summary', 'QA：策划继承制作人阶段');
        cli('event', '--run', designer.run_id, '--kind', 'submitted', '--summary', 'QA：设计提交待审');
        return { ...designer, role };
      });
      cli('event', '--run', lead.run_id, '--kind', 'submitted', '--summary', 'QA：技术负责人提交集成');
      cli('event', '--run', developer.run_id, '--kind', 'submitted', '--summary', 'QA：开发提交');
      cli('event', '--run', verifier.run_id, '--kind', 'verification', '--verdict', 'pass',
        '--summary', 'QA：事件格式合同检查通过', '--evidence', 'QA-only/contract-proof.md');
      cli('event', '--run', verifier.run_id, '--kind', 'stopped', '--summary', 'QA：验收测试结束');
      cli('event', '--run', producer.run_id, '--kind', 'checkpoint', '--summary', 'QA：合同测试执行完毕');
      const forbiddenVerification = spawnSync(python, [reporter, 'event', '--run', developer.run_id,
        '--kind', 'verification', '--verdict', 'pass', '--summary', 'QA：应被拒绝'], options);
      expect(forbiddenVerification.status).toBe(1);
      expect(JSON.parse(forbiddenVerification.stdout).message).toContain('仅供 game-verifier');
      const forbiddenSubmission = spawnSync(python, [reporter, 'event', '--run', producer.run_id,
        '--kind', 'submitted', '--summary', 'QA：应被拒绝'], options);
      expect(forbiddenSubmission.status).toBe(1);
      expect(JSON.parse(forbiddenSubmission.stdout).message).toContain('submitted 仅供');
      const outbox = join(dataDir, 'outbox');
      const files = readdirSync(outbox).reverse().map((name) => ({ name, text: readFileSync(join(outbox, name), 'utf8') }));
      const snapshot = importReportFiles(files);
      expect(snapshot.events).toHaveLength(13);
      expect(snapshot.runs).toHaveLength(6);
      for (const designer of designers) {
        expect(snapshot.runs.find((run) => run.id === designer.run_id)).toMatchObject({
          role: designer.role, lead: false, status: 'submitted', parentRunId: producer.run_id,
        });
        expect(snapshot.runs.find((run) => run.id === designer.run_id)?.verdict).toBeUndefined();
      }
      expect(snapshot.runs.find((run) => run.id === lead.run_id)).toMatchObject({ role: 'game-tech-lead', lead: true, status: 'submitted', parentRunId: producer.run_id });
      expect(snapshot.runs.find((run) => run.id === developer.run_id)).toMatchObject({ role: 'game-developer', lead: false, status: 'submitted', parentRunId: lead.run_id });
      expect(snapshot.runs.find((run) => run.id === verifier.run_id)).toMatchObject({ status: 'stopped', verdict: 'pass' });
      expect(snapshot.projects.find((project) => project.id === 'cat-and-dog')!.stage).toEqual({ id: 'QA', name: '隔离合同测试' });
      expect(snapshot.runs.every((run) => run.step.id === 'QA.1')).toBe(true);
    } finally {
      const cleanupTarget = resolve(dataDir);
      const relativeTarget = relative(temporaryRoot, cleanupTarget);
      if (!relativeTarget || relativeTarget.startsWith('..') || resolve(temporaryRoot, relativeTarget) !== cleanupTarget) {
        throw new Error('临时目录清理路径超出预期范围');
      }
      rmSync(cleanupTarget, { recursive: true, force: true });
    }
  });
});
