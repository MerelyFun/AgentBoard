import { useEffect, useMemo, useRef, useState } from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import { EVENT_LABELS, formatAbsoluteTime, sortEvents, type AgentRun, type BoardEvent, type Project } from '../domain/board';
import { formatEventClock, getAgentIdentity, groupEventsByDay, resolveEventRun } from '../domain/presentation';
import { RoleAvatar } from './AgentIdentity';
import { Pagination, usePagination } from './Pagination';

export function EventTimeline({ events, runs, projects, now, demo, hasEvents = events.length > 0, onEvent, viewKey = '' }: {
  events: BoardEvent[]; runs: AgentRun[]; projects: readonly Project[]; now: number; demo: boolean; hasEvents?: boolean; onEvent: (event: BoardEvent) => void;
  viewKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(() => sortEvents(events), [events]);
  const pagination = usePagination(ordered.length, expanded ? 10 : 5, viewKey);
  const timelineRef = useRef<HTMLDivElement>(null);
  const visible = ordered.slice(pagination.startIndex, pagination.endIndex);
  const groups = groupEventsByDay(visible, now);
  useEffect(() => { timelineRef.current?.scrollTo({ top: 0 }); }, [pagination.page, expanded, viewKey]);
  return <section className="panel timeline-panel" aria-labelledby="events-title">
    <div className="section-heading"><h2 id="events-title">重要事件</h2><span>已收到 {events.length} 条{demo ? ' · 演示' : ''}</span></div>
    {visible.length ? <div className="timeline-groups" ref={timelineRef} role="region" aria-label="本页已收到的重要事件，可滚动查看更多" tabIndex={0}>{groups.map((group) => <section className="timeline-day" key={group.key} aria-label={group.label}>
      <h3 className="timeline-day-heading">{group.label}<span>上海时间</span></h3>
      <ol className="timeline">{group.events.map((event) => {
        const project = projects.find((item) => item.id === event.projectId);
        const run = resolveEventRun(event, runs);
        const identity = getAgentIdentity(event, runs);
        const action = EVENT_LABELS[event.kind] ?? event.kind;
        return <li className="timeline-event" key={event.id}>
          <span className={`timeline-dot ${event.role}`} aria-hidden="true" />
          <button className="timeline-event-button" onClick={() => onEvent(event)} aria-label={`查看事件：${identity.label}，${action}，${event.summary}`}>
            <RoleAvatar role={event.role} className="timeline-avatar" />
            <span className="timeline-event-content">
              <span className="timeline-event-heading">
                <span className="timeline-agent" title={identity.fullId ? `${identity.idLabel}：${identity.fullId}` : '未关联执行'}>{identity.label}</span>
                <span className={`event-kind kind-${event.kind}`}>{action}</span>
                <time className="timeline-clock" title={formatAbsoluteTime(event.at)} dateTime={event.at}>{formatEventClock(event.at)}</time>
              </span>
              <strong className="timeline-summary">{event.summary}</strong>
              <span className="timeline-context"><span className="timeline-project">{project?.name ?? event.projectId}</span><span className="timeline-task">{run?.task ?? '任务未关联'}</span></span>
              <span className="timeline-stage">{run ? `${run.stage.id} · ${run.stage.name} / ${run.step.id} · ${run.step.name}` : '阶段未关联'}</span>
            </span>
          </button>
        </li>;
      })}</ol>
    </section>)}</div> : <div className="timeline-empty"><GitCommitHorizontal size={28} strokeWidth={1.3} /><p>{hasEvents ? '没有匹配的事件' : '等待第一条关键上报'}</p></div>}
    {expanded && events.length > 5 ? <Pagination {...pagination} onPageChange={pagination.setPage} label="已收到事件分页" itemLabel="条事件" /> : null}
    {events.length > 5 ? <button type="button" className="text-button timeline-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? '收起至最近 5 条' : `分页查看已收到的 ${events.length} 条事件`}</button> : null}
    <p className="timeline-note">仅展示当前已收到的关键上报；云端快照保留最近 200 条。长时间未更新不代表停止。</p>
  </section>;
}
