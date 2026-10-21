import {
  EVENT_LABELS, PROJECTS, ROLE_LABELS, STATUS_LABELS, filterRuns, sortEvents, statusForRun,
  type AgentRun, type BoardEvent, type Now, type RunFilters, type TimeValue,
} from './board';

export interface AgentIdentity {
  label: string;
  roleLabel: string;
  shortId: string;
  fullId?: string;
  idLabel?: '实例编号' | '执行编号';
  runId?: string;
  instanceId?: string;
  linked: boolean;
}

/** A role alone never establishes ownership, including when a run ID was reused. */
export function resolveEventRun(event: BoardEvent, runs: readonly AgentRun[]): AgentRun | undefined {
  if (!event.runId) return undefined;
  return runs.find((run) => run.id === event.runId
    && run.projectId === event.projectId && run.role === event.role);
}

function identityValue(run: AgentRun): string {
  return run.instanceId?.trim() || run.id;
}

function abbreviatedId(value: string): string {
  const compact = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ? value.replaceAll('-', '') : value;
  return compact.length > 12 ? `${compact.slice(0, 4)}…${compact.slice(-4)}` : compact;
}

/** Prefix + suffix is stable across sorting/filtering; a genuine collision uses the full ID. */
export function getAgentIdentity(source: AgentRun | BoardEvent, runs: readonly AgentRun[] = []): AgentIdentity {
  const isRun = 'task' in source;
  const run = isRun ? source : resolveEventRun(source, runs);
  const roleLabel = ROLE_LABELS[source.role];
  const runId = isRun ? source.id : source.runId;
  const instanceId = run?.instanceId?.trim() || undefined;
  const fullId = instanceId || runId;
  if (!fullId) return { label: `${roleLabel} · 未关联执行`, roleLabel, shortId: '', linked: false };

  const candidate = abbreviatedId(fullId);
  const collision = runs.some((item) => {
    const other = identityValue(item);
    return other !== fullId && abbreviatedId(other) === candidate;
  });
  const shortId = collision ? fullId : candidate;
  return {
    label: `${roleLabel} · #${shortId}`, roleLabel, shortId, fullId,
    idLabel: instanceId ? '实例编号' : '执行编号', runId, instanceId, linked: Boolean(run),
  };
}

/** The global search also accepts the exact agent identifiers shown in the UI. */
export function filterBoardRuns(
  runs: readonly AgentRun[], filters: RunFilters = {}, now: Now = Date.now(),
): AgentRun[] {
  const terms = (filters.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = filterRuns(runs, { ...filters, query: '' }, now);
  if (!terms.length) return filtered;
  return filtered.filter((run) => {
    const identity = getAgentIdentity(run, runs);
    const identifiers = [identity.fullId, identity.shortId, identity.label].join(' ').toLocaleLowerCase();
    return terms.every((term) => identifiers.includes(term) || filterRuns([run], { query: term }, now).length > 0);
  });
}

/** Filter events against the complete run roster, never a pre-filtered list of runs. */
export function filterBoardEvents(
  events: readonly BoardEvent[], runs: readonly AgentRun[], filters: RunFilters = {}, now: Now = Date.now(),
): BoardEvent[] {
  const terms = (filters.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return events.filter((event) => {
    if (filters.projectId && filters.projectId !== 'all' && event.projectId !== filters.projectId) return false;
    if (filters.role && filters.role !== 'all' && event.role !== filters.role) return false;
    const run = resolveEventRun(event, runs);
    const status = run ? statusForRun(run, now) : undefined;
    // An unassociated event does not establish any current run status, even "unknown".
    if (filters.status && filters.status !== 'all' && status !== filters.status) return false;
    if (!terms.length) return true;
    const project = PROJECTS.find((item) => item.id === event.projectId);
    const identity = getAgentIdentity(event, runs);
    const searchable = [
      event.id, event.summary, event.projectId, project?.name, project?.gameName,
      event.role, ROLE_LABELS[event.role], event.kind, EVENT_LABELS[event.kind],
      event.runId, identity.fullId, identity.shortId, identity.label,
      run?.label, run?.task, run?.stage.id, run?.stage.name, run?.step.id, run?.step.name,
      status, status ? STATUS_LABELS[status] : undefined,
    ].join(' ').toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
const clockFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const dayLabelFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
});

function timeOf(value: TimeValue): number {
  return value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
}

/** ISO date key in Shanghai, independent of the browser's local timezone. */
export function formatEventDay(value: TimeValue): string {
  const time = timeOf(value);
  if (!Number.isFinite(time)) return '日期未知';
  const parts = dayFormatter.formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatEventClock(value: TimeValue): string {
  const time = timeOf(value);
  return Number.isFinite(time) ? clockFormatter.format(time) : '--:--:--';
}

export interface EventDayGroup {
  key: string;
  label: string;
  events: BoardEvent[];
}

export function groupEventsByDay(events: readonly BoardEvent[], now: Now = Date.now()): EventDayGroup[] {
  const today = formatEventDay(now);
  const yesterday = formatEventDay(timeOf(now) - 86_400_000);
  const groups: EventDayGroup[] = [];
  for (const event of sortEvents(events)) {
    const key = formatEventDay(event.at);
    const previous = groups.at(-1);
    if (previous?.key === key) previous.events.push(event);
    else {
      const time = timeOf(event.at);
      const date = Number.isFinite(time) ? dayLabelFormatter.format(time) : '日期未知';
      const relative = key === today ? '今天 · ' : key === yesterday ? '昨天 · ' : '';
      groups.push({ key, label: `${relative}${date}`, events: [event] });
    }
  }
  return groups;
}
