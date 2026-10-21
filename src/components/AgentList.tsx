import { ArrowUpRight, ChevronRight, Inbox, Search, SlidersHorizontal } from 'lucide-react';
import { PROJECTS, ROLE_LABELS, STATUS_LABELS, formatAbsoluteTime, formatRelativeTime, statusForRun,
  type AgentRole, type AgentRun, type DisplayStatus } from '../domain/board';

export function Status({ run, now }: { run: AgentRun; now: number }) {
  const status = statusForRun(run, now);
  return <span className={`run-status status-${status}`} title={status === 'unknown' ? (run.status === 'unknown' ? '仅有部分上报，尚不能确认本次执行状态。' : `最后报告：${STATUS_LABELS[run.status]}。超过20分钟未更新，当前状态待确认。`) : '来自 Agent 最后一次主动上报'}>
    <span aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

export function AgentList({ runs, total, role, status, query, now, demo, hasReports, emptyTitle, emptyDescription, connectLabel, onConnect, onRole, onStatus, onQuery, onClear, onRun, onDemo, onImport }: {
  runs: AgentRun[]; total: number; role: AgentRole | 'all'; status: DisplayStatus | 'all'; query: string; now: number;
  demo: boolean; hasReports: boolean; onRole: (v: AgentRole | 'all') => void; onStatus: (v: DisplayStatus | 'all') => void;
  onQuery: (v: string) => void; onClear: () => void; onRun: (run: AgentRun) => void; onDemo: () => void; onImport: () => void;
  emptyTitle?: string; emptyDescription?: string; connectLabel?: string; onConnect?: () => void;
}) {
  return <section className="panel agents-panel" aria-labelledby="agents-title">
    <div className="section-heading"><h2 id="agents-title">Agent 动态</h2><span>{total} 个{demo ? '示例' : '执行'}{runs.length !== total ? ` · 显示 ${runs.length}` : ''}</span></div>
    <div className="filters">
      <label className="search-input"><Search size={17} /><span className="sr-only">搜索任务</span><input type="search" placeholder="搜索任务…" value={query} onChange={(e) => onQuery(e.target.value)} /></label>
      <label><span className="sr-only">角色筛选</span><select aria-label="角色筛选" value={role} onChange={(e) => onRole(e.target.value as AgentRole | 'all')}>
        <option value="all">全部角色</option>{Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label><span className="sr-only">状态筛选</span><select aria-label="状态筛选" value={status} onChange={(e) => onStatus(e.target.value as DisplayStatus | 'all')}>
        <option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {runs.length ? <div className="agent-table">
      <div className="table-heading"><span>角色 / 当前任务</span><span>大阶段 / 小阶段</span><span>状态</span><span>最后上报</span><span /></div>
      <ul className="agent-rows">{runs.map((run) => {
        const project = PROJECTS.find((p) => p.id === run.projectId)!;
        return <li key={run.id}><button className="agent-row" onClick={() => onRun(run)} aria-label={`查看 ${run.label} · ${run.task}`}>
          <span className="run-identity"><span className={`role-avatar ${run.role}`} aria-hidden="true" />
            <span className="run-name"><strong>{run.label}{run.lead && run.role === 'game-developer' ? <small className="lead-label">主开发</small> : null}</strong><small>{project.name}</small></span>
            <span className="run-task">{run.task}</span>
          </span>
          <span className="run-stage"><span>{run.stage.id} · {run.stage.name}</span><small>{run.step.id} · {run.step.name}</small></span>
          <Status run={run} now={now} />
          <time dateTime={run.lastReportedAt} title={formatAbsoluteTime(run.lastReportedAt)}>{formatRelativeTime(run.lastReportedAt, now)}</time>
          <ChevronRight className="row-chevron" size={17} />
        </button></li>;
      })}</ul>
    </div> : <div className="empty-state">
      {hasReports ? <SlidersHorizontal size={30} strokeWidth={1.4} /> : <Inbox size={34} strokeWidth={1.3} />}
      <h3>{hasReports ? '没有匹配的 Agent' : emptyTitle ?? '等待第一条上报'}</h3>
      <p>{hasReports ? '试试其他角色、状态或关键词。' : emptyDescription ?? '接入后，这里会显示任务、阶段和关键行动。'}</p>
      {hasReports ? <button className="button" onClick={onClear}>清除筛选</button> : onConnect ? <button className="button primary" onClick={onConnect}>{connectLabel ?? '连接设置'}</button> : <div className="empty-actions"><button className="button primary" onClick={onDemo}>查看演示<ArrowUpRight size={15} /></button><button className="button" onClick={onImport}>导入本地上报</button></div>}
    </div>}
    <p className="list-note">状态来自主动上报；超过 20 分钟未更新时，活动状态标为“待确认”。</p>
  </section>;
}
