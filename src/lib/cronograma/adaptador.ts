// ════════════════════════════════════════════════════════════════════
// Adaptadores entre o modelo do banco, a frappe-gantt e o motor TS.
//  - paraFrappe: linhas → tasks da frappe (render).
//  - montarEntradaMotor: linhas → EntradaMotor (preview otimista no cliente).
// ════════════════════════════════════════════════════════════════════
import type { FrappeTask } from 'frappe-gantt';
import type { Calendario, EntradaMotor } from './motor';
import type { ProjetoCompleto, TarefaRow, DependenciaRow } from './queries';

/** Calendário (formato do motor) aplicável a uma tarefa: o do recurso, senão o do projeto. */
export function calendarioDaTarefa(pc: ProjetoCompleto, tarefa: TarefaRow): Calendario {
  const fallback: Calendario = { id: '__fallback__', diasSemana: [1, 2, 3, 4, 5], excecoes: [] };
  const excecoesDe = (calId: string): Calendario['excecoes'] =>
    pc.excecoes.filter((e) => e.calendario_id === calId).map((e) => ({ data: e.data, tipo: e.tipo }));

  let calId = pc.projeto.calendario_id ?? null;
  if (tarefa.recurso_id) {
    const rec = pc.recursos.find((r) => r.id === tarefa.recurso_id);
    if (rec?.calendario_id) calId = rec.calendario_id;
  }
  const cal = calId ? pc.calendarios.find((c) => c.id === calId) : null;
  if (!cal) return fallback;
  return { id: cal.id, diasSemana: cal.dias_semana ?? [], excecoes: excecoesDe(cal.id) };
}

/** Predecessoras por sucessora (para desenhar setas e o motor). */
function mapaPredecessoras(deps: DependenciaRow[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const d of deps) {
    const arr = m.get(d.sucessora_id) ?? [];
    arr.push(d.predecessora_id);
    m.set(d.sucessora_id, arr);
  }
  return m;
}

export function paraFrappe(
  tarefas: TarefaRow[],
  deps: DependenciaRow[],
  inicioProjeto: string,
  conflitos?: Set<string>,
): FrappeTask[] {
  const preds = mapaPredecessoras(deps);
  return tarefas.map((t) => {
    const start = t.inicio_calc ?? t.inicio_real ?? t.inicio_planejado ?? inicioProjeto;
    const end = t.fim_calc ?? t.fim_real ?? start; // `end` da frappe é inclusivo
    const base = t.e_critica ? 'bar-critica' : t.status === 'bloqueada' ? 'bar-bloqueada' : '';
    const classe = [base, conflitos?.has(t.id) ? 'bar-conflito' : ''].filter(Boolean).join(' ');
    return {
      id: t.id,
      name: t.nome,
      start,
      end,
      progress: Number(t.progresso) || 0,
      dependencies: (preds.get(t.id) ?? []).join(', '),
      custom_class: classe || undefined,
    };
  });
}

/** Monta a EntradaMotor a partir do projeto completo (para o preview). */
export function montarEntradaMotor(pc: ProjetoCompleto): EntradaMotor {
  const excPorCal = new Map<string, { data: string; tipo: 'folga' | 'extra' }[]>();
  for (const e of pc.excecoes) {
    const arr = excPorCal.get(e.calendario_id) ?? [];
    arr.push({ data: e.data, tipo: e.tipo });
    excPorCal.set(e.calendario_id, arr);
  }
  return {
    inicioProjeto: pc.projeto.data_inicio,
    calendarioPadraoId: pc.projeto.calendario_id ?? '',
    tarefas: pc.tarefas.map((t) => ({
      id: t.id,
      duracaoDias: Number(t.duracao_dias),
      restricao: t.restricao,
      restricaoData: t.restricao_data ?? undefined,
      recursoId: t.recurso_id ?? undefined,
      parentId: t.parent_id ?? null,
      tipo: t.tipo,
      inicioReal: t.inicio_real ?? undefined,
      fimReal: t.fim_real ?? undefined,
      status: t.status,
    })),
    dependencias: pc.dependencias.map((d) => ({
      predecessoraId: d.predecessora_id,
      sucessoraId: d.sucessora_id,
      tipo: d.tipo,
      lagDias: Number(d.lag_dias),
    })),
    recursos: pc.recursos
      .filter((r) => r.calendario_id)
      .map((r) => ({ id: r.id, calendarioId: r.calendario_id as string })),
    calendarios: pc.calendarios.map((c) => ({
      id: c.id,
      diasSemana: c.dias_semana ?? [],
      excecoes: excPorCal.get(c.id) ?? [],
    })),
  };
}
