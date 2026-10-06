// ════════════════════════════════════════════════════════════════════
// POST /api/cronograma/recalcular  { projetoId }
// Recálculo AUTORITATIVO: o MESMO motor TS do front, gravando
// inicio_calc/fim_calc/folga_dias/e_critica via RPC cron_aplicar_recalculo.
// Em ciclo, NÃO grava — devolve os erros para o cliente reconciliar.
// Projeto ligado a um quadro de tickets recalcula com "hoje" (replanejamento
// automático) — a lógica mora em lib/trabalho/cronograma-server.
// ════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { recalcularProjeto } from '@/lib/trabalho/cronograma-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { projetoId } = await req.json();
    if (!projetoId) {
      return NextResponse.json({ ok: false, error: 'projetoId obrigatório' }, { status: 400 });
    }
    const r = await recalcularProjeto(String(projetoId));
    if (r.ciclo) return NextResponse.json({ ok: false, saida: r.saida }, { status: 409 });
    if (!r.ok) {
      const status = r.error === 'Projeto não encontrado' ? 404 : 500;
      return NextResponse.json({ ok: false, error: r.error }, { status });
    }
    return NextResponse.json({ ok: true, saida: r.saida });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
