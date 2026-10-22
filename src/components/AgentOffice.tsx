import {
  PROJECTS, STATUS_LABELS, formatRelativeTime, statusForRun,
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

/** Furniture and people stay separate: an empty project never gains a pretend agent. */
function DeskScene({ occupied = false, working = false }: { occupied?: boolean; working?: boolean }) {
  return <svg className="office-desk-scene" viewBox="0 0 240 160" fill="none" aria-hidden="true">
    <ellipse cx="122" cy="148" rx="96" ry="7" fill="#E6EAF0" opacity=".65" />
    <path d="M31 91V141M208 91V141" stroke="#B2BDC8" strokeWidth="5" strokeLinecap="round" />
    <rect x="171" y="94" width="31" height="44" rx="3" fill="#F5F7F9" stroke="#D4DCE4" />
    <path d="M173 108H200M173 121H200M183 102H190M183 115H190M183 129H190" stroke="#C3CDD7" strokeWidth="1.4" strokeLinecap="round" />
    <rect x="63" y="18" width="111" height="67" rx="4" fill="#475365" />
    <rect className={occupied ? 'office-monitor-lit' : ''} x="67" y="22" width="103" height="59" rx="2" fill={occupied ? '#E6F0F4' : '#CBD3DC'} />
    {occupied && <g className={working ? 'office-screen-content office-screen-working' : 'office-screen-content'}>
      <rect x="71" y="27" width="19" height="49" rx="1" fill="#D4E1E8" />
      <path d="M75 32H84M75 38H82M75 44H85M75 50H81M75 56H84" stroke="#9BACBB" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M97 32H143M97 39H157M105 46H151M105 53H144M97 60H156M97 67H128" stroke="#92ABBD" strokeWidth="2" strokeLinecap="round" />
      <path d="M97 32H116M105 46H131M97 60H118" className="office-code-accent" strokeWidth="2" strokeLinecap="round" />
      <circle cx="161" cy="29" r="2" className="office-code-dot" />
    </g>}
    <path d="M114 85V91M104 91H133" stroke="#8795A5" strokeWidth="3" strokeLinecap="round" />
    <rect x="20" y="90" width="201" height="6" rx="2" fill="#C3CFD9" />
    <path d="M20 90L33 82H211L221 90H20Z" fill="#F5F8FB" stroke="#CFD8E2" />
    <rect x="78" y="85" width="69" height="5" rx="2" fill="#ADBCC9" />
    <ellipse cx="159" cy="87" rx="5" ry="2.5" fill="#9CAEBE" />
    <rect x="190" y="72" width="9" height="13" rx="2" fill="#8D9FAF" />
    <path d="M190 75H188V80H191" stroke="#8D9FAF" strokeWidth="2" />
    {occupied ? <g className={working ? 'office-person office-person-working' : 'office-person'}>
      <path d="M108 119L105 139M130 119L134 139" stroke="#3F4D60" strokeWidth="11" strokeLinecap="round" />
      <path d="M99 140H111M130 140H142" stroke="#293746" strokeWidth="6" strokeLinecap="round" />
      <path d="M99 82C99 76 105 74 118 74C132 74 138 77 140 84L143 117C129 123 108 123 96 117L99 82Z" className="office-shirt" />
      <g className="office-arm office-arm-left">
        <path d="M102 83L92 93L101 96" className="office-shirt-stroke" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M100 96L111 91" stroke="#E7BDA6" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g className="office-arm office-arm-right">
        <path d="M136 82L146 92L138 95" className="office-shirt-stroke" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M139 95L127 91" stroke="#E7BDA6" strokeWidth="6" strokeLinecap="round" />
      </g>
      <path d="M115 68V77H125V67" fill="#DFAE93" />
      <ellipse cx="119" cy="58" rx="15" ry="18" fill="#E7BDA6" />
      <path d="M103 58C100 44 107 38 119 38C133 38 139 46 134 61L131 64L129 57C119 60 114 55 108 56L107 66L103 62V58Z" fill="#293746" />
      <path d="M109 43C114 39 126 40 131 46" stroke="#3C4C5F" strokeWidth="2" strokeLinecap="round" />
      <rect x="98" y="107" width="43" height="26" rx="8" fill="#526477" />
      <rect x="103" y="111" width="33" height="16" rx="5" fill="#60758A" />
      <path d="M119 132V144M104 146L119 141L135 146" stroke="#677B90" strokeWidth="3" strokeLinecap="round" />
      <circle cx="103" cy="147" r="2.5" fill="#46596D" />
      <circle cx="135" cy="147" r="2.5" fill="#46596D" />
    </g> : <g>
      <rect x="99" y="102" width="43" height="29" rx="8" fill="#BAC6D2" />
      <rect x="104" y="107" width="33" height="18" rx="5" fill="#CCD6DF" />
      <path d="M120 130V144M105 146L120 141L136 146" stroke="#A4B3C2" strokeWidth="3" strokeLinecap="round" />
      <circle cx="104" cy="147" r="2.5" fill="#98A9BA" />
      <circle cx="136" cy="147" r="2.5" fill="#98A9BA" />
    </g>}
  </svg>;
}

function OfficePlant() {
  return <svg className="office-plant" viewBox="0 0 54 106" fill="none" aria-hidden="true">
    <ellipse cx="27" cy="101" rx="24" ry="4" fill="#DCE4E8" />
    <path d="M27 76V22M27 58L13 44M27 45L41 28M27 68L41 56" stroke="#82A991" strokeWidth="2" />
    <path d="M26 42C10 37 8 25 9 19C23 21 29 32 26 42Z" fill="#B4D2BB" />
    <path d="M28 31C27 14 35 5 40 2C47 16 41 27 28 31Z" fill="#8FB89C" />
    <path d="M29 57C33 41 44 36 51 37C49 50 42 56 29 57Z" fill="#9FC6AC" />
    <path d="M25 67C10 64 2 54 3 47C16 47 25 55 25 67Z" fill="#8FB89C" />
    <path d="M11 75H43L39 98H15L11 75Z" fill="#F1F4F7" stroke="#CAD5DD" />
    <path d="M14 76H40" stroke="#CAD5DD" strokeWidth="3" strokeLinecap="round" />
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
  const working = status === 'running';
  return <li className="office-workstation-item">
    <button
      type="button"
      className={`office-workstation office-status-${status}`}
      data-role={run.role}
      onClick={() => onRun(run)}
      aria-label={`查看 ${identity.label} 的任务：${run.task}`}
      title={`${identity.idLabel}：${identity.fullId}\n${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}`}
    >
      <span className="office-station-state"><i aria-hidden="true">{status === 'blocked' ? 'Ⅱ' : ''}</i>{working ? '工作中' : STATUS_LABELS[status]}</span>
      <DeskScene occupied working={working} />
      <span className="office-station-caption">
        <span className="office-agent-name">{identity.roleLabel}<code>#{identity.shortId}</code></span>
        <span className="office-agent-task">{run.task}</span>
        <span className="office-agent-stage">{run.stage.id} · {run.stage.name}<span> / {run.step.id} · {run.step.name}</span></span>
        <span className="office-last-report">{formatRelativeTime(run.lastReportedAt, now)}上报<span aria-hidden="true">↗</span></span>
      </span>
    </button>
  </li>;
}

export function AgentOffice({ runs, identityRuns, now, demo, projectId = 'all', onRun }: AgentOfficeProps) {
  const projects = PROJECTS.filter((project) => projectId === 'all' || project.id === projectId);
  return <section className="office-panel" aria-label="Agent 办公室">
    <div className="office-heading">
      <div><h2>Agent 办公室</h2><p>点击小人，查看任务与阶段。</p></div>
      <span className="office-headcount"><i aria-hidden="true" />{runs.length} 位活跃{demo ? ' · 演示' : ''}</span>
    </div>
    <div className={`office-floor${projects.length === 1 ? ' office-floor-single' : ''}`}>
      {projects.map((project) => {
        const occupants = runs.filter((run) => run.projectId === project.id);
        return <section className="office-room" key={project.id} aria-label={`${project.name} 办公区`}>
          <header className="office-room-heading"><h3>{project.name}</h3><span>{occupants.length} 人</span></header>
          <div className="office-window" aria-hidden="true"><span /><span /><span /></div>
          {occupants.length > 0 ? <ul className="office-workstations">
            {occupants.map((run) => <Workstation key={run.id} run={run} identityRuns={identityRuns} now={now} onRun={onRun} />)}
          </ul> : <div className="office-empty-room">
            <DeskScene />
            <p>暂无活跃上报</p>
          </div>}
        </section>;
      })}
      <OfficePlant />
    </div>
    <p className="office-footnote">只显示近期活跃上报；20 分钟未更新转为待确认。</p>
  </section>;
}

export type { AgentOfficeProps };
