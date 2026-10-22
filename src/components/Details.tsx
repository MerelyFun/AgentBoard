import { Clock3, FileText } from 'lucide-react';
import { Dialog } from './Dialog';
import { Status } from './AgentList';
import { EVENT_LABELS, ROLE_LABELS, formatAbsoluteTime, type AgentRun, type BoardEvent, type Project } from '../domain/board';
import { getAgentIdentity, resolveEventRun } from '../domain/presentation';
import { RoleAvatar } from './AgentIdentity';

function Evidence({ items }: { items?: string[] }) {
  return items?.length ? <ul className="evidence-list">{items.map((item, i) => <li key={`${i}-${item}`}><FileText size={15} /><code>{item}</code></li>)}</ul> : <p className="muted">本次未附证据引用</p>;
}

export function RunDetails({ run, runs = [], projects, events, now, demo, onClose }: {
  run: AgentRun; runs?: AgentRun[]; projects: readonly Project[]; events: BoardEvent[]; now: number; demo: boolean; onClose: () => void;
}) {
  const project = projects.find((p) => p.id === run.projectId);
  const identity = getAgentIdentity(run, runs);
  const ownEvents = events.filter((event) => resolveEventRun(event, [run]));
  return <Dialog title="执行详情" onClose={onClose} wide>
    <div className="detail-top"><span className="muted">{project?.name ?? run.projectId} / {ROLE_LABELS[run.role]}{demo ? ' · 演示数据' : ''}</span><Status run={run} now={now} /></div>
    <div className="detail-identity"><RoleAvatar role={run.role} /><div><strong>{identity.label}</strong><code>{identity.idLabel}：{identity.fullId}</code></div></div>
    <h3 className="detail-task">{run.task}</h3>
    <div className="stage-detail"><span className="field-label">大阶段</span><strong>{run.stage.id} · {run.stage.name}</strong><span className="field-label">小阶段</span><strong>{run.step.id} · {run.step.name}</strong></div>
    <p className="detail-summary">{run.summary}</p>
    <p className="detail-time"><Clock3 size={15} />最后上报 · {formatAbsoluteTime(run.lastReportedAt)}</p>
    {run.verdict ? <p className="verdict-note">本次验收结论：{({ pass: '通过', fail: '未通过', inconclusive: '无法确认' })[run.verdict]}。结论只适用于本次验收范围。</p> : null}
    <h4>证据引用</h4><Evidence items={run.evidence} />
    <h4>本次执行的关键事件</h4>
    {ownEvents.length ? <ol className="detail-events">{ownEvents.map((event) => <li key={event.id}><span>{EVENT_LABELS[event.kind] ?? event.kind}</span><p>{event.summary}</p><time dateTime={event.at}>{formatAbsoluteTime(event.at)}</time></li>)}</ol> : <p className="muted">暂无本次执行的关键事件</p>}
    <details className="technical-details"><summary>执行标识</summary><dl><dt>run_id</dt><dd>{run.id}</dd>{run.parentRunId ? <><dt>parent_run_id</dt><dd>{run.parentRunId}</dd></> : null}{run.instanceId ? <><dt>instance_id</dt><dd>{run.instanceId}</dd></> : null}</dl></details>
    <p className="dialog-footnote">展示最后一次自报记录，不代表对进程的实时观测。</p>
  </Dialog>;
}

export function EventDetails({ event, run, runs = [], projects, demo, onClose }: {
  event: BoardEvent; run?: AgentRun; runs?: AgentRun[]; projects: readonly Project[]; demo: boolean; onClose: () => void;
}) {
  const matchedRun = run ? resolveEventRun(event, [run]) : undefined;
  const identity = getAgentIdentity(event, matchedRun ? [matchedRun, ...runs] : []);
  return <Dialog title="关键事件" onClose={onClose}>
    <p className="muted">{projects.find((p) => p.id === event.projectId)?.name ?? event.projectId}{demo ? ' · 演示数据' : ''}</p>
    <div className="detail-identity"><RoleAvatar role={event.role} /><div><strong>{identity.label}</strong>{identity.fullId ? <code>{identity.idLabel}：{identity.fullId}</code> : <span className="muted">未关联执行</span>}</div></div>
    <div className="detail-event-header"><span className={`event-kind kind-${event.kind}`}>{EVENT_LABELS[event.kind] ?? event.kind}</span><time className="detail-time" dateTime={event.at}>{formatAbsoluteTime(event.at)} · 上海时间</time></div>
    <h3 className="detail-task">{event.summary}</h3>
    {matchedRun ? <><p className="field-label">所属任务</p><p className="detail-summary">{matchedRun.task}</p><div className="stage-detail"><span className="field-label">大阶段</span><strong>{matchedRun.stage.id} · {matchedRun.stage.name}</strong><span className="field-label">小阶段</span><strong>{matchedRun.step.id} · {matchedRun.step.name}</strong></div></> : <p className="muted">任务与阶段未关联</p>}
    {event.verdict ? <p className="verdict-note">本次验收结论：{({ pass: '通过', fail: '未通过', inconclusive: '无法确认' })[event.verdict]}。</p> : null}
    <h4>证据引用</h4><Evidence items={event.evidence} />
    <details className="technical-details"><summary>事件与执行标识</summary><dl><dt>event_id</dt><dd>{event.id}</dd>{event.runId ? <><dt>run_id</dt><dd>{event.runId}</dd></> : null}{identity.instanceId ? <><dt>instance_id</dt><dd>{identity.instanceId}</dd></> : null}</dl></details>
  </Dialog>;
}
