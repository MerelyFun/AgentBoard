import { useEffect, useRef } from 'react';
import { ArrowUpRight, ChevronRight, Inbox, SlidersHorizontal } from 'lucide-react';
import { RoleAvatar } from './AgentIdentity';
import { Pagination, usePagination } from './Pagination';
import { getAgentIdentity } from '../domain/presentation';
import { ACTIVITY_SCOPE_LABELS, type ActivityScope } from '../domain/activity';
import { STATUS_LABELS, formatAbsoluteTime, formatRelativeTime, statusForRun,
  type AgentRun, type Project } from '../domain/board';

export function Status({ run, now }: { run: AgentRun; now: number }) {
  const status = statusForRun(run, now);
  return <span className={`run-status status-${status}`} title={status === 'unknown' ? (run.status === 'unknown' ? '仅有部分上报，尚不能确认本次执行状态。' : `最后报告：${STATUS_LABELS[run.status]}。超过20分钟未更新，当前状态待确认。`) : '来自 Agent 最后一次主动上报'}>
    <span aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

export function AgentList({ runs, identityRuns, projects, total, now, demo, hasReports, scope, onShowAll, emptyTitle, emptyDescription, connectLabel, onConnect, onClear, onRun, onDemo, onImport, viewKey = '' }: {
  runs: AgentRun[]; identityRuns: AgentRun[]; projects: readonly Project[]; total: number; now: number;
  demo: boolean; hasReports: boolean; onClear: () => void; onRun: (run: AgentRun) => void; onDemo: () => void; onImport: () => void;
  emptyTitle?: string; emptyDescription?: string; connectLabel?: string; onConnect?: () => void;
  scope: ActivityScope; onShowAll: () => void;
  viewKey?: string;
}) {
  const noScopeReports = hasReports && total === 0;
  const pagination = usePagination(runs.length, 20, viewKey);
  const tableRef = useRef<HTMLDivElement>(null);
  const visibleRuns = runs.slice(pagination.startIndex, pagination.endIndex);
  useEffect(() => { tableRef.current?.scrollTo({ top: 0 }); }, [pagination.page, viewKey]);
  return <section className="panel agents-panel" aria-labelledby="agents-title">
    <div className="section-heading"><h2 id="agents-title">Agent 执行</h2><span>{ACTIVITY_SCOPE_LABELS[scope]} · {runs.length} 个{demo ? '示例' : '执行'}{runs.length !== total ? ` / 共 ${total}` : ''}</span></div>
    {runs.length ? <><div className="agent-table" ref={tableRef} role="region" aria-label="本页 Agent 执行名单，可滚动查看更多" tabIndex={0}>
      <div className="table-heading"><span>Agent</span><span>任务与阶段</span><span>状态 / 最后上报</span></div>
      <ul className="agent-rows">{visibleRuns.map((run) => {
        const project = projects.find((p) => p.id === run.projectId);
        const identity = getAgentIdentity(run, identityRuns);
        return <li key={run.id}><button className="agent-row" onClick={() => onRun(run)} aria-label={`查看 ${identity.label} · ${run.task}`}>
          <span className="run-identity"><RoleAvatar role={run.role} />
            <span className="run-name"><strong>{identity.roleLabel}</strong><code title={`${identity.idLabel}：${identity.fullId}`}>{identity.shortId}</code><small>{project?.name ?? run.projectId}</small></span>
          </span>
          <span className="run-work" title={`${run.task} · ${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}`}><strong className="run-task">{run.task}</strong>
            <span className="run-stage"><span>{run.stage.id} · {run.stage.name}</span><small>{run.step.id} · {run.step.name}</small></span>
          </span>
          <span className="run-report"><Status run={run} now={now} />
            <time dateTime={run.lastReportedAt} title={formatAbsoluteTime(run.lastReportedAt)}>{formatRelativeTime(run.lastReportedAt, now)}</time><ChevronRight className="row-chevron" size={15} />
          </span>
        </button></li>;
      })}</ul>
    </div><Pagination {...pagination} onPageChange={pagination.setPage} label="执行名单分页" itemLabel="个执行" /></> : <div className="empty-state">
      {hasReports ? <SlidersHorizontal size={30} strokeWidth={1.4} /> : <Inbox size={34} strokeWidth={1.3} />}
      <h3>{noScopeReports ? (scope === 'active' ? '暂无活跃 Agent' : `暂无${ACTIVITY_SCOPE_LABELS[scope]}执行`) : hasReports ? '没有匹配的 Agent' : emptyTitle ?? '等待第一条上报'}</h3>
      <p>{noScopeReports ? '其他记录仍然保留，新上报到来后会自动更新。' : hasReports ? '试试其他角色、状态或关键词。' : emptyDescription ?? '接入后，这里会显示任务、阶段和关键行动。'}</p>
      {noScopeReports ? <button className="button" onClick={onShowAll}>查看全部记录</button> : hasReports ? <button className="button" onClick={onClear}>清除筛选</button> : onConnect ? <button className="button primary" onClick={onConnect}>{connectLabel ?? '连接设置'}</button> : <div className="empty-actions"><button className="button primary" onClick={onDemo}>查看演示<ArrowUpRight size={15} /></button><button className="button" onClick={onImport}>导入上报</button></div>}
    </div>}
    <p className="list-note">状态来自主动上报；20 分钟未更新时标为“待确认”。</p>
  </section>;
}
