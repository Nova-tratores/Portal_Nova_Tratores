// ════════════════════════════════════════════════════════════════════
// Motor de agendamento — CPM com calendário de recurso.
// Forward pass (datas cedo) + backward pass (datas tarde) → folga e
// caminho crítico. Respeita FS/SS/FF/SF + lag, restrições, âncora de
// execução real e tarefas-resumo.
//
// Convenção de datas: inclusiva. Tarefa de 1 dia começa e termina no
// mesmo dia útil. FS com lag 0 → sucessora começa no próximo dia útil.
// ════════════════════════════════════════════════════════════════════

import type {
  Calendario,
  EntradaMotor,
  ErroMotor,
  SaidaMotor,
  TarefaIn,
  TarefaOut,
} from './tipos';
import {
  EPS,
  deslocarDiasUteis,
  diasUteisEntre,
  fimPorDuracao,
  inicioPorDuracao,
  maiorData,
  menorData,
  proximoDiaUtil,
} from './calendario';
import { ordenacaoTopologica } from './grafo';

interface Calc {
  inicio: string;
  fim: string;
  lateInicio: string;
  lateFim: string;
  folga: number;
  critica: boolean;
}

export function calcular(entrada: EntradaMotor): SaidaMotor {
  const { tarefas, dependencias, recursos, calendarios, inicioProjeto } = entrada;
  const erros: ErroMotor[] = [];

  // ── mapas de apoio ────────────────────────────────────────────────
  const calPorId = new Map(calendarios.map((c) => [c.id, c]));
  const recPorId = new Map(recursos.map((r) => [r.id, r]));
  const tarPorId = new Map(tarefas.map((t) => [t.id, t]));

  // calendário "vazio" de fallback (seg–sex) se nada for encontrado
  const calFallback: Calendario = {
    id: '__fallback__',
    diasSemana: [1, 2, 3, 4, 5],
    excecoes: [],
  };

  function calDaTarefa(t: TarefaIn): Calendario {
    if (t.recursoId) {
      const rec = recPorId.get(t.recursoId);
      if (rec?.calendarioId) {
        const c = calPorId.get(rec.calendarioId);
        if (c) return c;
      }
    }
    return calPorId.get(entrada.calendarioPadraoId) ?? calFallback;
  }

  const ehResumo = (t: TarefaIn) => t.tipo === 'resumo';
  const dur = (t: TarefaIn) => Math.max(0, t.duracaoDias);

  // ── ordenação topológica + ciclo ──────────────────────────────────
  const ids = tarefas.map((t) => t.id);
  const topo = ordenacaoTopologica(ids, dependencias);
  if (topo.ciclo) {
    erros.push({
      tipo: 'ciclo',
      detalhe: 'Dependências formam um ciclo; datas não recalculadas.',
      ids: topo.idsCiclo,
    });
    // não devolve datas — o chamador mantém o banco intacto
    return { tarefas: [], fimProjeto: inicioProjeto, erros };
  }

  const calc = new Map<string, Calc>();
  // arestas indexadas por predecessora (backward) e por sucessora (forward)
  const depsPorPred = new Map<string, typeof dependencias>();
  const depsPorSuc = new Map<string, typeof dependencias>();
  for (const d of dependencias) {
    const pred = depsPorPred.get(d.predecessoraId) ?? [];
    pred.push(d);
    depsPorPred.set(d.predecessoraId, pred);
    const suc = depsPorSuc.get(d.sucessoraId) ?? [];
    suc.push(d);
    depsPorSuc.set(d.sucessoraId, suc);
  }

  // ── FORWARD PASS (datas cedo) ─────────────────────────────────────
  for (const id of topo.ordem) {
    const t = tarPorId.get(id)!;
    if (ehResumo(t)) continue; // resumo é agregado depois

    const cal = calDaTarefa(t);
    const d = dur(t);

    // âncora em execução real
    if (t.status === 'concluida' && t.fimReal) {
      const ini = t.inicioReal ?? t.fimReal;
      calc.set(id, base(ini, t.fimReal));
      continue;
    }
    if (t.status === 'em_andamento' && t.inicioReal) {
      const ini = t.inicioReal;
      calc.set(id, base(ini, fimPorDuracao(cal, ini, d)));
      continue;
    }

    // candidatos de início mais cedo
    let inicio = inicioProjeto;
    if (
      (t.restricao === 'iniciar_nao_antes' || t.restricao === 'data_fixa') &&
      t.restricaoData
    ) {
      inicio = maiorData(inicio, t.restricaoData);
    }

    for (const dep of depsPorSuc.get(id) ?? []) {
      const p = calc.get(dep.predecessoraId);
      if (!p) continue; // predecessora resumo/ausente → ignora
      const L = dep.lagDias;
      let cand: string;
      switch (dep.tipo) {
        case 'FS':
          cand = deslocarDiasUteis(cal, p.fim, L + 1);
          break;
        case 'SS':
          cand = deslocarDiasUteis(cal, proximoDiaUtil(cal, p.inicio), L);
          break;
        case 'FF': {
          const boundFim = deslocarDiasUteis(cal, p.fim, L);
          cand = inicioPorDuracao(cal, boundFim, d);
          break;
        }
        case 'SF': {
          const boundFim = deslocarDiasUteis(cal, proximoDiaUtil(cal, p.inicio), L);
          cand = inicioPorDuracao(cal, boundFim, d);
          break;
        }
      }
      inicio = maiorData(inicio, cand);
    }

    inicio = proximoDiaUtil(cal, inicio);
    const fim = fimPorDuracao(cal, inicio, d);

    // restrições "não depois de" (não empurram; só avisam se violadas)
    if (
      (t.restricao === 'iniciar_nao_depois' || t.restricao === 'data_fixa') &&
      t.restricaoData &&
      inicio > t.restricaoData
    ) {
      erros.push({
        tipo: 'restricao_violada',
        detalhe: `Tarefa não pode iniciar até ${t.restricaoData}; mais cedo possível é ${inicio}.`,
        ids: [id],
      });
    }

    calc.set(id, base(inicio, fim));
  }

  // ── fim do projeto (máximo entre as folhas calculadas) ────────────
  let fimProjeto = inicioProjeto;
  for (const c of calc.values()) fimProjeto = maiorData(fimProjeto, c.fim);

  // ── BACKWARD PASS (datas tarde) + folga ───────────────────────────
  for (let i = topo.ordem.length - 1; i >= 0; i--) {
    const id = topo.ordem[i];
    const t = tarPorId.get(id)!;
    if (ehResumo(t)) continue;
    const c = calc.get(id);
    if (!c) continue;
    const cal = calDaTarefa(t);
    const d = dur(t);

    // tarefas concluídas/canceladas não têm folga (ancoradas)
    if (t.status === 'concluida' || t.status === 'cancelada') {
      c.lateInicio = c.inicio;
      c.lateFim = c.fim;
      c.folga = 0;
      c.critica = false;
      continue;
    }

    let lateFim = fimProjeto;
    for (const dep of depsPorPred.get(id) ?? []) {
      const s = calc.get(dep.sucessoraId);
      if (!s) continue;
      const L = dep.lagDias;
      let candFim: string;
      switch (dep.tipo) {
        case 'FS':
          candFim = deslocarDiasUteis(cal, s.lateInicio, -(L + 1));
          break;
        case 'SS': {
          const xInicio = deslocarDiasUteis(cal, s.lateInicio, -L);
          candFim = fimPorDuracao(cal, xInicio, d);
          break;
        }
        case 'FF':
          candFim = deslocarDiasUteis(cal, s.lateFim, -L);
          break;
        case 'SF': {
          const xInicio = deslocarDiasUteis(cal, s.lateFim, -L);
          candFim = fimPorDuracao(cal, xInicio, d);
          break;
        }
      }
      lateFim = menorData(lateFim, candFim);
    }

    c.lateFim = lateFim;
    c.lateInicio = inicioPorDuracao(cal, lateFim, d);
    c.folga = diasUteisEntre(cal, c.inicio, c.lateInicio);
    c.critica = c.folga <= EPS;
  }

  // ── TAREFAS-RESUMO (agregam filhos; calculadas por profundidade) ──
  const resumoMemo = new Map<string, Calc | null>();
  function calcResumo(id: string): Calc | null {
    if (resumoMemo.has(id)) return resumoMemo.get(id)!;
    const filhos = tarefas.filter((x) => x.parentId === id);
    let ini: string | null = null;
    let fim: string | null = null;
    let folga = Infinity;
    for (const f of filhos) {
      const fc = ehResumo(f) ? calcResumo(f.id) : calc.get(f.id) ?? null;
      if (!fc) continue;
      ini = ini === null ? fc.inicio : menorData(ini, fc.inicio);
      fim = fim === null ? fc.fim : maiorData(fim, fc.fim);
      folga = Math.min(folga, fc.folga);
    }
    const r: Calc | null =
      ini && fim
        ? {
            inicio: ini,
            fim,
            lateInicio: ini,
            lateFim: fim,
            folga: folga === Infinity ? 0 : folga,
            critica: (folga === Infinity ? 0 : folga) <= EPS,
          }
        : null;
    resumoMemo.set(id, r);
    if (r) calc.set(id, r);
    return r;
  }
  for (const t of tarefas) if (ehResumo(t)) calcResumo(t.id);

  // ── saída ─────────────────────────────────────────────────────────
  const out: TarefaOut[] = [];
  for (const t of tarefas) {
    const c = calc.get(t.id);
    if (!c) continue;
    out.push({
      id: t.id,
      inicioCalc: c.inicio,
      fimCalc: c.fim,
      folgaDias: round2(c.folga),
      eCritica: c.critica,
    });
  }

  return { tarefas: out, fimProjeto, erros };
}

// tarefa recém-calculada (datas tarde preenchidas no backward pass)
function base(inicio: string, fim: string): Calc {
  return { inicio, fim, lateInicio: inicio, lateFim: fim, folga: 0, critica: true };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
