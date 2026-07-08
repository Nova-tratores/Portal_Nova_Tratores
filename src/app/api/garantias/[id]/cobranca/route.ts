import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import {
  TBL_GARANTIAS,
  TBL_GAR_PECAS,
  VALOR_HORA,
  VALOR_KM,
} from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import type {
  CobrancaStatus,
  CobrancaItens,
  CobrancaOutro,
} from '@/lib/garantias/types';

// Calcula o total da cobrança a partir do checklist + outros lançamentos
// Reaproveita os dados da garantia (horas/km do garantista, peças aprovadas).
async function calcularValorTotal(garantiaId: string, itens: CobrancaItens, outros: CobrancaOutro[]): Promise<number> {
  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('garantista_horas, garantista_km, tecnico_horas, tecnico_km')
    .eq('id', garantiaId)
    .maybeSingle();
  if (!g) return 0;

  // Valores editados pelo garantista sobrepõem o cálculo padrão (clamp >= 0).
  const v = itens.valores || {};
  const positivo = (n: unknown) => Math.max(0, Number(n) || 0);

  let total = 0;
  if (itens.horas) {
    if (v.horas != null) {
      total += positivo(v.horas);
    } else {
      const h = g.garantista_horas != null ? Number(g.garantista_horas) : Number(g.tecnico_horas) || 0;
      total += h * VALOR_HORA;
    }
  }
  if (itens.km) {
    if (v.km != null) {
      total += positivo(v.km);
    } else {
      const k = g.garantista_km != null ? Number(g.garantista_km) : Number(g.tecnico_km) || 0;
      total += k * VALOR_KM;
    }
  }
  if (itens.pecas && itens.pecas.length > 0) {
    const { data: pecas } = await supabase
      .from(TBL_GAR_PECAS)
      .select('id, preco_unitario, quantidade')
      .in('id', itens.pecas);
    for (const p of pecas || []) {
      const override = v.pecas?.[p.id];
      total += override != null
        ? positivo(override)
        : (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
    }
  }
  for (const o of outros || []) {
    total += Number(o.valor) || 0;
  }
  return Math.round(total * 100) / 100;
}

// PATCH /api/garantias/[id]/cobranca
// Ações suportadas (body.acao):
//   "definir"       → salva itens/vencimento/obs, calcula total, vira 'cobrada'
//   "marcar_paga"   → registra pago_em → 'paga'
//   "baixar"        → registra baixada_em → 'baixada_prejuizo'
//   "nao_cobrar"   → marca como 'nao_cobrar' (cortesia)
//   "reabrir"       → volta pra 'pendente' (apaga datas/itens)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const acao = String(body.acao || 'definir');
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, status, cobranca_status, cobranca_valor_total')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  // Cobrança vale em garantias finalizadas: rejeitadas (tudo) ou aprovadas que
  // não pagaram algum item (M.O./deslocamento/peça vira cobrança ou interno).
  if (g.status !== 'rejeitada' && g.status !== 'aprovada') {
    return NextResponse.json(
      { error: 'Cobrança só é possível em garantias finalizadas.' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  let novoStatus: CobrancaStatus = g.cobranca_status as CobrancaStatus;
  let evento = '';

  if (acao === 'definir') {
    const itens = (body.itens || {}) as CobrancaItens;
    const outros = Array.isArray(body.outros) ? (body.outros as CobrancaOutro[]) : [];
    const total = await calcularValorTotal(id, itens, outros);
    if (!(total > 0)) {
      return NextResponse.json(
        { error: 'Selecione pelo menos um item ou adicione um lançamento extra para gerar a cobrança.' },
        { status: 400 },
      );
    }
    novoStatus = 'cobrada';
    update.cobranca_status = novoStatus;
    update.cobranca_itens = itens;
    update.cobranca_outros = outros;
    update.cobranca_valor_total = total;
    update.cobranca_vencimento = body.vencimento || null;
    update.cobranca_obs = body.obs || null;
    update.cobranca_cobrada_em = now;
    update.cobranca_pago_em = null;
    update.cobranca_baixada_em = null;
    evento = `Cobrança ao cliente lançada — R$ ${total.toFixed(2).replace('.', ',')}`;
  } else if (acao === 'marcar_paga') {
    if (g.cobranca_status !== 'cobrada') {
      return NextResponse.json(
        { error: 'Só é possível marcar como paga uma cobrança que está aguardando pagamento.' },
        { status: 400 },
      );
    }
    novoStatus = 'paga';
    update.cobranca_status = novoStatus;
    update.cobranca_pago_em = now;
    evento = 'Cobrança paga pelo cliente';
  } else if (acao === 'baixar') {
    if (g.cobranca_status !== 'cobrada') {
      return NextResponse.json(
        { error: 'Só dá pra baixar como prejuízo uma cobrança que está em aberto.' },
        { status: 400 },
      );
    }
    novoStatus = 'baixada_prejuizo';
    update.cobranca_status = novoStatus;
    update.cobranca_baixada_em = now;
    evento = body.motivo
      ? `Cobrança baixada como prejuízo: ${body.motivo}`
      : 'Cobrança baixada como prejuízo';
    if (body.motivo) update.cobranca_obs = body.motivo;
  } else if (acao === 'nao_cobrar') {
    novoStatus = 'nao_cobrar';
    update.cobranca_status = novoStatus;
    update.cobranca_valor_total = 0;
    update.cobranca_itens = {};
    update.cobranca_outros = [];
    update.cobranca_obs = body.motivo || 'Cortesia — não cobrar';
    evento = `Garantista decidiu não cobrar (${body.motivo || 'cortesia'})`;
  } else if (acao === 'reabrir') {
    novoStatus = 'pendente';
    update.cobranca_status = novoStatus;
    update.cobranca_cobrada_em = null;
    update.cobranca_pago_em = null;
    update.cobranca_baixada_em = null;
    update.cobranca_valor_total = null;
    update.cobranca_itens = {};
    update.cobranca_outros = [];
    update.cobranca_vencimento = null;
    evento = 'Cobrança reaberta';
  } else {
    return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id);
  if (upErr) {
    console.error('Erro ao atualizar cobrança:', upErr.message);
    return NextResponse.json({ error: 'Falha ao salvar a cobrança.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: `cobranca_${acao}`,
    ator,
    detalhe: evento,
  });

  return NextResponse.json({ ok: true, cobranca_status: novoStatus });
}
