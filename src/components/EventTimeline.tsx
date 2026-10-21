import { useState } from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import { PROJECTS, formatAbsoluteTime, formatRelativeTime, type BoardEvent } from '../domain/board';

export function EventTimeline({ events, now, demo, onEvent }: { events: BoardEvent[]; now: number; demo: boolean; onEvent: (event: BoardEvent) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 5);
  return <section className="panel timeline-panel" aria-labelledby="events-title">
    <div className="section-heading"><h2 id="events-title">关键事件</h2><span>{demo ? '演示' : `${events.length} 条`}</span></div>
    {visible.length ? <ol className="timeline">{visible.map((event) => {
      const project = PROJECTS.find((p) => p.id === event.projectId)!;
      return <li key={event.id}>
        <time title={formatAbsoluteTime(event.at)} dateTime={event.at}>{formatRelativeTime(event.at, now)}</time>
        <span className="timeline-dot" style={{ background: project.color }} aria-hidden="true" />
        <button onClick={() => onEvent(event)}><strong>{event.summary}</strong><span>{project.name}</span></button>
      </li>;
    })}</ol> : <div className="timeline-empty"><GitCommitHorizontal size={28} strokeWidth={1.3} /><p>重要行动将在这里留下记录</p></div>}
    {events.length > 5 ? <button className="text-button timeline-more" onClick={() => setExpanded(!expanded)}>{expanded ? '收起事件' : `查看全部 ${events.length} 条事件`}</button> : null}
    <p className="timeline-note">仅展示关键上报，长时间未更新不代表停止。</p>
  </section>;
}
