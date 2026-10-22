import { useState } from 'react';
import { LayoutGrid, Search, Settings } from 'lucide-react';
import type { Project, ProjectId } from '../domain/board';

export function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>AgentBoard</span></div>;
}

export function Sidebar({ projects, projectId, onProject, onSettings }: {
  projects: readonly Project[];
  projectId: ProjectId | 'all'; onProject: (id: ProjectId | 'all') => void; onSettings: () => void;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter((project) => `${project.name} ${project.gameName} ${project.id}`.toLocaleLowerCase().includes(term));
  return <aside className="sidebar">
    <Brand />
    <nav aria-label="项目导航">
      <button className={`nav-item ${projectId === 'all' ? 'active' : ''}`} aria-current={projectId === 'all' ? 'page' : undefined}
        onClick={() => onProject('all')}><LayoutGrid size={16} fill="currentColor" strokeWidth={0} />项目总览</button>
      <p className="nav-caption">项目列表 <span>{projects.length}</span></p>
      {projects.length > 5 || query ? <label className="nav-search"><Search size={14} /><span className="sr-only">查找项目</span><input type="search" placeholder="查找项目…" value={query} onChange={(event) => setQuery(event.target.value)} /></label> : null}
      <div className="nav-projects">{visibleProjects.map((project) => <button key={project.id} className={`nav-item ${projectId === project.id ? 'active' : ''}`}
        aria-current={projectId === project.id ? 'page' : undefined} onClick={() => onProject(project.id)}>
        <span className="project-dot" style={{ background: project.color ?? 'var(--accent)' }} aria-hidden="true" /><span className="nav-project-name" title={project.name}>{project.name}</span>
      </button>)}
      {!visibleProjects.length ? <p className="nav-empty">{projects.length ? '没有匹配的项目' : '连接后显示项目'}</p> : null}</div>
    </nav>
    <div className="sidebar-bottom"><button className="nav-item" onClick={onSettings}><Settings size={20} />设置</button>
      <p>主动上报 · 阶段清晰</p></div>
  </aside>;
}
