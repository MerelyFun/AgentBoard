import { ArrowUpRight, ChevronRight, Inbox, SlidersHorizontal } from 'lucide-react';
import { RoleAvatar } from './AgentIdentity';
import { getAgentIdentity } from '../domain/presentation';
import { PROJECTS, STATUS_LABELS, formatAbsoluteTime, formatRelativeTime, statusForRun,
  type AgentRun } from '../domain/board';

export function Status({ run, now }: { run: AgentRun; now: number }) {
  const status = statusForRun(run, now);
  return <span className={`run-status status-${status}`} title={status === 'unknown' ? (run.status === 'unknown' ? '仅有部分上报，尚不能确认本次执行状态。' : `最后报告：${STATUS_LABELS[run.status]}。超过20分钟未更新，当前状态待确认。`) : '来自 Agent 最后一次主动上报'}>
    <span aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

export function AgentList({ runs, identityRuns, total, now, demo, hasReports, emptyTitle, emptyDescription, connectLabel, onConnect, onClear, onRun, onDemo, onImport }: {
  runs: AgentRun[]; identityRuns: AgentRun[]; total: number; now: number;
  demo: boolean; hasReports: boolean; onClear: () => void; onRun: (run: AgentRun) => void; onDemo: () => void; onImport: () => void;
  emptyTitle?: string; emptyDescription?: string; connectLabel?: string; onConnect?: () => void;
}) {
  return <section className="panel agents-panel" aria-labelledby="agents-title">
    <div className="section-heading"><h2 id="agents-title">Agent 执行</h2><span>{runs.length} 个{demo ? '示例' : '执行'}{runs.length !== total ? ` / 共 ${total}` : ''}</span></div>
    {runs.length ? <div className="agent-table">
      <div className="table-heading"><span>Agent</span><span>任务与阶段</span><span>状态 / 最后上报</span></div>
      <ul className="agent-rows">{runs.map((run) => {
        const project = PROJECTS.find((p) => p.id === run.projectId)!;
        const identity = getAgentIdentity(run, identityRuns);
        return <li key={run.id}><button className="agent-row" onClick={() => onRun(run)} aria-label={`查看 ${identity.label} · ${run.task}`}>
          <span className="run-identity"><RoleAvatar role={run.role} />
            <span className="run-name"><strong>{identity.roleLabel}</strong><code title={`${identity.idLabel}：${identity.fullId}`}>{identity.shortId}</code><small>{project.name}</small></span>
          </span>
          <span className="run-work"><strong className="run-task">{run.task}</strong>
            <span className="run-stage"><span>{run.stage.id} · {run.stage.name}</span><small>{run.step.id} · {run.step.name}</small></span>
          </span>
          <span className="run-report"><Status run={run} now={now} />
            <time dateTime={run.lastReportedAt} title={formatAbsoluteTime(run.lastReportedAt)}>{formatRelativeTime(run.lastReportedAt, now)}</time><ChevronRight className="row-chevron" size={15} />
          </span>
        </button></li>;
      })}</ul>
    </div> : <div className="empty-state">
      {hasReports ? <SlidersHorizontal size={30} strokeWidth={1.4} /> : <Inbox size={34} strokeWidth={1.3} />}
      <h3>{hasReports ? '没有匹配的 Agent' : emptyTitle ?? '等待第一条上报'}</h3>
      <p>{hasReports ? '试试其他角色、状态或关键词。' : emptyDescription ?? '接入后，这里会显示任务、阶段和关键行动。'}</p>
      {hasReports ? <button className="button" onClick={onClear}>清除筛选</button> : onConnect ? <button className="button primary" onClick={onConnect}>{connectLabel ?? '连接设置'}</button> : <div className="empty-actions"><button className="button primary" onClick={onDemo}>查看演示<ArrowUpRight size={15} /></button><button className="button" onClick={onImport}>导入上报</button></div>}
    </div>}
    <p className="list-note">状态来自主动上报；20 分钟未更新时标为“待确认”。</p>
  </section>;
}
