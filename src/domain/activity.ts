import { statusForRun, type AgentRun, type BoardEvent, type Now } from './board';
import { resolveEventRun } from './presentation';

export type ActivityScope = 'active' | 'unconfirmed' | 'history' | 'all';

export const ACTIVITY_SCOPE_LABELS: Record<ActivityScope, string> = {
  active: '活跃',
  unconfirmed: '待确认',
  history: '历史',
  all: '全部',
};

/** A stale report is unconfirmed; it is never evidence that an agent stopped. */
export function activityScopeForRun(run: AgentRun, now: Now = Date.now()): Exclude<ActivityScope, 'all'> {
  const status = statusForRun(run, now);
  if (status === 'running' || status === 'blocked') return 'active';
  return status === 'unknown' ? 'unconfirmed' : 'history';
}

export function isActiveRun(run: AgentRun, now: Now = Date.now()): boolean {
  return activityScopeForRun(run, now) === 'active';
}

export function filterRunsByActivity(
  runs: readonly AgentRun[], scope: ActivityScope, now: Now = Date.now(),
): AgentRun[] {
  return runs.filter((run) => scope === 'all' || activityScopeForRun(run, now) === scope);
}

/** Resolve against the full roster so filtering cannot invent or lose event ownership. */
export function filterEventsByActivity(
  events: readonly BoardEvent[], runs: readonly AgentRun[], scope: ActivityScope, now: Now = Date.now(),
): BoardEvent[] {
  return events.filter((event) => {
    if (scope === 'all') return true;
    const run = resolveEventRun(event, runs);
    return run !== undefined && activityScopeForRun(run, now) === scope;
  });
}

export function countRunActivity(runs: readonly AgentRun[], now: Now = Date.now()): Record<ActivityScope, number> {
  const counts: Record<ActivityScope, number> = { active: 0, unconfirmed: 0, history: 0, all: runs.length };
  for (const run of runs) counts[activityScopeForRun(run, now)] += 1;
  return counts;
}
