import { LayoutGrid, Settings } from 'lucide-react';
import { PROJECTS, type ProjectId } from '../domain/board';

export function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>AgentBoard</span></div>;
}

export function Sidebar({ projectId, onProject, onSettings }: {
  projectId: ProjectId | 'all'; onProject: (id: ProjectId | 'all') => void; onSettings: () => void;
}) {
  return <aside className="sidebar">
    <Brand />
    <nav aria-label="项目导航">
      <button className={`nav-item ${projectId === 'all' ? 'active' : ''}`} aria-current={projectId === 'all' ? 'page' : undefined}
        onClick={() => onProject('all')}><LayoutGrid size={16} fill="currentColor" strokeWidth={0} />项目总览</button>
      <p className="nav-caption">游戏项目</p>
      {PROJECTS.map((project) => <button key={project.id} className={`nav-item ${projectId === project.id ? 'active' : ''}`}
        aria-current={projectId === project.id ? 'page' : undefined} onClick={() => onProject(project.id)}>
        <span className="project-dot" style={{ background: project.color }} aria-hidden="true" />{project.name}
      </button>)}
    </nav>
    <div className="sidebar-bottom"><button className="nav-item" onClick={onSettings}><Settings size={20} />设置</button>
      <p>主动上报 · 阶段清晰</p></div>
  </aside>;
}
