import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FolderInput, LockKeyhole, LogOut, RefreshCw, Settings, Upload, X } from 'lucide-react';
import { Sidebar, Brand } from './components/Sidebar';
import { ProjectStrip } from './components/ProjectStrip';
import { AgentList } from './components/AgentList';
import { EventTimeline } from './components/EventTimeline';
import { RunDetails, EventDetails } from './components/Details';
import { Dialog } from './components/Dialog';
import { PROJECTS, filterRuns, sortEvents, formatAbsoluteTime, type AgentRole, type AgentRun, type BoardEvent, type BoardSnapshot, type DisplayStatus, type ProjectId } from './domain/board';
import { CLOUD_CONFIG } from './data/cloud-config';
import { useCloudBoard } from './data/use-cloud-board';

type Source = 'cloud' | 'disconnected' | 'demo' | 'imported';
const emptySnapshot: BoardSnapshot = { projects: PROJECTS.map((p) => ({ ...p })), runs: [], events: [] };

export default function App() {
  const [source, setSource] = useState<Source>(CLOUD_CONFIG ? 'cloud' : 'disconnected');
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
  const [accessCode, setAccessCode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cloud = useCloudBoard(source === 'cloud');

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

  const snapshot = source === 'cloud' ? cloud.snapshot ?? emptySnapshot : source === 'demo' ? demoSnapshot ?? emptySnapshot : source === 'imported' ? importedSnapshot ?? emptySnapshot : emptySnapshot;
  const runs = filterRuns(snapshot.runs, { projectId, role, status, query }, now);
  const events = sortEvents(snapshot.events).filter((item) => projectId === 'all' || item.projectId === projectId);
  const selectedProject = PROJECTS.find((p) => p.id === projectId);
  function resetFilters() { setProjectId('all'); setRole('all'); setStatus('all'); setQuery(''); }
  function changeSource(next: Source) { setSource(next); setRun(null); setEvent(null); setAuthError(''); resetFilters(); }
  async function login(e: FormEvent) {
    e.preventDefault();
    const code = accessCode;
    setAccessCode(''); setAuthBusy(true); setAuthError('');
    changeSource('cloud');
    try { await cloud.login(code); }
    catch (err) { setAuthError(err instanceof Error ? err.message : '暂时无法登录。'); }
    finally { setAuthBusy(false); }
  }
  async function logout() {
    setAuthBusy(true); setAuthError(''); setRun(null); setEvent(null);
    try { await cloud.logout(); }
    catch (err) { setAuthError(err instanceof Error ? err.message : '退出失败，请重试。'); }
    finally { setAuthBusy(false); }
  }
  const cloudLabel = cloud.phase === 'live' ? '实时连接' : cloud.phase === 'signed-out' ? '请先登录' : cloud.phase === 'connecting' ? '正在连接' : cloud.phase === 'reconnecting' ? '正在重连' : cloud.phase === 'offline' ? '网络已断开' : '同步异常';
  const cloudEmptyTitle = cloud.snapshot ? '等待第一条上报' : cloud.phase === 'signed-out' ? '登录后查看实时状态' : cloud.phase === 'connecting' ? '正在获取云端状态…' : '尚未取得云端数据';
  const cloudEmptyDescription = cloud.snapshot ? '尚未收到 Agent 上报。新上报会自动出现在这里。' : cloud.phase === 'signed-out' ? '使用本机保存的访问码登录，查看三个项目的上报。' : '连接成功后，这里会显示真实任务、阶段与关键行动。';
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
        <div className="topbar-actions"><label className={`source-select source-${source} ${source === 'cloud' && cloud.phase === 'live' ? 'source-live' : ''}`}><span aria-hidden="true" className="source-dot" /><span className="sr-only">数据来源</span>
          <select aria-label="数据来源" value={source} onChange={(e) => changeSource(e.target.value as Source)}>
            {cloud.configured ? <option value="cloud">云端 · {cloudLabel}</option> : null}<option value="disconnected">离线查看</option><option value="demo">演示模式</option>{importedSnapshot ? <option value="imported">本地导入</option> : null}
          </select></label><button className="button settings-button" aria-label="连接设置" onClick={() => setSettings(true)}><Settings size={18} /><span>连接设置</span></button></div>
      </header>
      <main className="main-content">
        <div className="page-heading"><div><h1>{selectedProject ? selectedProject.name : '三个项目，一个工作台。'}</h1><p>{selectedProject ? selectedProject.gameName : '阶段、任务与关键行动，一目了然。'}</p></div>
          <span className="source-note">{source === 'cloud' ? `${cloudLabel}${cloud.lastSyncedAt ? ` · 上次同步 ${formatAbsoluteTime(cloud.lastSyncedAt)}` : ''}` : source === 'demo' ? '以下均为演示数据' : source === 'imported' ? '本地导入 · 非实时同步' : '等待连接数据源'}</span>
        </div>
        {source === 'cloud' && cloud.phase !== 'live' ? <div className={`cloud-banner ${cloud.error ? 'cloud-warning' : ''}`} role="status"><span>{cloud.error || (cloud.phase === 'signed-out' ? '请先登录。项目上报仅向持有访问码的你开放。' : '正在连接云端，取得真实状态后自动更新。')}{cloud.snapshot && cloud.lastSyncedAt ? ` 上次同步：${formatAbsoluteTime(cloud.lastSyncedAt)}。` : ''}</span>{cloud.phase === 'signed-out' ? <button className="text-button" onClick={() => setSettings(true)}>登录查看</button> : cloud.phase !== 'connecting' ? <button className="text-button" onClick={() => void cloud.retry()}>立即重试</button> : null}</div> : null}
        {error ? <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={17} /></button></div> : null}
        <div className="mobile-project-filter"><label className="sr-only" htmlFor="mobile-project">选择项目</label><select id="mobile-project" value={projectId} onChange={(e) => setProjectId(e.target.value as ProjectId | 'all')}><option value="all">全部项目</option>{PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <ProjectStrip projects={snapshot.projects.filter((p) => projectId === 'all' || p.id === projectId)} runs={snapshot.runs} selected={projectId} now={now} onSelect={setProjectId} />
        <div className="activity-layout">
          <AgentList runs={runs} total={snapshot.runs.length} role={role} status={status} query={query} now={now} demo={source === 'demo'} hasReports={snapshot.runs.length > 0}
            emptyTitle={source === 'cloud' ? cloudEmptyTitle : undefined} emptyDescription={source === 'cloud' ? cloudEmptyDescription : undefined}
            onConnect={source === 'cloud' ? () => setSettings(true) : undefined} connectLabel={cloud.phase === 'signed-out' ? '登录查看' : '连接设置'}
            onRole={setRole} onStatus={setStatus} onQuery={setQuery} onClear={resetFilters} onRun={setRun} onDemo={() => changeSource('demo')} onImport={() => fileInput.current?.click()} />
          <EventTimeline events={events} now={now} demo={source === 'demo'} onEvent={viewEvent} />
        </div>
      </main>
    </div>
    <input ref={fileInput} type="file" accept=".json,application/json" multiple className="sr-only" aria-label="导入上报 JSON 文件" onChange={importFiles} disabled={busy} />
    {settings ? <Dialog title="连接设置" onClose={() => setSettings(false)}>
      <p className="settings-intro">当前来源：<strong>{source === 'cloud' ? `Supabase 云端 · ${cloudLabel}` : source === 'demo' ? '演示数据' : source === 'imported' ? '本地上报文件' : '离线查看'}</strong></p>
      {cloud.configured ? <div className="cloud-login"><div className="cloud-login-heading"><LockKeyhole size={20} /><div><h3>你的项目工作台</h3><p>登录后接收 Agent 的最新阶段与关键行动。</p></div></div>
        {cloud.userId ? <><p className="cloud-account">已登录{cloud.lastSyncedAt ? ` · 上次同步 ${formatAbsoluteTime(cloud.lastSyncedAt)}` : ''}</p><div className="cloud-actions"><button className="button primary" onClick={() => { changeSource('cloud'); setSettings(false); }}>查看云端</button><button className="button" onClick={() => void logout()} disabled={authBusy}><LogOut size={15} />退出登录</button><button className="icon-button" aria-label="重新同步" onClick={() => void cloud.retry()}><RefreshCw size={16} /></button></div></> : <form onSubmit={login}><label htmlFor="access-code">访问码</label><input id="access-code" name="access-code" type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="输入本机保存的访问码" required maxLength={512} disabled={authBusy} /><button className="button primary" type="submit" disabled={authBusy || !accessCode.trim()}>{authBusy ? '正在登录…' : '登录云端'}</button></form>}
        {authError ? <p className="warning" role="alert">{authError}</p> : null}
        <p className="cloud-login-note">访问码只用于本次登录；退出登录会清除这台浏览器的登录状态。</p>
      </div> : <p className="offline-explanation">此版本未配置云端连接，可以查看演示或导入本地上报。</p>}
      <div className="import-box"><FolderInput size={21} /><div><h3>查看本地上报</h3><p>选择本机上报的 JSON 文件。文件只在浏览器内读取，刷新后清除。</p><button className="button" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={15} />{busy ? '正在读取…' : '选择上报文件'}</button></div></div>
      {error ? <p className="warning" role="alert">{error}</p> : null}
      <p className="dialog-footnote">演示、本地导入与云端数据分别显示，不会混合。Agent 只在重要行动时上报；网页不会推断未上报的进度。</p>
    </Dialog> : null}
    {run ? <RunDetails run={run} events={sortEvents(snapshot.events.filter((item) => item.runId === run.id))} now={now} demo={source === 'demo'} onClose={() => setRun(null)} /> : null}
    {event ? <EventDetails event={event} demo={source === 'demo'} onClose={() => setEvent(null)} /> : null}
  </div>;
}
