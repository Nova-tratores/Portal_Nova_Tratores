// ════════════════════════════════════════════════════════════════════
// POST /api/cronograma/recalcular  { projetoId }
// Recálculo AUTORITATIVO: carrega o grafo do projeto, roda o MESMO motor
// TS do front (src/lib/cronograma/motor) e grava inicio_calc/fim_calc/
// folga_dias/e_critica via RPC cron_aplicar_recalculo (transação).
// Em ciclo, NÃO grava — devolve os erros para o cliente reconciliar.
// ════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cronogramaAdmin } from '@/lib/cronograma/supabase-server';
import { calcular } from '@/lib/cronograma/motor';
import type {
  Calendario,
  DepIn,
  EntradaMotor,
  Recurso,
  TarefaIn,
} from '@/lib/cronograma/motor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { projetoId } = await req.json();
    if (!projetoId) {
      return NextResponse.json({ ok: false, error: 'projetoId obrigatório' }, { status: 400 });
    }

    const db = cronogramaAdmin().schema('cronograma');

    // ── carrega o grafo do projeto + recursos/calendários globais ─────
    const [projetoRes, tarefasRes, depsRes, recursosRes, calsRes, excRes] = await Promise.all([
      db.from('projetos').select('id, data_inicio, calendario_id').eq('id', projetoId).single(),
      db
        .from('tarefas')
        .select('id, duracao_dias, restricao, restricao_data, recurso_id, parent_id, tipo, inicio_real, fim_real, status')
        .eq('projeto_id', projetoId),
      db
        .from('dependencias')
        .select('predecessora_id, sucessora_id, tipo, lag_dias')
        .eq('projeto_id', projetoId),
      db.from('recursos').select('id, calendario_id'),
      db.from('calendarios').select('id, dias_semana'),
      db.from('calendario_excecoes').select('calendario_id, data, tipo'),
    ]);

    const erroDb = projetoRes.error || tarefasRes.error || depsRes.error ||
      recursosRes.error || calsRes.error || excRes.error;
    if (erroDb) {
      return NextResponse.json({ ok: false, error: erroDb.message }, { status: 500 });
    }
    if (!projetoRes.data) {
      return NextResponse.json({ ok: false, error: 'Projeto não encontrado' }, { status: 404 });
    }

    // ── monta EntradaMotor ────────────────────────────────────────────
    const excPorCal = new Map<string, Calendario['excecoes']>();
    for (const e of excRes.data ?? []) {
      const arr = excPorCal.get(e.calendario_id) ?? [];
      arr.push({ data: e.data, tipo: e.tipo });
      excPorCal.set(e.calendario_id, arr);
    }

    const calendarios: Calendario[] = (calsRes.data ?? []).map((c) => ({
      id: c.id,
      diasSemana: (c.dias_semana ?? []) as number[],
      excecoes: excPorCal.get(c.id) ?? [],
    }));

    const recursos: Recurso[] = (recursosRes.data ?? [])
      .filter((r) => r.calendario_id)
      .map((r) => ({ id: r.id, calendarioId: r.calendario_id as string }));

    const tarefas: TarefaIn[] = (tarefasRes.data ?? []).map((t) => ({
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
    }));

    const dependencias: DepIn[] = (depsRes.data ?? []).map((d) => ({
      predecessoraId: d.predecessora_id,
      sucessoraId: d.sucessora_id,
      tipo: d.tipo,
      lagDias: Number(d.lag_dias),
    }));

    const entrada: EntradaMotor = {
      inicioProjeto: projetoRes.data.data_inicio,
      calendarioPadraoId: projetoRes.data.calendario_id ?? '',
      tarefas,
      dependencias,
      recursos,
      calendarios,
    };

    // ── roda o motor ──────────────────────────────────────────────────
    const saida = calcular(entrada);

    // ciclo → não grava nada (a verdade do banco fica intacta)
    if (saida.erros.some((e) => e.tipo === 'ciclo')) {
      return NextResponse.json({ ok: false, saida }, { status: 409 });
    }

    // ── grava o recálculo (snake_case p/ o jsonb_to_recordset) ────────
    const payload = saida.tarefas.map((t) => ({
      id: t.id,
      inicio_calc: t.inicioCalc,
      fim_calc: t.fimCalc,
      folga_dias: t.folgaDias,
      e_critica: t.eCritica,
    }));

    const { error: rpcErr } = await db.rpc('cron_aplicar_recalculo', {
      p_projeto_id: projetoId,
      p_tarefas: payload,
      p_fim_projeto: saida.fimProjeto,
    });
    if (rpcErr) {
      return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, saida });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
