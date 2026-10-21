import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, CircleDashed, FolderInput, Settings, Upload, X } from 'lucide-react';
import { Sidebar, Brand } from './components/Sidebar';
import { ProjectStrip } from './components/ProjectStrip';
import { AgentList } from './components/AgentList';
import { EventTimeline } from './components/EventTimeline';
import { RunDetails, EventDetails } from './components/Details';
import { Dialog } from './components/Dialog';
import { PROJECTS, filterRuns, sortEvents, type AgentRole, type AgentRun, type BoardEvent, type BoardSnapshot, type DisplayStatus, type ProjectId } from './domain/board';

type Source = 'disconnected' | 'demo' | 'imported';
const emptySnapshot: BoardSnapshot = { projects: PROJECTS.map((p) => ({ ...p })), runs: [], events: [] };

export default function App() {
  const [source, setSource] = useState<Source>('disconnected');
  const [demoSnapshot, setDemoSnapshot] = useState<BoardSnapshot | null>(null);
  const [importedSnapshot, setImportedSnapshot] = useState<BoardSnapshot | null>(null);
  const [projectId, setProjectId] = useState<ProjectId | 'all'>('all');
  const [role, setRole] = useState<AgentRole | 'all'>('all');
  const [status, setStatus] = useState<DisplayStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now);
  const [settings, setSettings] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [event, setEvent] = useState<BoardEvent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (source !== 'demo' || demoSnapshot) return;
    let cancelled = false;
    import('./data/demo').then(({ createDemoSnapshot }) => {
      if (!cancelled) setDemoSnapshot(createDemoSnapshot(Date.now()));
    }).catch(() => { if (!cancelled) { setError('演示数据加载失败，请刷新重试。'); setSource('disconnected'); } });
    return () => { cancelled = true; };
  }, [source, demoSnapshot]);

  const snapshot = source === 'demo' ? demoSnapshot ?? emptySnapshot : source === 'imported' ? importedSnapshot ?? emptySnapshot : emptySnapshot;
  const runs = filterRuns(snapshot.runs, { projectId, role, status, query }, now);
  const events = sortEvents(snapshot.events).filter((item) => projectId === 'all' || item.projectId === projectId);
  const selectedProject = PROJECTS.find((p) => p.id === projectId);
  function resetFilters() { setProjectId('all'); setRole('all'); setStatus('all'); setQuery(''); }
  function changeSource(next: Source) { setSource(next); setRun(null); setEvent(null); resetFilters(); }
  function viewEvent(item: BoardEvent) {
    setEvent(item);
  }
  async function importFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    if (files.length > 500 || files.some((file) => file.size > 256 * 1024) || files.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) {
      setError('最多导入 500 个 JSON 文件，单个不超过 256KB，合计不超过 10MB。'); return;
    }
    setBusy(true); setError('');
    try {
      const [{ importReportFiles }, texts] = await Promise.all([
        import('./data/report-import'), Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))),
      ]);
      const next = importReportFiles(texts);
      setImportedSnapshot(next); changeSource('imported'); setNow(Date.now()); setSettings(false);
    } catch (err) { setError(err instanceof Error ? err.message : '无法读取上报文件。'); }
    finally { setBusy(false); }
  }
  return <div className="app-shell">
    <Sidebar projectId={projectId} onProject={setProjectId} onSettings={() => setSettings(true)} />
    <div className="workspace">
      <header className="topbar"><div className="desktop-page-name">{selectedProject?.name ?? '项目总览'}</div><div className="mobile-brand"><Brand /></div>
        <div className="topbar-actions"><label className={`source-select source-${source}`}><span aria-hidden="true" className="source-dot" /><span className="sr-only">数据来源</span>
          <select aria-label="数据来源" value={source} onChange={(e) => changeSource(e.target.value as Source)}>
            <option value="disconnected">未接入</option><option value="demo">演示模式</option>{importedSnapshot ? <option value="imported">本地导入</option> : null}
          </select></label><button className="button settings-button" aria-label="连接设置" onClick={() => setSettings(true)}><Settings size={18} /><span>连接设置</span></button></div>
      </header>
      <main className="main-content">
        <div className="page-heading"><div><h1>{selectedProject ? selectedProject.name : '三个项目，一个工作台。'}</h1><p>{selectedProject ? selectedProject.gameName : '阶段、任务与关键行动，一目了然。'}</p></div>
          <span className="source-note">{source === 'demo' ? '以下均为演示数据' : source === 'imported' ? '本地导入 · 非实时同步' : '等待连接数据源'}</span>
        </div>
        {error ? <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={17} /></button></div> : null}
        <div className="mobile-project-filter"><label className="sr-only" htmlFor="mobile-project">选择项目</label><select id="mobile-project" value={projectId} onChange={(e) => setProjectId(e.target.value as ProjectId | 'all')}><option value="all">全部项目</option>{PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <ProjectStrip projects={snapshot.projects.filter((p) => projectId === 'all' || p.id === projectId)} runs={snapshot.runs} selected={projectId} now={now} onSelect={setProjectId} />
        <div className="activity-layout">
          <AgentList runs={runs} total={snapshot.runs.length} role={role} status={status} query={query} now={now} demo={source === 'demo'} hasReports={snapshot.runs.length > 0}
            onRole={setRole} onStatus={setStatus} onQuery={setQuery} onClear={resetFilters} onRun={setRun} onDemo={() => changeSource('demo')} onImport={() => fileInput.current?.click()} />
          <EventTimeline events={events} now={now} demo={source === 'demo'} onEvent={viewEvent} />
        </div>
      </main>
    </div>
    <input ref={fileInput} type="file" accept=".json,application/json" multiple className="sr-only" aria-label="导入上报 JSON 文件" onChange={importFiles} disabled={busy} />
    {settings ? <Dialog title="连接设置" onClose={() => setSettings(false)}>
      <p className="settings-intro">当前来源：<strong>{source === 'demo' ? '演示数据' : source === 'imported' ? '本地上报文件' : '尚未接入'}</strong></p>
      <div className="connection-steps"><div><Check size={17} /><span><strong>Agent 主动上报</strong><small>各角色共用轻量入口，事件先写入本地。</small></span></div><div><Check size={17} /><span><strong>统一监控网页</strong><small>阶段、任务和关键事件已可查看。</small></span></div><div className="pending-step"><CircleDashed size={17} /><span><strong>Supabase 云端同步</strong><small>待接入。当前没有上传数据，也没有实时订阅。</small></span></div></div>
      <div className="import-box"><FolderInput size={21} /><div><h3>先查看本地上报</h3><p>选择 <code>.local/outbox/</code> 内的 JSON 文件。文件只在浏览器内读取，刷新后清除。</p><button className="button" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={15} />{busy ? '正在读取…' : '选择上报文件'}</button></div></div>
      {error ? <p className="warning" role="alert">{error}</p> : null}
      <p className="dialog-footnote">GitHub Pages 发布流程已准备；按你的要求，当前只在本地运行。接云端时网页只使用公开配置，写入密钥留在本机或服务端。</p>
    </Dialog> : null}
    {run ? <RunDetails run={run} events={sortEvents(snapshot.events.filter((item) => item.runId === run.id))} now={now} demo={source === 'demo'} onClose={() => setRun(null)} /> : null}
    {event ? <EventDetails event={event} demo={source === 'demo'} onClose={() => setEvent(null)} /> : null}
  </div>;
}
