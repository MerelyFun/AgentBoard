import { ACTIVITY_SCOPE_LABELS, type ActivityScope } from '../domain/activity';

const SCOPES: ActivityScope[] = ['active', 'unconfirmed', 'history', 'all'];

export function ActivitySwitcher({ scope, counts, onScope }: {
  scope: ActivityScope; counts: Record<ActivityScope, number>; onScope: (scope: ActivityScope) => void;
}) {
  return <div className="activity-switcher">
    <div className="activity-scopes" role="group" aria-label="执行显示范围">
      {SCOPES.map((item) => <button key={item} aria-pressed={scope === item}
        className={`activity-scope ${scope === item ? 'selected' : ''}`} onClick={() => onScope(item)}>
        {ACTIVITY_SCOPE_LABELS[item]}<span>{counts[item]}</span>
      </button>)}
    </div>
    <p>{scope === 'active' ? '只显示近期活跃上报，已结束的执行默认隐藏。'
      : scope === 'unconfirmed' ? '超过 20 分钟未更新，或尚无完整状态；不代表进程已停止。'
        : scope === 'history' ? '已提交、已结束及验收记录。' : '包含活跃、待确认和历史执行。'}</p>
  </div>;
}
