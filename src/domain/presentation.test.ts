import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../data/demo';
import { type AgentRun, type BoardEvent } from './board';
import {
  filterBoardEvents, filterBoardRuns, formatEventClock, formatEventDay, getAgentIdentity, groupEventsByDay, resolveEventRun,
} from './presentation';

const NOW = new Date('2026-10-22T04:30:00Z');
const base = createDemoSnapshot(NOW);
const developer = base.runs.find((run) => run.role === 'game-developer')!;
const makeRun = (overrides: Partial<AgentRun> = {}): AgentRun => ({
  ...developer, id: 'run-1', instanceId: 'aaaa0000-0000-0000-0000-000000001111',
  status: 'running', lastReportedAt: NOW.toISOString(), ...overrides,
});
const makeEvent = (overrides: Partial<BoardEvent> = {}): BoardEvent => ({
  id: 'event-1', runId: 'run-1', projectId: developer.projectId, role: developer.role,
  kind: 'checkpoint', summary: '碰撞检测完成', at: NOW.toISOString(), ...overrides,
});

describe('event ownership and stable agent identities', () => {
  it('distinguishes parallel developers with the same UUID prefix independently of ordering', () => {
    const first = makeRun();
    const second = makeRun({ id: 'run-2', instanceId: 'aaaa0000-0000-0000-0000-000000002222' });
    const runs = [first, second];
    expect(getAgentIdentity(first, runs).shortId).toBe('aaaa…1111');
    expect(getAgentIdentity(second, runs).shortId).toBe('aaaa…2222');
    expect(getAgentIdentity(first, [...runs].reverse())).toEqual(getAgentIdentity(first, runs));
    expect(getAgentIdentity(makeEvent(), runs)).toEqual(getAgentIdentity(first, runs));
  });

  it('falls back to full IDs when different identities share both abbreviated ends', () => {
    const first = makeRun();
    const second = makeRun({ id: 'run-2', instanceId: 'aaaa0000-2222-0000-0000-000000001111' });
    const runs = [first, second];
    expect(getAgentIdentity(first, runs).shortId).toBe(first.instanceId);
    expect(getAgentIdentity(second, runs).shortId).toBe(second.instanceId);
    expect(getAgentIdentity(first, runs).label).not.toBe(getAgentIdentity(second, runs).label);
  });

  it('requires run ID, project and role to agree instead of guessing by role', () => {
    const run = makeRun();
    expect(resolveEventRun(makeEvent(), [run])).toBe(run);
    expect(resolveEventRun(makeEvent({ projectId: 'incremental-xxx' }), [run])).toBeUndefined();
    expect(resolveEventRun(makeEvent({ role: 'game-verifier' }), [run])).toBeUndefined();
    expect(resolveEventRun(makeEvent({ runId: undefined }), [run])).toBeUndefined();
    expect(resolveEventRun(makeEvent({ runId: 'missing' }), [run])).toBeUndefined();
  });

  it.each([['game-ui-artist', 'UI设计'], ['game-systems-designer', '玩法策划'], ['game-balance-designer', '数值策划']] as const)('keeps %s identity stable across filtering and event ownership', (role, label) => {
    const artist = makeRun({ role, label });
    const parallel = makeRun({ id: 'run-2', role, instanceId: 'aaaa0000-0000-0000-0000-000000002222' });
    const runs = [artist, parallel];
    const report = makeEvent({ role });
    expect(getAgentIdentity(artist, runs)).toMatchObject({ roleLabel: label, shortId: 'aaaa…1111' });
    expect(getAgentIdentity(report, runs)).toEqual(getAgentIdentity(artist, runs));
    expect(getAgentIdentity(artist, [parallel, artist])).toEqual(getAgentIdentity(artist, runs));
    expect(filterBoardRuns(runs, { role, query: `${label} aaaa…1111` }, NOW)).toEqual([artist]);
    expect(filterBoardEvents([report], runs, { role, query: `${label} aaaa…1111` }, NOW)).toEqual([report]);
    expect(resolveEventRun({ ...report, role: 'game-art-lead' }, runs)).toBeUndefined();
  });

  it('labels run fallback honestly and leaves missing ownership explicit', () => {
    const run = makeRun({ instanceId: undefined });
    expect(getAgentIdentity(run)).toMatchObject({ shortId: run.id, idLabel: '执行编号', linked: true });
    expect(getAgentIdentity(makeEvent({ runId: 'missing' }), [run])).toMatchObject({
      fullId: 'missing', idLabel: '执行编号', linked: false,
    });
    const unknown = getAgentIdentity(makeEvent({ runId: undefined }), [run]);
    expect(unknown.label).toContain('未关联执行');
    expect(unknown.fullId).toBeUndefined();
    expect(unknown.linked).toBe(false);
  });
});

describe('timeline filters', () => {
  it('uses dynamic project names consistently for runs and events', () => {
    const run = makeRun({ projectId: 'new-project' });
    const event = makeEvent({ projectId: 'new-project' });
    const projects = [{ id: 'new-project', name: 'FourthProject', gameName: '新世界' }];
    const filters = { projectId: 'new-project', query: 'FourthProject 新世界 aaaa…1111' };
    expect(filterBoardRuns([run], filters, NOW, projects)).toEqual([run]);
    expect(filterBoardEvents([event], [run], filters, NOW, projects)).toEqual([event]);
    expect(filterBoardRuns([run], filters, NOW, [])).toEqual([]);
    expect(filterBoardEvents([event], [run], filters, NOW, [])).toEqual([]);
  });

  it('finds the same instance and short identifier in both lists and events after filtering or reordering', () => {
    const first = makeRun({ task: '战斗碰撞' });
    const second = makeRun({ id: 'run-2', instanceId: 'aaaa0000-0000-0000-0000-000000002222' });
    const runs = [first, second];
    const shortId = getAgentIdentity(first, runs).shortId;
    const filters = { query: `开发 ${shortId} 战斗碰撞`, status: 'running' as const };
    expect(filterBoardRuns(runs, filters, NOW)).toEqual([first]);
    expect(filterBoardEvents([makeEvent()], runs, filters, NOW)).toHaveLength(1);
    expect(filterBoardRuns(runs, { query: first.instanceId }, NOW)).toEqual([first]);
    expect(getAgentIdentity(first, filterBoardRuns([...runs].reverse(), filters, NOW)).shortId).toBe(shortId);
    expect(getAgentIdentity(first, [...runs].reverse()).shortId).toBe(shortId);
    expect(filterBoardRuns(runs, { query: shortId, role: 'game-verifier' }, NOW)).toEqual([]);
  });

  it('combines project, role, current reported status and multiword event/context search', () => {
    const run = makeRun({ task: '战斗碰撞', stage: { id: 'M1', name: '核心玩法' }, step: { id: 'M1a', name: '碰撞检测' } });
    const event = makeEvent();
    expect(filterBoardEvents([event], [run], {
      projectId: run.projectId, role: run.role, status: 'running', query: '碰撞检测 开发 核心玩法 aaaa',
    }, NOW)).toEqual([event]);
    expect(filterBoardEvents([event], [run], { query: '战斗碰撞 M1a' }, NOW)).toEqual([event]);
    expect(filterBoardEvents([event], [run], { projectId: 'incremental-xxx' }, NOW)).toEqual([]);
    expect(filterBoardEvents([event], [run], { role: 'game-verifier' }, NOW)).toEqual([]);
    expect(filterBoardEvents([event], [run], { query: '不存在' }, NOW)).toEqual([]);
  });

  it('keeps unassociated events searchable but does not infer a status or borrow unrelated context', () => {
    const missing = makeEvent({ runId: 'missing', summary: '独立事件' });
    const mismatched = makeEvent({ role: 'game-verifier', summary: '验收事件' });
    const run = makeRun({ task: '不可泄漏的任务' });
    expect(filterBoardEvents([missing], [run], { query: 'missing 独立事件' }, NOW)).toEqual([missing]);
    expect(filterBoardEvents([missing], [run], { status: 'unknown' }, NOW)).toEqual([]);
    expect(filterBoardEvents([missing], [run], { status: 'running' }, NOW)).toEqual([]);
    expect(filterBoardEvents([mismatched], [run], { query: '不可泄漏' }, NOW)).toEqual([]);
    expect(filterBoardEvents([missing, mismatched], [run], { status: 'all' }, NOW)).toHaveLength(2);
  });

  it('uses freshness-aware statuses and searches metadata without mutating arrays', () => {
    const run = makeRun({ lastReportedAt: '2026-10-20T00:00:00Z' });
    const event = makeEvent();
    const runs = Object.freeze([run]);
    const events = Object.freeze([event]);
    expect(filterBoardEvents(events, runs, { status: 'unknown', query: '待确认' }, NOW)).toEqual([event]);
    expect(filterBoardEvents(events, runs, { status: 'running' }, NOW)).toEqual([]);
    expect(filterBoardEvents(events, runs, { query: run.projectId.toUpperCase() }, NOW)).toEqual([event]);
    expect(events).toEqual([event]);
    expect(runs).toEqual([run]);
  });
});

describe('Shanghai calendar timeline', () => {
  it('puts the Shanghai midnight boundary on the correct day and exposes exact seconds', () => {
    expect(formatEventDay('2026-10-21T15:59:59Z')).toBe('2026-10-21');
    expect(formatEventDay('2026-10-21T16:00:00Z')).toBe('2026-10-22');
    expect(formatEventClock('2026-10-21T16:00:00Z')).toBe('00:00:00');
    expect(formatEventClock(NOW)).toBe('12:30:00');
    expect(formatEventDay('invalid')).toBe('日期未知');
    expect(formatEventClock('invalid')).toBe('--:--:--');
  });

  it('groups newest first with a complete date and leaves unknown timestamps at the end', () => {
    const old = makeEvent({ id: 'old', at: '2026-10-21T15:59:59Z' });
    const recent = makeEvent({ id: 'recent', at: NOW.toISOString() });
    const midnight = makeEvent({ id: 'midnight', at: '2026-10-21T16:00:00Z' });
    const unknown = makeEvent({ id: 'unknown', at: 'invalid' });
    const events = Object.freeze([old, midnight, unknown, recent]);
    const groups = groupEventsByDay(events, NOW);
    expect(groups.map((group) => group.key)).toEqual(['2026-10-22', '2026-10-21', '日期未知']);
    expect(groups[0].label).toContain('今天');
    expect(groups[1].label).toContain('昨天');
    expect(groups[0].events.map((event) => event.id)).toEqual(['recent', 'midnight']);
    expect(events.map((event) => event.id)).toEqual(['old', 'midnight', 'unknown', 'recent']);
  });
});
