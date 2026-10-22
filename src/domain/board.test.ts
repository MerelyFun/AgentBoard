import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../data/demo';
import {
  filterRuns, formatAbsoluteTime, formatRelativeTime, PROJECTS, ROLE_LABELS,
  sortEvents, STALE_AFTER_MS, statusForRun,
} from './board';
import type { BoardEvent, RunStatus } from './board';

const NOW = new Date('2026-10-22T04:30:00Z');
const snapshot = () => createDemoSnapshot(NOW);

describe('reported activity freshness', () => {
  it('marks an old active report unknown without claiming the run stopped or failed', () => {
    const run = snapshot().runs.find((item) => item.id === 'demo-incremental-developer')!;
    expect(statusForRun(run, NOW)).toBe('unknown');
    expect(run.status).toBe('running');
    expect(statusForRun({ ...run, status: 'blocked' }, NOW)).toBe('unknown');
    expect(statusForRun({ ...run, status: 'submitted' }, NOW)).toBe('unknown');
  });

  it('keeps confirmed terminal results regardless of age', () => {
    const run = snapshot().runs[0];
    const terminal: RunStatus[] = ['passed', 'failed', 'inconclusive', 'stopped'];
    for (const status of terminal) {
      expect(statusForRun({ ...run, status, lastReportedAt: '2020-01-01T00:00:00Z' }, NOW)).toBe(status);
    }
  });

  it('handles the freshness boundary, missing dates and future clock skew honestly', () => {
    const run = snapshot().runs[0];
    const lastReportedAt = new Date(NOW.getTime() - STALE_AFTER_MS).toISOString();
    expect(statusForRun({ ...run, lastReportedAt }, NOW)).toBe('running');
    expect(statusForRun({ ...run, lastReportedAt }, NOW.getTime() + 1)).toBe('unknown');
    expect(statusForRun({ ...run, lastReportedAt: 'invalid' }, NOW)).toBe('unknown');
    expect(statusForRun({ ...run, lastReportedAt: '2026-10-23T00:00:00Z' }, NOW)).toBe('running');
  });
});

describe('board filters', () => {
  it('supports eight role labels and filters technical leadership independently from developers', () => {
    expect(ROLE_LABELS).toEqual({
      'game-producer': '制作人', 'game-tech-lead': '技术负责人',
      'game-developer': '开发', 'game-verifier': '验收',
      'game-art-lead': '美术统筹', 'game-asset-artist': '原画与资产',
      'game-ui-artist': 'UI设计', 'game-vfx-artist': '动效与特效',
    });
    const runs = snapshot().runs;
    const leads = filterRuns(runs, { role: 'game-tech-lead', query: '技术负责人' }, NOW);
    expect(leads).toHaveLength(2);
    expect(leads.every((run) => run.lead)).toBe(true);
    expect(filterRuns(runs, { role: 'game-developer' }, NOW).every((run) => run.role === 'game-developer')).toBe(true);
    expect(runs.find((run) => run.id === 'demo-cat-developer-b')?.parentRunId).toBe('demo-cat-developer-a');
  });

  it.each([
    ['game-art-lead', '美术统筹'], ['game-asset-artist', '原画与资产'],
    ['game-ui-artist', 'UI设计'], ['game-vfx-artist', '动效与特效'],
  ] as const)('filters explicit %s reports without reclassifying developer summaries', (role, label) => {
    const original = snapshot().runs[0];
    const artist = { ...original, id: `art-${role}`, role, label };
    const developer = { ...original, id: 'legacy-art', role: 'game-developer' as const,
      summary: `岗位 ${role}：${label}` };
    const runs = [artist, developer];
    expect(filterRuns(runs, { role, query: label }, NOW)).toEqual([artist]);
    expect(filterRuns(runs, { role: 'game-developer' }, NOW)).toEqual([developer]);
    expect(filterRuns(runs, { role, status: 'running' }, NOW)).toEqual([artist]);
    expect(filterRuns([{ ...artist, lastReportedAt: '2020-01-01T00:00:00Z' }], { role, status: 'running' }, NOW)).toEqual([]);
  });

  it('combines project, role, displayed status and multiword phase/task search', () => {
    const runs = snapshot().runs;
    expect(filterRuns(runs, {
      projectId: 'cat-and-dog', role: 'game-developer', status: 'submitted',
      query: '毛球街 M1a 重试 开发',
    }, NOW).map((run) => run.id)).toEqual(['demo-cat-developer-b']);
    expect(filterRuns(runs, { query: '3MATCH 平台' }, NOW)).toHaveLength(3);
    expect(filterRuns(runs, { query: '两块地 自动经营', status: 'unknown' }, NOW)).toHaveLength(1);
    expect(filterRuns(runs, { projectId: '3match', role: 'game-verifier' }, NOW)).toEqual([]);
  });

  it('searches phase names and does not confuse raw status with displayed freshness', () => {
    const runs = snapshot().runs;
    expect(filterRuns(runs, { query: '  环境与平台风险  ' }, NOW)).toHaveLength(3);
    expect(filterRuns(runs, { status: 'running' }, NOW).every((run) => run.id !== 'demo-incremental-developer')).toBe(true);
    expect(filterRuns(runs, { query: '待确认' }, NOW).map((run) => run.id)).toEqual(['demo-incremental-developer']);
    expect(filterRuns(runs, { projectId: 'all', role: 'all', status: 'all', query: '  ' }, NOW)).toEqual(runs);
  });

  it('preserves the source data when filtering and sorting', () => {
    const data = snapshot();
    const original = structuredClone(data);
    const filtered = filterRuns(Object.freeze(data.runs), { role: 'game-developer' }, NOW);
    const ordered = sortEvents(Object.freeze(data.events));
    expect(filtered).not.toBe(data.runs);
    expect(ordered).not.toBe(data.events);
    expect(data).toEqual(original);
  });
});

describe('event ordering and Chinese dates', () => {
  it('sorts newest first and puts invalid dates last, preserving ties', () => {
    const base = snapshot().events[0];
    const events: BoardEvent[] = [
      { ...base, id: 'bad', at: 'invalid' },
      { ...base, id: 'old', at: '2026-10-21T00:00:00Z' },
      { ...base, id: 'new-1', at: NOW.toISOString() },
      { ...base, id: 'new-2', at: NOW.toISOString() },
    ];
    expect(sortEvents(events).map((event) => event.id)).toEqual(['new-1', 'new-2', 'old', 'bad']);
  });

  it('uses safe Chinese relative times and never produces a negative future interval', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('刚刚');
    expect(formatRelativeTime(NOW.getTime() + 90_000, NOW)).toBe('刚刚');
    expect(formatRelativeTime(NOW.getTime() - 120_000, NOW)).toBe('2 分钟前');
    expect(formatRelativeTime(NOW.getTime() - 7_200_000, NOW)).toBe('2 小时前');
    expect(formatRelativeTime(NOW.getTime() - 172_800_000, NOW)).toBe('2 天前');
    expect(formatRelativeTime('invalid', NOW)).toBe('时间未知');
    expect(formatRelativeTime(NOW, Number.NaN)).toBe('时间未知');
  });

  it('formats absolute timestamps in Shanghai time independent of host timezone', () => {
    expect(formatAbsoluteTime(NOW)).toContain('2026/10/22');
    expect(formatAbsoluteTime(NOW)).toContain('12:30:00');
    expect(formatAbsoluteTime('invalid')).toBe('时间未知');
  });
});

describe('demo isolation', () => {
  it('keeps real project metadata free of invented progress', () => {
    expect(PROJECTS).toHaveLength(3);
    expect(PROJECTS.every((project) => project.stage === undefined && project.lastReportedAt === undefined)).toBe(true);
    expect(snapshot().runs).toHaveLength(11);
    expect(snapshot().events).toHaveLength(14);
    expect(new Set(snapshot().runs.map((run) => run.role)).size).toBe(8);
  });

  it('creates independent examples relative to the requested time', () => {
    const first = snapshot();
    first.projects[0].stage!.name = 'changed';
    first.runs[0].summary = 'changed';
    const second = createDemoSnapshot(NOW.getTime() + 60_000);
    expect(second.projects[0].stage!.name).toBe('环境与平台风险');
    expect(second.runs[0].summary).not.toBe('changed');
    expect(Date.parse(second.runs[0].lastReportedAt) - Date.parse(snapshot().runs[0].lastReportedAt)).toBe(60_000);
  });
});
