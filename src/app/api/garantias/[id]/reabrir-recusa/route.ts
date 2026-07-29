import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { registrarEvento, notificarTecnico } from '@/lib/garantias/server';

// POST /api/garantias/[id]/reabrir-recusa
// Reverte uma recusa interna (garantista) e volta a garantia pra 'em_analise'.
// Recusas vindas da fábrica NÃO podem ser revertidas por aqui — tem decisão
// externa, precisa de novo retorno da fábrica.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, status, recusado_por, numero, id_ordem, tecnico_nome, cobranca_status')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status !== 'rejeitada' || g.recusado_por !== 'garantista') {
    return NextResponse.json(
      { error: 'Só é possível reabrir uma recusa interna (feita pelo garantista).' },
      { status: 400 }
    );
  }
  // Bloqueia reabrir se a cobrança já foi paga ou baixada — virou caso fechado.
  if (g.cobranca_status === 'paga' || g.cobranca_status === 'baixada_prejuizo') {
    return NextResponse.json(
      { error: `Esta garantia já tem cobrança em estado "${g.cobranca_status}". Reabra a cobrança antes de reabrir a garantia.` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TBL_GARANTIAS)
    .update({
      status: 'em_analise',
      resultado: null,
      motivo_recusa: null,
      recusado_por: null,
      finalizada_em: null,
      valor_pago_horas: null,
      valor_pago_km: null,
      valor_pago_pecas: null,
      valor_pago_total: null,
      cobranca_status: 'nao_aplicavel',
      cobranca_itens: {},
      cobranca_outros: [],
      cobranca_valor_total: null,
      cobranca_vencimento: null,
      cobranca_cobrada_em: null,
      cobranca_pago_em: null,
      cobranca_baixada_em: null,
      cobranca_obs: null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) {
    console.error('Erro ao reabrir recusa:', error.message);
    return NextResponse.json({ error: 'Falha ao reabrir a recusa.' }, { status: 500 });
  }

  // Volta as peças pra 'pendente' (estavam todas como 'rejeitada')
  await supabase
    .from(TBL_GAR_PECAS)
    .update({ resultado: 'pendente' })
    .eq('garantia_id', id);

  await registrarEvento(id, {
    tipo: 'recusa_reaberta',
    statusAnterior: 'rejeitada',
    statusNovo: 'em_analise',
    ator,
    detalhe: body.motivo
      ? `Recusa reaberta — ${String(body.motivo).slice(0, 140)}`
      : 'Recusa interna reaberta pelo garantista',
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo: `Garantia ${g.numero} reaberta`,
    descricao: `A recusa da OS ${g.id_ordem} foi reaberta — o garantista vai reanalisar.`,
    link: `/os/${g.id_ordem}`,
  });

  return NextResponse.json({ ok: true });
}
