import { Search, X } from 'lucide-react';
import { ROLE_LABELS, STATUS_LABELS, type AgentRole, type DisplayStatus } from '../domain/board';

export function BoardFilters({ role, status, query, onRole, onStatus, onQuery, onClear }: {
  role: AgentRole | 'all'; status: DisplayStatus | 'all'; query: string;
  onRole: (role: AgentRole | 'all') => void; onStatus: (status: DisplayStatus | 'all') => void;
  onQuery: (query: string) => void; onClear: () => void;
}) {
  const filtered = role !== 'all' || status !== 'all' || !!query.trim();
  return <section className="board-toolbar" aria-label="筛选 Agent 与事件">
    <div className="filters">
      <label className="search-input"><Search size={17} /><span className="sr-only">搜索任务、Agent 或事件</span>
        <input type="search" placeholder="搜索任务、Agent 或事件…" value={query} onChange={(event) => onQuery(event.target.value)} />
      </label>
      <label><span className="sr-only">角色筛选</span><select aria-label="角色筛选" value={role} onChange={(event) => onRole(event.target.value as AgentRole | 'all')}>
        <option value="all">全部角色</option>{Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label><span className="sr-only">执行状态筛选</span><select aria-label="执行状态筛选" value={status} onChange={(event) => onStatus(event.target.value as DisplayStatus | 'all')}>
        <option value="all">全部执行状态</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {filtered ? <button className="text-button filter-reset" onClick={onClear}><X size={14} />清除筛选</button> : null}
    </div>
  </section>;
}
