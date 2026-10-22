import { ArrowUpRight, Circle, UsersRound } from 'lucide-react';
import {
  PROJECTS, STATUS_LABELS, formatAbsoluteTime, formatRelativeTime, statusForRun,
  type AgentRun, type ProjectId,
} from '../domain/board';
import { getAgentIdentity } from '../domain/presentation';
import './agent-office.css';

interface AgentOfficeProps {
  runs: AgentRun[];
  identityRuns: AgentRun[];
  now: number;
  demo: boolean;
  projectId?: ProjectId | 'all';
  onRun: (run: AgentRun) => void;
}

/** Appearance follows the stable instance, never list position or status. */
function workerVariant(run: AgentRun): number {
  const value = run.instanceId || run.id;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return (hash >>> 0) % 4;
}

/** Empty furniture is decorative; people are rendered only for actual reported runs. */
function EmptyDesk() {
  return <svg className="office-empty-desk" viewBox="0 0 240 180" fill="none" aria-hidden="true">
    <ellipse cx="123" cy="159" rx="95" ry="13" fill="#684E38" opacity=".12" />
    <path d="M35 99V145M202 96V145" stroke="#5D665B" strokeWidth="7" strokeLinecap="round" />
    <path d="M22 91L73 73L222 85L187 110L22 98V91Z" fill="#DCA96C" />
    <path d="M22 91L73 73L222 85L187 104L22 91Z" fill="#EFCAA0" />
    <path d="M22 98L187 110L222 91V85L187 104L22 91V98Z" fill="#BD8857" />
    <path d="M91 37L155 42V80L91 75V37Z" fill="#3C514A" />
    <path d="M96 42L151 47V74L96 70V42Z" fill="#B5CCC5" />
    <path d="M122 78V87M109 88L136 90" stroke="#64746B" strokeWidth="4" strokeLinecap="round" />
    <path d="M95 89L136 92L145 97L102 94L95 89Z" fill="#E8E9D8" />
    <path d="M52 84C50 76 51 67 56 61C62 68 63 76 59 84" fill="#709B6A" />
    <path d="M49 82L62 83L60 95L51 94L49 82Z" fill="#C37859" />
    <path d="M157 91V81L168 82V92" fill="#F8F1DA" />
    <path d="M168 84C175 84 174 90 168 89" stroke="#F8F1DA" strokeWidth="3" />
    <path d="M94 123L93 145M128 128L132 151" stroke="#5C665E" strokeWidth="5" strokeLinecap="round" />
    <path d="M90 110C88 102 93 99 106 100L128 104C134 105 138 110 137 118L135 137L89 129L90 110Z" fill="#65816F" />
    <path d="M93 123L135 130L135 137L89 130L93 123Z" fill="#496454" />
    <path d="M110 136V155M96 159L110 153L127 161" stroke="#56675D" strokeWidth="4" strokeLinecap="round" />
    <circle cx="95" cy="160" r="3" fill="#405248" /><circle cx="128" cy="162" r="3" fill="#405248" />
  </svg>;
}

function Workstation({ run, identityRuns, now, onRun }: {
  run: AgentRun;
  identityRuns: AgentRun[];
  now: number;
  onRun: (run: AgentRun) => void;
}) {
  const identity = getAgentIdentity(run, identityRuns);
  const status = statusForRun(run, now);
  return <li className="office-workstation-item">
    <button
      type="button"
      className={`office-workstation office-status-${status}`}
      data-role={run.role}
      data-run-id={run.id}
      onClick={() => onRun(run)}
      aria-label={`查看 ${identity.label} 的任务：${run.task}`}
      title={`${identity.idLabel}：${identity.fullId}\n${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}`}
    >
      <span className="office-worker-sprite" data-variant={workerVariant(run)} aria-hidden="true" />
      <span className="office-station-caption">
        <span className="office-agent-name">{identity.roleLabel}<ArrowUpRight size={12} aria-hidden="true" /></span>
        <code className="office-agent-id">#{identity.shortId}</code>
        <span className="office-agent-task">{run.task}</span>
        <span className="office-agent-stage" title={`${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}`}>
          <span className="office-stage-compact">{run.stage.id} / {run.step.id}</span>
          <span className="office-stage-full"><span>{run.stage.id} · {run.stage.name}</span><span>{run.step.id} · {run.step.name}</span></span>
        </span>
        <span className="office-station-meta"><span className="office-station-state"><i aria-hidden="true" />{STATUS_LABELS[status]}</span>
          <time dateTime={run.lastReportedAt} title={formatAbsoluteTime(run.lastReportedAt)}>{formatRelativeTime(run.lastReportedAt, now)}上报</time>
        </span>
      </span>
    </button>
  </li>;
}

export function AgentOffice({ runs, identityRuns, now, demo, projectId = 'all', onRun }: AgentOfficeProps) {
  const projects = PROJECTS.filter((project) => projectId === 'all' || project.id === projectId);
  return <section className="office-panel" aria-label="Agent 办公室">
    <div className="office-heading">
      <div className="office-title"><h2>Agent 办公室</h2>{demo ? <span className="office-demo-label">演示</span> : null}</div>
      <span className="office-headcount"><UsersRound size={15} aria-hidden="true" />{runs.length} 位活跃</span>
    </div>
    <div className={`office-floor${projects.length === 1 ? ' office-floor-single' : ''}`}>
      {projects.map((project) => {
        const occupants = runs.filter((run) => run.projectId === project.id);
        return <section className="office-room" key={project.id} aria-label={`${project.name} 办公区`}>
          <header className="office-room-heading"><span className="office-project-mark" style={{ background: project.color }} aria-hidden="true" /><h3>{project.name}</h3><span>{occupants.length} 人</span></header>
          {occupants.length > 0 ? <ul className="office-workstations">
            {occupants.map((run) => <Workstation key={run.id} run={run} identityRuns={identityRuns} now={now} onRun={onRun} />)}
          </ul> : <div className="office-empty-room"><EmptyDesk /><p>暂无活跃上报</p></div>}
        </section>;
      })}
    </div>
    <p className="office-footnote"><Circle size={6} fill="currentColor" aria-hidden="true" />点击工位，查看任务与阶段。<span>只显示近期活跃上报；20 分钟未更新转为待确认。</span></p>
  </section>;
}

export type { AgentOfficeProps };
