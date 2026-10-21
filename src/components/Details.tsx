import { Clock3, FileText } from 'lucide-react';
import { Dialog } from './Dialog';
import { Status } from './AgentList';
import { EVENT_LABELS, PROJECTS, ROLE_LABELS, formatAbsoluteTime, type AgentRun, type BoardEvent } from '../domain/board';

function Evidence({ items }: { items?: string[] }) {
  return items?.length ? <ul className="evidence-list">{items.map((item, i) => <li key={`${i}-${item}`}><FileText size={15} /><code>{item}</code></li>)}</ul> : <p className="muted">本次未附证据引用</p>;
}

export function RunDetails({ run, events, now, demo, onClose }: { run: AgentRun; events: BoardEvent[]; now: number; demo: boolean; onClose: () => void }) {
  const project = PROJECTS.find((p) => p.id === run.projectId)!;
  return <Dialog title={`${run.label} · 执行详情`} onClose={onClose} wide>
    <div className="detail-top"><span className="muted">{project.name} / {ROLE_LABELS[run.role]}{demo ? ' · 演示数据' : ''}</span><Status run={run} now={now} /></div>
    <h3 className="detail-task">{run.task}</h3>
    <div className="stage-detail"><span className="field-label">大阶段</span><strong>{run.stage.id} · {run.stage.name}</strong><span className="field-label">小阶段</span><strong>{run.step.id} · {run.step.name}</strong></div>
    <p className="detail-summary">{run.summary}</p>
    <p className="detail-time"><Clock3 size={15} />最后上报 · {formatAbsoluteTime(run.lastReportedAt)}</p>
    {run.verdict ? <p className="verdict-note">本次验收结论：{({ pass: '通过', fail: '未通过', inconclusive: '无法确认' })[run.verdict]}。结论只适用于本次验收范围。</p> : null}
    <h4>证据引用</h4><Evidence items={run.evidence} />
    <h4>本次执行的关键事件</h4>
    <ol className="detail-events">{events.map((event) => <li key={event.id}><span>{EVENT_LABELS[event.kind] ?? event.kind}</span><p>{event.summary}</p><time>{formatAbsoluteTime(event.at)}</time></li>)}</ol>
    <details className="technical-details"><summary>执行标识</summary><dl><dt>run_id</dt><dd>{run.id}</dd>{run.parentRunId ? <><dt>parent_run_id</dt><dd>{run.parentRunId}</dd></> : null}{run.instanceId ? <><dt>instance_id</dt><dd>{run.instanceId}</dd></> : null}</dl></details>
    <p className="dialog-footnote">展示最后一次自报记录，不代表对进程的实时观测。</p>
  </Dialog>;
}

export function EventDetails({ event, demo, onClose }: { event: BoardEvent; demo: boolean; onClose: () => void }) {
  return <Dialog title="关键事件" onClose={onClose}>
    <p className="muted">{PROJECTS.find((p) => p.id === event.projectId)?.name} · {ROLE_LABELS[event.role]}{demo ? ' · 演示数据' : ''}</p>
    <h3 className="detail-task">{event.summary}</h3><p>{EVENT_LABELS[event.kind] ?? event.kind} · {formatAbsoluteTime(event.at)}</p>
    {event.verdict ? <p className="verdict-note">本次验收结论：{({ pass: '通过', fail: '未通过', inconclusive: '无法确认' })[event.verdict]}。</p> : null}
    <h4>证据引用</h4><Evidence items={event.evidence} />
    {event.runId ? <details className="technical-details"><summary>执行标识</summary><dl><dt>run_id</dt><dd>{event.runId}</dd></dl></details> : null}
  </Dialog>;
}
