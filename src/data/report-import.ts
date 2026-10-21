import {
  PROJECTS, ROLE_LABELS,
  type AgentRole, type AgentRun, type BoardSnapshot, type Now, type ProjectId,
  type RunStatus, type StageRef, type VerificationVerdict,
} from '../domain/board';

export const REPORT_IMPORT_LIMITS = {
  files: 500,
  totalBytes: 10 * 1024 * 1024,
  fileBytes: 256 * 1024,
  summary: 2_000,
  evidenceItems: 32,
  evidenceLength: 2_048,
} as const;

type ReportKind = 'started' | 'checkpoint' | 'blocked' | 'unblocked' | 'submitted'
  | 'verification' | 'stopped' | 'cancelled';

interface ReportEvent {
  schema_version: 1;
  event_id: string;
  occurred_at: string;
  run_id: string;
  instance_id: string;
  parent_run_id: string | null;
  project_id: ProjectId;
  role: AgentRole;
  lead: boolean;
  task_id: string;
  milestone: StageRef;
  step: StageRef;
  kind: ReportKind;
  summary: string;
  evidence: string[];
  verdict?: VerificationVerdict;
}

interface ParsedReport {
  event: ReportEvent;
  fileName: string;
  time: bigint;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['game-producer', 'game-tech-lead', 'game-developer', 'game-verifier'] as const;
const KINDS = ['started', 'checkpoint', 'blocked', 'unblocked', 'submitted', 'verification', 'stopped', 'cancelled'] as const;
const VERDICTS = ['pass', 'fail', 'inconclusive'] as const;
const REQUIRED_KEYS = ['schema_version', 'event_id', 'occurred_at', 'run_id', 'instance_id',
  'parent_run_id', 'project_id', 'role', 'lead', 'task_id', 'milestone', 'step', 'kind', 'summary', 'evidence'];

function fail(fileName: string, reason: string): never {
  throw new Error(`导入失败（${fileName}）：${reason}`);
}

function record(value: unknown, fileName: string, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(fileName, `${field} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, required: string[], optional: string[], fileName: string, field: string): void {
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) fail(fileName, `${field} 缺少字段 ${missing.join('、')}`);
  const extra = Object.keys(value).filter((key) => !required.includes(key) && !optional.includes(key));
  if (extra.length) fail(fileName, `${field} 包含未知字段 ${extra.join('、')}`);
}

function text(value: unknown, fileName: string, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) fail(fileName, `${field} 必须是非空字符串`);
  if (value.length > max) fail(fileName, `${field} 超过 ${max} 字符`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(fileName, `${field} 包含非法控制字符`);
  return value;
}

function uuid(value: unknown, fileName: string, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(fileName, `${field} 必须是 UUID`);
  return value.toLowerCase();
}

function choice<T extends string>(value: unknown, choices: readonly T[], fileName: string, field: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    fail(fileName, `${field} 必须为 ${choices.join(' / ')}`);
  }
  return value as T;
}

function stage(value: unknown, fileName: string, field: string): StageRef {
  const object = record(value, fileName, field);
  keys(object, ['id', 'name'], [], fileName, field);
  return { id: text(object.id, fileName, `${field}.id`, 80), name: text(object.name, fileName, `${field}.name`, 200) };
}

/** Preserve Python's microseconds so two events in the same millisecond remain ordered. */
function eventTime(value: unknown, fileName: string): { at: string; time: bigint } {
  const at = text(value, fileName, 'occurred_at', 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(at);
  if (!match) fail(fileName, 'occurred_at 必须是含时区的 ISO 8601 时间');
  const [, year, month, day, hour, minute, second, fraction = '', zone, zoneHour, zoneMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23
    || Number(minute) > 59 || Number(second) > 59
    || (zone !== 'Z' && (Number(zoneHour) > 23 || Number(zoneMinute) > 59))
    || !Number.isFinite(Date.parse(at))) fail(fileName, 'occurred_at 不是有效日期时间');
  return { at, time: BigInt(Date.parse(at)) * 1_000n + BigInt(fraction.padEnd(6, '0').slice(3)) };
}

function parseReport(file: { name: string; text: string }): ParsedReport {
  let raw: unknown;
  try {
    raw = JSON.parse(file.text);
  } catch {
    return fail(file.name, 'JSON 格式不正确；每个文件应包含一条完整事件');
  }
  const value = record(raw, file.name, '事件');
  keys(value, REQUIRED_KEYS, ['verdict'], file.name, '事件');
  if (value.schema_version !== 1) fail(file.name, '仅支持 schema_version 1');
  const role = choice(value.role, ROLES, file.name, 'role');
  const kind = choice(value.kind, KINDS, file.name, 'kind');
  const projectId = choice(value.project_id, PROJECTS.map((project) => project.id), file.name, 'project_id');
  if (typeof value.lead !== 'boolean') fail(file.name, 'lead 必须是布尔值');
  if (value.lead && role !== 'game-developer' && role !== 'game-tech-lead') {
    fail(file.name, '仅 game-developer 或 game-tech-lead 可以 lead=true');
  }
  if (kind === 'submitted' && role !== 'game-developer' && role !== 'game-tech-lead') {
    fail(file.name, 'submitted 仅供 game-developer 或 game-tech-lead');
  }
  let verdict: VerificationVerdict | undefined;
  if (kind === 'verification') {
    if (role !== 'game-verifier') fail(file.name, 'verification 仅供 game-verifier');
    verdict = choice(value.verdict, VERDICTS, file.name, 'verdict');
  } else if (Object.hasOwn(value, 'verdict')) fail(file.name, 'verdict 只能出现在 verification 事件中');
  if (!Array.isArray(value.evidence) || value.evidence.length > REPORT_IMPORT_LIMITS.evidenceItems) {
    fail(file.name, `evidence 必须是最多 ${REPORT_IMPORT_LIMITS.evidenceItems} 项的数组`);
  }
  const { at, time } = eventTime(value.occurred_at, file.name);
  const event: ReportEvent = {
    schema_version: 1,
    event_id: uuid(value.event_id, file.name, 'event_id'),
    occurred_at: at,
    run_id: uuid(value.run_id, file.name, 'run_id'),
    instance_id: text(value.instance_id, file.name, 'instance_id', 200),
    parent_run_id: value.parent_run_id === null ? null : uuid(value.parent_run_id, file.name, 'parent_run_id'),
    // The role is authoritative for new tech-lead runs; retain legacy developer lead=true.
    project_id: projectId, role, lead: role === 'game-tech-lead' || value.lead,
    task_id: text(value.task_id, file.name, 'task_id', 200),
    milestone: stage(value.milestone, file.name, 'milestone'),
    step: stage(value.step, file.name, 'step'), kind,
    summary: text(value.summary, file.name, 'summary', REPORT_IMPORT_LIMITS.summary),
    evidence: value.evidence.map((entry, i) => text(entry, file.name, `evidence[${i}]`, REPORT_IMPORT_LIMITS.evidenceLength)),
    ...(verdict ? { verdict } : {}),
  };
  if (event.parent_run_id === event.run_id) fail(file.name, 'parent_run_id 不能指向本次 run_id');
  return { event, time, fileName: file.name };
}

function compareReports(a: ParsedReport, b: ParsedReport): number {
  return a.time < b.time ? -1 : a.time > b.time ? 1 : a.event.event_id.localeCompare(b.event.event_id);
}

function runIdentity(event: ReportEvent): string {
  return JSON.stringify([event.instance_id, event.parent_run_id, event.project_id, event.role,
    event.lead, event.task_id, event.milestone, event.step]);
}

function nextStatus(event: ReportEvent, previous: RunStatus = 'unknown'): RunStatus {
  switch (event.kind) {
    case 'started': case 'unblocked': return 'running';
    case 'blocked': return 'blocked';
    case 'submitted': return 'submitted';
    case 'verification': return event.verdict === 'pass' ? 'passed' : event.verdict === 'fail' ? 'failed' : 'inconclusive';
    case 'stopped': case 'cancelled': return 'stopped';
    case 'checkpoint': return previous;
  }
}

/** Entirely local import. Freshness remains a display concern handled by statusForRun. */
export function importReportFiles(files: Array<{ name: string; text: string }>, now?: Now): BoardSnapshot {
  if (!Array.isArray(files)) throw new Error('请选择 JSON 事件文件');
  if (files.length > REPORT_IMPORT_LIMITS.files) throw new Error(`一次最多导入 ${REPORT_IMPORT_LIMITS.files} 个文件`);
  if (now !== undefined && !Number.isFinite(now instanceof Date ? now.getTime() : now)) throw new Error('导入时间无效');
  const encoder = new TextEncoder();
  let totalBytes = 0;
  const unique = new Map<string, ParsedReport>();
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255) throw new Error('文件名无效');
    if (typeof file.text !== 'string') fail(file.name, '缺少文件文本');
    const bytes = encoder.encode(file.text).length;
    totalBytes += bytes;
    if (bytes > REPORT_IMPORT_LIMITS.fileBytes) fail(file.name, '单文件超过 256 KiB');
    if (totalBytes > REPORT_IMPORT_LIMITS.totalBytes) fail(file.name, '所选文件合计超过 10 MiB');
    const parsed = parseReport(file);
    const existing = unique.get(parsed.event.event_id);
    if (existing && JSON.stringify(existing.event) !== JSON.stringify(parsed.event)) {
      fail(file.name, `event_id 与 ${existing.fileName} 重复但内容冲突`);
    }
    if (!existing) unique.set(parsed.event.event_id, parsed);
  }
  const chronological = [...unique.values()].sort(compareReports);
  const projects = PROJECTS.map((project) => ({ ...project }));
  const runs = new Map<string, AgentRun>();
  const identities = new Map<string, string>();
  const lastRunEvent = new Map<string, ParsedReport>();
  for (const parsed of chronological) {
    const event = parsed.event;
    const identity = runIdentity(event);
    const existingIdentity = identities.get(event.run_id);
    if (existingIdentity !== undefined && existingIdentity !== identity) {
      fail(parsed.fileName, `run_id ${event.run_id} 的角色、项目、任务或阶段上下文发生冲突`);
    }
    identities.set(event.run_id, identity);
    const previous = runs.get(event.run_id);
    runs.set(event.run_id, {
      id: event.run_id, projectId: event.project_id, role: event.role,
      label: `${ROLE_LABELS[event.role]}${event.role === 'game-developer' && event.lead ? ' · 主程' : ''}`,
      task: event.task_id, stage: { ...event.milestone }, step: { ...event.step },
      status: nextStatus(event, previous?.status), lastReportedAt: event.occurred_at,
      summary: event.summary,
      evidence: event.evidence.length ? [...event.evidence] : previous?.evidence ?? [],
      ...(event.parent_run_id ? { parentRunId: event.parent_run_id } : {}),
      instanceId: event.instance_id, lead: event.lead,
      ...(event.verdict ?? previous?.verdict ? { verdict: event.verdict ?? previous?.verdict } : {}),
    });
    lastRunEvent.set(event.run_id, parsed);
    if (event.role === 'game-producer') {
      const project = projects.find((item) => item.id === event.project_id)!;
      project.stage = { ...event.milestone };
      project.step = { ...event.step };
      project.summary = event.summary;
      project.lastReportedAt = event.occurred_at;
    }
  }
  return {
    projects,
    runs: [...runs.values()].sort((a, b) => compareReports(lastRunEvent.get(b.id)!, lastRunEvent.get(a.id)!)),
    events: [...chronological].reverse().map(({ event }) => ({
      id: event.event_id, projectId: event.project_id, runId: event.run_id,
      role: event.role, kind: event.kind, summary: event.summary, at: event.occurred_at,
      evidence: [...event.evidence], ...(event.verdict ? { verdict: event.verdict } : {}),
    })),
  };
}
