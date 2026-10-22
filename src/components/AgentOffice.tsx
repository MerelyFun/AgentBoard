import { useState } from 'react';
import { Circle, MousePointer2, UsersRound } from 'lucide-react';
import {
  STATUS_LABELS, formatAbsoluteTime, statusForRun,
  type AgentRun, type Project, type ProjectId,
} from '../domain/board';
import { getAgentIdentity } from '../domain/presentation';
import './agent-office.css';

interface AgentOfficeProps {
  projects: readonly Project[];
  runs: AgentRun[];
  identityRuns: AgentRun[];
  now: number;
  demo: boolean;
  projectId?: ProjectId | 'all';
  onRun: (run: AgentRun) => void;
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

function DeskIsland({ project, occupants, index, identityRuns, now, mobileVisible, onRun }: {
  project: Project;
  occupants: AgentRun[];
  index: number;
  identityRuns: AgentRun[];
  now: number;
  mobileVisible: boolean;
  onRun: (run: AgentRun) => void;
}) {
  return <section
    className={`office-island${occupants.length === 0 ? ' office-island-empty' : ''}`}
    data-project={project.id}
    data-mobile-visible={mobileVisible}
    aria-label={`${project.name} 共享工位${index > 0 ? ` ${index + 1}` : ''}`}
  >
    <div className="office-island-scene">
      <h3 className="office-project-plaque" title={project.name}><span className="office-project-mark" style={{ background: project.color ?? 'var(--accent)' }} aria-hidden="true" /><span>{project.name}</span>{index > 0 ? <small>{index + 1}</small> : null}</h3>
      <div className="office-shared-desk" aria-hidden="true" />
      <ul className="office-workstations">
        {occupants.map((run, seat) => <Workstation key={run.id} run={run} seat={seat} identityRuns={identityRuns} now={now} onRun={onRun} />)}
      </ul>
      {occupants.length === 0 ? <p className="office-empty-note">暂无活跃上报</p> : null}
    </div>
  </section>;
}

export function AgentOffice({ projects: allProjects, runs, identityRuns, now, demo, projectId = 'all', onRun }: AgentOfficeProps) {
  const [preferredProject, setPreferredProject] = useState<ProjectId | undefined>();
  const projects = allProjects.filter((project) => projectId === 'all' || project.id === projectId);
  const mobileProject = projects.find((project) => project.id === preferredProject)?.id ?? projects[0]?.id;
  const mobileCount = runs.filter((run) => run.projectId === mobileProject).length;
  const islands = projects.flatMap((project) => {
    // Sorting by the stable instance keeps desks steady when a new report reorders the list.
    const occupants = runs.filter((run) => run.projectId === project.id)
      .sort((left, right) => (left.instanceId || left.id).localeCompare(right.instanceId || right.id));
    return Array.from({ length: Math.max(1, Math.ceil(occupants.length / 4)) }, (_, index) => ({
      project, occupants: occupants.slice(index * 4, index * 4 + 4), index,
    }));
  });
  if (!projects.length) return null;
  return <section className="office-panel" aria-label="Agent 办公室">
    <div className="office-heading">
      <div className="office-title"><h2>团队办公室</h2>{demo ? <span className="office-demo-label">演示</span> : null}</div>
      <span className="office-headcount"><UsersRound size={15} aria-hidden="true" /><span className="office-desktop-count">{runs.length} 位活跃</span><span className="office-mobile-count">{mobileCount} 位活跃</span></span>
    </div>
    {projectId === 'all' ? <nav className="office-project-tabs" aria-label="办公室项目视图">
      {projects.map((project) => <button key={project.id} type="button" aria-label={`${project.name} 办公室`} title={project.name} aria-pressed={mobileProject === project.id} onClick={() => setPreferredProject(project.id)}>
        <span className="office-tab-mark" style={{ background: project.color ?? 'var(--accent)' }} aria-hidden="true" /><span>{project.name}</span>
      </button>)}
    </nav> : null}
    <div className="office-floor">
      <div className={`office-islands${projects.length === 1 ? ' office-islands-single' : ''}`}>
        {islands.map(({ project, occupants, index }) => <DeskIsland key={`${project.id}-${index}`} project={project} occupants={occupants} index={index} identityRuns={identityRuns} now={now} mobileVisible={project.id === mobileProject} onRun={onRun} />)}
      </div>
    </div>
    <div className="office-footnote"><span><MousePointer2 size={14} aria-hidden="true" />点击工位查看任务</span><span className="office-freshness"><Circle size={6} fill="currentColor" aria-hidden="true" />仅显示近期活跃上报</span></div>
  </section>;
}

export type { AgentOfficeProps };
