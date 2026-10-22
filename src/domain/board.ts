export type ProjectId = '3match' | 'cat-and-dog' | 'incremental-xxx';
export const AGENT_ROLES = [
  'game-producer', 'game-tech-lead', 'game-developer', 'game-verifier',
  'game-art-lead', 'game-asset-artist', 'game-ui-artist', 'game-vfx-artist',
] as const;
export type AgentRole = typeof AGENT_ROLES[number];
export type RunStatus =
  | 'running'
  | 'blocked'
  | 'submitted'
  | 'passed'
  | 'failed'
  | 'inconclusive'
  | 'stopped'
  | 'unknown';
export type DisplayStatus = RunStatus | 'unknown';
export type VerificationVerdict = 'pass' | 'fail' | 'inconclusive';
export type TimeValue = string | number | Date;
export type Now = number | Date;

export interface StageRef {
  id: string;
  name: string;
}

export interface Project {
  id: ProjectId;
  name: string;
  gameName: string;
  shortName?: string;
  color?: string;
  stage?: StageRef;
  step?: StageRef;
  summary?: string;
  lastReportedAt?: string;
}

export interface AgentRun {
  id: string;
  projectId: ProjectId;
  role: AgentRole;
  label: string;
  task: string;
  stage: StageRef;
  step: StageRef;
  status: RunStatus;
  lastReportedAt: string;
  summary: string;
  evidence?: string[];
  parentRunId?: string;
  instanceId?: string;
  lead?: boolean;
  verdict?: VerificationVerdict;
}

export interface BoardEvent {
  id: string;
  projectId: ProjectId;
  runId?: string;
  role: AgentRole;
  kind: string;
  summary: string;
  at: string;
  evidence?: string[];
  verdict?: VerificationVerdict;
}

export interface BoardSnapshot {
  projects: Project[];
  runs: AgentRun[];
  events: BoardEvent[];
}

export type Snapshot = BoardSnapshot;

// Project identity only. Live stage and progress must come from reported data.
export const PROJECTS: readonly Project[] = [
  { id: '3match', name: '3Match', gameName: '星灯魔女', shortName: '3M', color: '#7C5CFC' },
  { id: 'cat-and-dog', name: 'CatAndDog', gameName: '毛球街保卫战', shortName: 'CD', color: '#188B80' },
  { id: 'incremental-xxx', name: 'IncrementalXxx', gameName: '星际财团', shortName: 'IX', color: '#E8A522' },
];

export const ROLE_LABELS: Record<AgentRole, string> = {
  'game-producer': '制作人',
  'game-tech-lead': '技术负责人',
  'game-developer': '开发',
  'game-verifier': '验收',
  'game-art-lead': '美术统筹',
  'game-asset-artist': '原画与资产',
  'game-ui-artist': 'UI设计',
  'game-vfx-artist': '动效与特效',
};

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  running: '进行中',
  blocked: '受阻',
  submitted: '已提交',
  passed: '验收通过',
  failed: '验收未通过',
  inconclusive: '无法确认',
  stopped: '已结束',
  unknown: '待确认',
};

export const EVENT_LABELS: Record<string, string> = {
  started: '启动',
  resumed: '恢复',
  stage_confirmed: '确认阶段',
  task_started: '开始任务',
  checkpoint: '关键进展',
  blocked: '遇到阻塞',
  unblocked: '解除阻塞',
  submitted: '提交',
  verification: '验收结果',
  stopped: '结束',
  cancelled: '取消',
};

export const STALE_AFTER_MS = 20 * 60 * 1000;

function timestamp(value: TimeValue): number {
  return value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
}

/** Old reports mean "unknown", never an inferred agent failure or termination. */
export function statusForRun(run: AgentRun, now: Now = Date.now()): DisplayStatus {
  if (run.status !== 'running' && run.status !== 'blocked' && run.status !== 'submitted') {
    return run.status;
  }
  const reportedAt = timestamp(run.lastReportedAt);
  const current = timestamp(now);
  return !Number.isFinite(reportedAt) || !Number.isFinite(current) || current - reportedAt > STALE_AFTER_MS
    ? 'unknown'
    : run.status;
}

export interface RunFilters {
  projectId?: ProjectId | 'all';
  role?: AgentRole | 'all';
  status?: DisplayStatus | 'all';
  query?: string;
}

export function filterRuns(
  runs: readonly AgentRun[],
  filters: RunFilters = {},
  now: Now = Date.now(),
): AgentRun[] {
  const terms = (filters.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return runs.filter((run) => {
    const status = statusForRun(run, now);
    if (filters.projectId && filters.projectId !== 'all' && run.projectId !== filters.projectId) return false;
    if (filters.role && filters.role !== 'all' && run.role !== filters.role) return false;
    if (filters.status && filters.status !== 'all' && status !== filters.status) return false;
    if (!terms.length) return true;
    const project = PROJECTS.find((item) => item.id === run.projectId);
    const searchable = [
      run.id, run.projectId, project?.name, project?.gameName,
      run.role, ROLE_LABELS[run.role], run.label, run.task,
      run.stage.id, run.stage.name, run.step.id, run.step.name,
      status, STATUS_LABELS[status], run.summary,
    ].join(' ').toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

/** Newest first; do not change the caller's array. Invalid dates sort last. */
export function sortEvents(events: readonly BoardEvent[]): BoardEvent[] {
  const sortableTime = (event: BoardEvent) => {
    const time = timestamp(event.at);
    return Number.isFinite(time) ? time : -Infinity;
  };
  return [...events].sort((a, b) => sortableTime(b) - sortableTime(a));
}

export function formatRelativeTime(value: TimeValue, now: Now = Date.now()): string {
  const time = timestamp(value);
  const current = timestamp(now);
  if (!Number.isFinite(time) || !Number.isFinite(current)) return '时间未知';
  const elapsed = Math.max(0, current - time);
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

const absoluteTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function formatAbsoluteTime(value: TimeValue): string {
  const time = timestamp(value);
  return Number.isFinite(time) ? absoluteTimeFormatter.format(time) : '时间未知';
}
