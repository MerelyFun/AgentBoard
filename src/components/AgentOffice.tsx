import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { UsersRound } from 'lucide-react';
import {
  STATUS_LABELS, formatAbsoluteTime, statusForRun,
  type AgentRun, type Project, type ProjectId,
} from '../domain/board';
import { getAgentIdentity } from '../domain/presentation';
import { Pagination, usePagination } from './Pagination';
import './agent-office.css';

interface AgentOfficeProps {
  projects: readonly Project[];
  runs: AgentRun[];
  identityRuns: AgentRun[];
  now: number;
  demo: boolean;
  projectId?: ProjectId | 'all';
  viewKey?: string;
  onRun: (run: AgentRun) => void;
}

function projectName(project: Project) {
  return project.name?.trim() || project.gameName?.trim() || project.id;
}

/** Seat direction follows the shared desk; appearance follows the real instance. */
function workerVariant(run: AgentRun, seat: number): number {
  const value = run.instanceId || run.id;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  const appearance = (hash >>> 0) % 2;
  return seat < 2 ? (appearance === 0 ? 3 : 2) : appearance;
}

function Workstation({ run, seat, identityRuns, now, onRun }: {
  run: AgentRun;
  seat: number;
  identityRuns: AgentRun[];
  now: number;
  onRun: (run: AgentRun) => void;
}) {
  const identity = getAgentIdentity(run, identityRuns);
  const status = statusForRun(run, now);
  const description = `${identity.roleLabel}，${identity.idLabel}：${identity.fullId}，${STATUS_LABELS[status]}。任务：${run.task}。阶段：${run.stage.id} ${run.stage.name}；步骤：${run.step.id} ${run.step.name}。上报时间：${formatAbsoluteTime(run.lastReportedAt)}`;
  return <li className={`office-seat office-seat-${seat}`}>
    <button
      type="button"
      className={`office-workstation office-status-${status}`}
      data-role={run.role}
      data-run-id={run.id}
      onClick={() => onRun(run)}
      aria-label={`查看 ${description}`}
      title={`${identity.roleLabel} · #${identity.shortId}\n${identity.idLabel}：${identity.fullId}\n${run.task}\n${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}\n${STATUS_LABELS[status]} · ${formatAbsoluteTime(run.lastReportedAt)}`}
    >
      <span className="office-worker-sprite" data-variant={workerVariant(run, seat)} aria-hidden="true" />
      <span className="office-station-badge">
        <i className="office-state-dot" aria-hidden="true" />
        <span>{identity.roleLabel}</span>
        <span className="office-state-label">{STATUS_LABELS[status]}</span>
      </span>
      <span className="office-instance-hint" aria-hidden="true">#{identity.shortId}</span>
    </button>
  </li>;
}

function DeskIsland({ project, occupants, index, identityRuns, now, onRun }: {
  project: Project;
  occupants: AgentRun[];
  index: number;
  identityRuns: AgentRun[];
  now: number;
  onRun: (run: AgentRun) => void;
}) {
  return <section
    className={`office-island${occupants.length === 0 ? ' office-island-empty' : ''}`}
    data-project={project.id}
    aria-label={`${projectName(project)} 第 ${index + 1} 桌共享工位`}
  >
    <div className="office-island-scene">
      <h3 className="office-desk-number">共享桌 {String(index + 1).padStart(2, '0')}</h3>
      <div className="office-shared-desk" aria-hidden="true" />
      <ul className="office-workstations">
        {occupants.map((run, seat) => <Workstation key={run.id} run={run} seat={seat} identityRuns={identityRuns} now={now} onRun={onRun} />)}
      </ul>
    </div>
  </section>;
}

function officePageSize() {
  if (typeof window === 'undefined') return 12;
  if (window.matchMedia('(min-width: 1200px)').matches) return 12;
  return window.matchMedia('(min-width: 768px)').matches ? 8 : 4;
}

function subscribeOfficeSize(onChange: () => void) {
  const queries = ['(min-width: 1200px)', '(min-width: 768px)'].map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

export function AgentOffice({ projects, runs, identityRuns, now, demo, projectId = 'all', viewKey = '', onRun }: AgentOfficeProps) {
  const [chosenProject, setChosenProject] = useState<ProjectId | null>(null);
  useEffect(() => {
    setChosenProject(null);
  }, [projectId]);
  const pageSize = useSyncExternalStore(subscribeOfficeSize, officePageSize, () => 12);
  const projectCounts = useMemo(() => {
    const counts = new Map<ProjectId, number>();
    runs.forEach((run) => counts.set(run.projectId, (counts.get(run.projectId) ?? 0) + 1));
    return counts;
  }, [runs]);
  // An automatic choice follows the first nonempty project. A deliberate empty choice stays visible.
  const currentId = projectId !== 'all' ? projectId
    : projects.find((item) => item.id === chosenProject)?.id
      ?? projects.find((item) => projectCounts.get(item.id))?.id ?? projects[0]?.id;
  const project = projects.find((item) => item.id === currentId);
  const occupants = useMemo(() => runs.filter((run) => run.projectId === currentId)
    // Stable instance ordering prevents report timestamps from continually shuffling seats.
    .sort((left, right) => (left.instanceId || left.id).localeCompare(right.instanceId || right.id)
      || left.id.localeCompare(right.id)), [runs, currentId]);
  const pager = usePagination(occupants.length, pageSize, JSON.stringify([viewKey, projectId, currentId]));
  const visibleRuns = occupants.slice(pager.startIndex, pager.endIndex);
  const islands = Array.from({ length: Math.ceil(visibleRuns.length / 4) }, (_, index) => ({
    occupants: visibleRuns.slice(index * 4, index * 4 + 4), index: Math.floor(pager.startIndex / 4) + index,
  }));
  if (!project) return null;
  return <section className="office-panel" aria-label="Agent 办公室">
    <div className="office-heading">
      <div className="office-heading-copy">
        <div className="office-title"><UsersRound size={20} aria-hidden="true" /><h2>项目办公室 <span title={projectName(project)}>{projectName(project)}</span></h2>{demo ? <span className="office-demo-label">演示数据</span> : null}</div>
        <p>{occupants.length} 个活跃执行 · 已应用全局筛选 · 点击工位查看任务</p>
      </div>
      {projectId === 'all' ? <nav className="office-project-tabs" aria-label="办公室项目视图">
        {projects.map((item) => <button key={item.id} type="button" aria-label={`${projectName(item)} 办公室，${projectCounts.get(item.id) ?? 0} 个活跃执行`} title={projectName(item)} aria-pressed={currentId === item.id} onClick={() => setChosenProject(item.id)}>
          <span className="office-tab-mark" style={{ background: item.color ?? 'var(--accent)' }} aria-hidden="true" /><span className="office-tab-name">{projectName(item)}</span><span className="office-tab-count">{projectCounts.get(item.id) ?? 0}</span>
        </button>)}
      </nav> : null}
    </div>
    <div className={`office-floor${occupants.length ? '' : ' office-floor-empty'}`}>
      <div className="office-islands" data-desk-count={islands.length}>
        {islands.map(({ occupants: deskRuns, index }) => <DeskIsland key={`${project.id}-${index}`} project={project} occupants={deskRuns} index={index} identityRuns={identityRuns} now={now} onRun={onRun} />)}
      </div>
      {occupants.length === 0 ? <div className="office-empty-note"><UsersRound size={24} aria-hidden="true" /><strong>办公室暂时安静</strong><p>当前项目没有符合筛选的活跃执行</p></div> : null}
    </div>
    <div className="office-footer">
      <p className="office-current-project" aria-live="polite" aria-atomic="true">当前项目 <strong>{occupants.length}</strong> 个活跃执行 <span>· 显示 {pager.from}–{pager.to}</span></p>
      <Pagination {...pager} onPageChange={pager.setPage} label="办公室分页" itemLabel="个执行" />
    </div>
  </section>;
}

export type { AgentOfficeProps };
