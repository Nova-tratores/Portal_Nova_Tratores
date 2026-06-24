// ════════════════════════════════════════════════════════════════════
// Detecção de conflito de recurso (Fase 4). NÃO auto-nivela — só aponta.
// Para cada recurso, soma o % de alocação das tarefas que se sobrepõem
// no tempo; dia com soma > 100% = conflito.
// TS puro (sem env) — pode ser testado isolado e rodar no cliente/servidor.
//
// TODO (evolução futura): auto-nivelamento (mover/serializar tarefas que
// competem pelo mesmo recurso). Hoje a resolução é decisão do usuário.
// ════════════════════════════════════════════════════════════════════

export interface TarefaCarga {
  id: string;
  nome: string;
  inicio: string | null; // 'YYYY-MM-DD' (inicio_calc)
  fim: string | null; // 'YYYY-MM-DD' (fim_calc)
  recursoId: string | null;
}
export interface AlocacaoCarga { tarefaId: string; recursoId: string; percentual: number; }
export interface DiaConflito { data: string; total: number; tarefas: string[]; }
export interface ConflitoRecurso { recursoId: string; dias: DiaConflito[]; }

const EPS = 0.01;
const MAX_DIAS = 366 * 5;

function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function detectarConflitos(
  tarefas: TarefaCarga[],
  alocacoes: AlocacaoCarga[],
): { porRecurso: ConflitoRecurso[]; tarefasEmConflito: Set<string> } {
  const tarPorId = new Map(tarefas.map((t) => [t.id, t]));

  // alocações efetivas: as explícitas + um 100% implícito para tarefas que
  // só têm recurso_id (sem linha de alocação para esse par).
  const efetivas: AlocacaoCarga[] = [...alocacoes];
  const temAloc = new Set(alocacoes.map((a) => `${a.tarefaId}:${a.recursoId}`));
  for (const t of tarefas) {
    if (t.recursoId && !temAloc.has(`${t.id}:${t.recursoId}`)) {
      efetivas.push({ tarefaId: t.id, recursoId: t.recursoId, percentual: 100 });
    }
  }

  // agrupa por recurso
  const porRec = new Map<string, AlocacaoCarga[]>();
  for (const a of efetivas) {
    const t = tarPorId.get(a.tarefaId);
    if (!t || !t.inicio || !t.fim) continue;
    const arr = porRec.get(a.recursoId) ?? [];
    arr.push(a);
    porRec.set(a.recursoId, arr);
  }

  const porRecurso: ConflitoRecurso[] = [];
  const tarefasEmConflito = new Set<string>();

  for (const [recursoId, allocs] of porRec) {
    const itens = allocs
      .map((a) => ({ a, t: tarPorId.get(a.tarefaId)! }))
      .filter((x) => x.t.inicio && x.t.fim);
    if (itens.length < 2) continue; // 1 tarefa nunca conflita consigo

    const inicioMin = itens.reduce((m, x) => (x.t.inicio! < m ? x.t.inicio! : m), itens[0].t.inicio!);
    const fimMax = itens.reduce((m, x) => (x.t.fim! > m ? x.t.fim! : m), itens[0].t.fim!);

    const dias: DiaConflito[] = [];
    let cur = inicioMin;
    for (let i = 0; i < MAX_DIAS && cur <= fimMax; i++, cur = addDias(cur, 1)) {
      let total = 0;
      const nomes: string[] = [];
      for (const { a, t } of itens) {
        if (t.inicio! <= cur && cur <= t.fim!) { total += Number(a.percentual); nomes.push(t.nome); }
      }
      if (total > 100 + EPS) {
        dias.push({ data: cur, total, tarefas: nomes });
        for (const { t } of itens) if (t.inicio! <= cur && cur <= t.fim!) tarefasEmConflito.add(t.id);
      }
    }
    if (dias.length) porRecurso.push({ recursoId, dias });
  }

  return { porRecurso, tarefasEmConflito };
}
