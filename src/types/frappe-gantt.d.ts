// Tipos mínimos para frappe-gantt (MIT) — a lib não traz .d.ts.
// Expandir conforme a Fase 3 usar mais opções.
declare module 'frappe-gantt' {
  export interface FrappeTask {
    id: string;
    name: string;
    start: string; // 'YYYY-MM-DD'
    end: string;   // 'YYYY-MM-DD' (INCLUSIVO — igual ao nosso fim_calc)
    progress?: number; // 0..100
    dependencies?: string | string[]; // ids das predecessoras (FS)
    custom_class?: string; // ex.: 'bar-critica' para o caminho crítico
  }
  export interface FrappeOptions {
    view_mode?: 'Day' | 'Week' | 'Month' | 'Year' | string;
    date_format?: string;
    readonly?: boolean;
    move_dependencies?: boolean;
    popup_on?: 'click' | 'hover';
    on_click?: (task: FrappeTask) => void;
    on_date_change?: (task: FrappeTask, start: Date, end: Date) => void;
    on_progress_change?: (task: FrappeTask, progress: number) => void;
    [k: string]: unknown;
  }
  export default class Gantt {
    constructor(
      wrapper: string | HTMLElement | SVGElement,
      tasks: FrappeTask[],
      options?: FrappeOptions,
    );
    refresh(tasks: FrappeTask[]): void;
    change_view_mode(mode: string): void;
  }
}

declare module 'frappe-gantt/dist/frappe-gantt.css';
