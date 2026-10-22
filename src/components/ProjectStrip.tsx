import { Cat, Clock3, FolderKanban, Gem, Sprout, TriangleAlert } from 'lucide-react';
import { countRunActivity } from '../domain/activity';
import { formatRelativeTime, statusForRun, type AgentRun, type Project, type ProjectId } from '../domain/board';

export function ProjectStrip({ projects, runs, selected, now, onSelect }: {
  projects: Project[]; runs: AgentRun[]; selected: ProjectId | 'all'; now: number; onSelect: (id: ProjectId) => void;
}) {
  return <section className="project-strip" aria-label="项目阶段">
    {projects.map((project) => {
      const projectRuns = runs.filter((run) => run.projectId === project.id);
      const blocked = projectRuns.some((run) => statusForRun(run, now) === 'blocked');
      const activity = countRunActivity(projectRuns, now);
      const ProjectIcon = project.id === '3match' ? Gem : project.id === 'cat-and-dog' ? Cat : project.id === 'incremental-xxx' ? Sprout : FolderKanban;
      return <button key={project.id} className={`project-summary ${selected === project.id ? 'selected' : ''}`}
        onClick={() => onSelect(project.id)} aria-pressed={selected === project.id}>
        <div className="project-identity"><span className="project-dot" style={{ background: project.color ?? 'var(--accent)' }} aria-hidden="true"><ProjectIcon size={18} /></span>
          <span><strong>{project.name}</strong><small>{project.gameName}</small></span>
        </div>
        <h2>{project.stage ? <><span>{project.stage.id}</span> {project.stage.name}</> : '尚未上报阶段'}</h2>
        <p className="field-label">当前小阶段</p>
        <p className={`project-step ${!project.step ? 'muted' : ''}`}>{project.step ? `${project.step.id} · ${project.step.name}` : '等待制作人确认'}</p>
        <div className="project-meta"><span title={project.lastReportedAt}><Clock3 size={15} />{project.lastReportedAt ? `最后上报 · ${formatRelativeTime(project.lastReportedAt, now)}` : '尚无制作人上报'}</span>
          {blocked ? <span className="warning"><TriangleAlert size={14} />有阻塞 · {activity.active} 活跃</span> : activity.active ? <span className="accent">{activity.active} 活跃</span> : activity.unconfirmed ? <span className="muted">{activity.unconfirmed} 待确认</span> : projectRuns.length ? <span className="muted">暂无活跃上报</span> : null}
        </div>
      </button>;
    })}
  </section>;
}
