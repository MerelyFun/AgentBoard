import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, type AgentRun, type BoardEvent, type ProjectId, type RunStatus } from './board';
import {
  activityScopeForRun, countRunActivity, filterEventsByActivity, filterRunsByActivity, isActiveRun,
} from './activity';

const NOW = new Date('2026-10-22T04:30:00Z');
const makeRun = (overrides: Partial<AgentRun> = {}): AgentRun => ({
  id: 'run-1', projectId: '3match', role: 'game-developer', label: '开发',
  instanceId: 'instance-1', task: '完成战斗循环',
  stage: { id: 'M1', name: '核心玩法' }, step: { id: 'M1a', name: '单局循环' },
  status: 'running', lastReportedAt: NOW.toISOString(), summary: '正在实现', ...overrides,
});
const makeEvent = (overrides: Partial<BoardEvent> = {}): BoardEvent => ({
  id: 'event-1', projectId: '3match', role: 'game-developer', runId: 'run-1',
  kind: 'checkpoint', summary: '关键进展', at: NOW.toISOString(), ...overrides,
});

describe('activity visibility', () => {
  it('preserves simultaneous instances of the same role in all three projects', () => {
    const projectIds: ProjectId[] = ['3match', 'cat-and-dog', 'incremental-xxx'];
    const runs = projectIds.flatMap((projectId, projectIndex) => [
      makeRun({ id: `${projectId}-first`, projectId, instanceId: `instance-${projectIndex}-first` }),
      makeRun({ id: `${projectId}-second`, projectId, instanceId: `instance-${projectIndex}-second`, parentRunId: `${projectId}-first` }),
    ]);
    expect(filterRunsByActivity(runs, 'active', NOW)).toEqual(runs);
    expect(countRunActivity(runs, NOW)).toEqual({ active: 6, unconfirmed: 0, history: 0, all: 6 });
  });

  it('keeps running and blocked reports active through exactly 20 minutes and then marks them unconfirmed', () => {
    const lastReportedAt = new Date(NOW.getTime() - STALE_AFTER_MS).toISOString();
    for (const status of ['running', 'blocked'] as const) {
      const run = makeRun({ status, lastReportedAt });
      expect(activityScopeForRun(run, NOW)).toBe('active');
      expect(isActiveRun(run, NOW)).toBe(true);
      expect(activityScopeForRun(run, NOW.getTime() + 1)).toBe('unconfirmed');
      expect(isActiveRun(run, NOW.getTime() + 1)).toBe(false);
      expect(run.status).toBe(status);
    }
  });

  it('lets a fresh report restore visibility without pretending the previous stale report was stopped', () => {
    const staleRun = makeRun({ lastReportedAt: new Date(NOW.getTime() - STALE_AFTER_MS - 1).toISOString() });
    const freshRun = { ...staleRun, lastReportedAt: NOW.toISOString() };
    expect(filterRunsByActivity([staleRun], 'active', NOW)).toEqual([]);
    expect(filterRunsByActivity([staleRun], 'unconfirmed', NOW)).toEqual([staleRun]);
    expect(filterRunsByActivity([freshRun], 'active', NOW)).toEqual([freshRun]);
    expect(staleRun.status).toBe('running');
  });

  it('hides submissions and confirmed terminal outcomes from active visibility', () => {
    const statuses: RunStatus[] = ['submitted', 'passed', 'failed', 'inconclusive', 'stopped'];
    const runs = statuses.map((status) => makeRun({ id: status, status }));
    expect(filterRunsByActivity(runs, 'active', NOW)).toEqual([]);
    expect(filterRunsByActivity(runs, 'history', NOW)).toEqual(runs);
    expect(countRunActivity(runs, NOW)).toEqual({ active: 0, unconfirmed: 0, history: 5, all: 5 });
  });

  it('keeps unknown and invalid or stale nonterminal reports unconfirmed', () => {
    const runs = [
      makeRun({ id: 'unknown', status: 'unknown' }),
      makeRun({ id: 'invalid', lastReportedAt: 'invalid' }),
      makeRun({ id: 'stale-submission', status: 'submitted', lastReportedAt: '2020-01-01T00:00:00Z' }),
    ];
    expect(filterRunsByActivity(runs, 'unconfirmed', NOW)).toEqual(runs);
    expect(countRunActivity(runs, NOW)).toEqual({ active: 0, unconfirmed: 3, history: 0, all: 3 });
  });

  it('does not revive a stopped run because its latest checkpoint or report timestamp is recent', () => {
    const run = makeRun({ status: 'stopped' });
    const checkpoint = makeEvent();
    expect(isActiveRun(run, NOW)).toBe(false);
    expect(filterEventsByActivity([checkpoint], [run], 'active', NOW)).toEqual([]);
    expect(filterEventsByActivity([checkpoint], [run], 'history', NOW)).toEqual([checkpoint]);
    expect(run.status).toBe('stopped');
  });
});

describe('event activity visibility', () => {
  it('matches run ID, project and role strictly and includes unassociated events only in all', () => {
    const run = makeRun();
    const linked = makeEvent();
    const unassociated = [
      makeEvent({ id: 'different-project', projectId: 'cat-and-dog' }),
      makeEvent({ id: 'different-role', role: 'game-producer' }),
      makeEvent({ id: 'missing-run', runId: 'absent' }),
      makeEvent({ id: 'missing-run-id', runId: undefined }),
    ];
    const events = [linked, ...unassociated];
    expect(filterEventsByActivity(events, [run], 'active', NOW)).toEqual([linked]);
    expect(filterEventsByActivity(unassociated, [run], 'unconfirmed', NOW)).toEqual([]);
    expect(filterEventsByActivity(unassociated, [run], 'history', NOW)).toEqual([]);
    expect(filterEventsByActivity(events, [run], 'all', NOW)).toEqual(events);
  });

  it('uses each run in the complete roster rather than inferring status from another instance', () => {
    const runs = [
      makeRun(),
      makeRun({ id: 'run-2', status: 'stopped' }),
      makeRun({ id: 'run-3', lastReportedAt: '2020-01-01T00:00:00Z' }),
    ];
    const events = runs.map((run) => makeEvent({ id: `event-${run.id}`, runId: run.id }));
    expect(filterEventsByActivity(events, runs, 'active', NOW)).toEqual([events[0]]);
    expect(filterEventsByActivity(events, runs, 'history', NOW)).toEqual([events[1]]);
    expect(filterEventsByActivity(events, runs, 'unconfirmed', NOW)).toEqual([events[2]]);
  });

  it('returns new arrays without reordering or mutating the caller data', () => {
    const runs = Object.freeze([Object.freeze(makeRun({ id: 'run-2' })), Object.freeze(makeRun())]);
    const events = Object.freeze([Object.freeze(makeEvent({ runId: 'run-2' })), Object.freeze(makeEvent({ id: 'event-2' }))]);
    const before = structuredClone({ runs, events });
    expect(filterRunsByActivity(runs, 'all', NOW)).not.toBe(runs);
    expect(filterEventsByActivity(events, runs, 'all', NOW)).not.toBe(events);
    expect(filterRunsByActivity(runs, 'active', NOW).map((run) => run.id)).toEqual(['run-2', 'run-1']);
    countRunActivity(runs, NOW);
    expect({ runs, events }).toEqual(before);
  });
});
