'use client';
// Wrapper fino da frappe-gantt (MIT). Recria a instância quando as tasks
// ou o view_mode mudam — simples e robusto. Drag/click sobem via callbacks.
import { useEffect, useRef } from 'react';
import Gantt, { type FrappeTask } from 'frappe-gantt';
import './frappe-gantt.css';

export type ViewMode = 'Day' | 'Week' | 'Month';

interface Props {
  tasks: FrappeTask[];
  viewMode?: ViewMode;
  readonly?: boolean;
  onDateChange?: (id: string, start: Date, end: Date) => void;
  onClick?: (id: string) => void;
}

export default function GanttView({ tasks, viewMode = 'Day', readonly, onDateChange, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || tasks.length === 0) return;
    el.innerHTML = '';
    // eslint-disable-next-line no-new
    new Gantt(el, tasks, {
      view_mode: viewMode,
      readonly: !!readonly,
      infinite_padding: false,
      on_click: (t) => onClick?.(String(t.id)),
      on_date_change: (t, start, end) => onDateChange?.(String(t.id), start, end),
    });
    return () => {
      if (el) el.innerHTML = '';
    };
  }, [tasks, viewMode, readonly, onDateChange, onClick]);

  if (tasks.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted, #888)' }}>
        Nenhuma tarefa neste projeto ainda. Crie a primeira para ver a timeline.
      </div>
    );
  }
  return <div className="cron-gantt-wrap" ref={ref} />;
}
