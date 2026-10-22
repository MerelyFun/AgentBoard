export const ART_ROLES = ['game-art-lead', 'game-asset-artist', 'game-ui-artist', 'game-vfx-artist'] as const;
export const ROLES = ['game-producer', 'game-tech-lead', 'game-developer', 'game-verifier', ...ART_ROLES] as const;
const SUBMITTING_ROLES: readonly string[] = ['game-developer', 'game-tech-lead', ...ART_ROLES];
export const KINDS = ['started', 'checkpoint', 'blocked', 'unblocked', 'submitted', 'verification', 'stopped', 'cancelled'] as const;
export type Role = typeof ROLES[number];
export type ProjectId = string;
export interface ReportEvent {
  schema_version: 1; event_id: string; occurred_at: string; run_id: string;
  instance_id: string; parent_run_id: string | null; project_id: ProjectId;
  role: Role; lead: boolean; task_id: string;
  milestone: { id: string; name: string }; step: { id: string; name: string };
  kind: typeof KINDS[number]; summary: string; evidence: string[];
  verdict?: 'pass' | 'fail' | 'inconclusive';
}
const REQUIRED = ['schema_version', 'event_id', 'occurred_at', 'run_id', 'instance_id', 'parent_run_id', 'project_id', 'role', 'lead', 'task_id', 'milestone', 'step', 'kind', 'summary', 'evidence'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) throw new Error('invalid_fields');
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('invalid_text');
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('invalid_uuid');
  return value.toLowerCase();
}
/** Matches the browser/importer contract; registration and writer scope remain database gates. */
function projectId(value: unknown): ProjectId {
  if (typeof value !== 'string' || !value.length || value.length > 200 || value === 'all' || /[\s\u0000-\u001f\u007f]/.test(value)) throw new Error('invalid_project_id');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error('invalid_choice');
  return value as T;
}
function stage(value: unknown) {
  const item = object(value); keys(item, ['id', 'name']);
  return { id: text(item.id, 80), name: text(item.name, 200) };
}
/** Calendar validation matches the local importer, including Python microseconds. */
function timestamp(value: unknown): string {
  const at = text(value, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(at);
  if (!match) throw new Error('invalid_timestamp');
  const [, year, month, day, hour, minute, second, , zone, zoneHour, zoneMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== 'Z' && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) || !Number.isFinite(Date.parse(at))) throw new Error('invalid_timestamp');
  return at;
}
export function validateReport(value: unknown): ReportEvent {
  const item = object(value); keys(item, REQUIRED, ['verdict']);
  if (item.schema_version !== 1 || typeof item.lead !== 'boolean') throw new Error('invalid_schema');
  const role = choice(item.role, ROLES), kind = choice(item.kind, KINDS);
  if (item.lead && role !== 'game-developer' && role !== 'game-tech-lead') throw new Error('invalid_lead');
  if (kind === 'submitted' && !SUBMITTING_ROLES.includes(role)) throw new Error('invalid_role_action');
  let verdict: ReportEvent['verdict'];
  if (kind === 'verification') {
    if (role !== 'game-verifier') throw new Error('invalid_role_action');
    verdict = choice(item.verdict, ['pass', 'fail', 'inconclusive'] as const);
  } else if (Object.hasOwn(item, 'verdict')) throw new Error('invalid_verdict');
  if (!Array.isArray(item.evidence) || item.evidence.length > 32) throw new Error('invalid_evidence');
  const event: ReportEvent = {
    schema_version: 1, event_id: uuid(item.event_id), occurred_at: timestamp(item.occurred_at),
    run_id: uuid(item.run_id), instance_id: text(item.instance_id, 200),
    parent_run_id: item.parent_run_id === null ? null : uuid(item.parent_run_id),
    project_id: projectId(item.project_id), role, lead: role === 'game-tech-lead' || item.lead,
    task_id: text(item.task_id, 200), milestone: stage(item.milestone), step: stage(item.step), kind,
    summary: text(item.summary, 2000), evidence: item.evidence.map((entry) => text(entry, 2048)),
    ...(verdict ? { verdict } : {}),
  };
  if (event.parent_run_id === event.run_id) throw new Error('invalid_parent');
  return event;
}
export function writerAllows(event: ReportEvent, writer: { role: string; project_ids: string[] }): boolean {
  return writer.role === event.role && writer.project_ids.includes(event.project_id);
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
