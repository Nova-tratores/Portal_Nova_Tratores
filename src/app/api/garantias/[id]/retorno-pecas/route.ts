import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS, TBL_GAR_PEND } from '@/lib/garantias/constants';
import { registrarEvento, notificarTecnico, notificarGarantistas } from '@/lib/garantias/server';

// POST /api/garantias/[id]/retorno-pecas — 1ª etapa do fluxo em duas etapas:
// a fábrica respondeu sobre as PEÇAS. Registra o resultado por peça + valor pago
// e move a garantia para 'aguardando_servico' (ou finaliza 'rejeitada' se a
// fábrica recusou tudo).
// body: { pecas_aprovadas: string[], valor_pago_pecas?, motivo_recusa?, garantista_nome? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, tecnico_nome, montadora:garantia_montadoras(fluxo)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  type MontFluxo = { fluxo?: string };
  const mont = (g as unknown as { montadora?: MontFluxo | MontFluxo[] }).montadora;
  const m = Array.isArray(mont) ? mont[0] : mont;
  if (m?.fluxo !== 'duas_etapas') {
    return NextResponse.json(
      { error: 'O retorno das peças só existe em montadoras com fluxo em duas etapas.' },
      { status: 400 }
    );
  }
  if (g.status !== 'enviada') {
    return NextResponse.json(
      { error: 'O retorno das peças só pode ser registrado com a garantia na fábrica.' },
      { status: 400 }
    );
  }

  // Não registrar retorno com pendência aberta
  const { data: pendAberta } = await supabase
    .from(TBL_GAR_PEND)
    .select('id')
    .eq('garantia_id', id)
    .eq('status', 'aberta')
    .limit(1);
  if (pendAberta && pendAberta.length > 0) {
    return NextResponse.json(
      { error: 'Resolva a pendência aberta antes de registrar o retorno.' },
      { status: 400 }
    );
  }

  const pecasAprovadasIds: string[] = Array.isArray(body.pecas_aprovadas) ? body.pecas_aprovadas : [];
  const idsAprovados = new Set(pecasAprovadasIds);

  const { data: pecasGarantia } = await supabase
    .from(TBL_GAR_PECAS)
    .select('id, descricao, quantidade, preco_unitario')
    .eq('garantia_id', id);
  const todasPecas = (pecasGarantia || []) as {
    id: string; descricao: string; quantidade: number; preco_unitario: number;
  }[];

  const aprovadasIdsList = todasPecas.filter((p) => idsAprovados.has(p.id)).map((p) => p.id);
  const rejeitadasIdsList = todasPecas.filter((p) => !idsAprovados.has(p.id)).map((p) => p.id);
  const agora = new Date().toISOString();
  const ator = body.garantista_nome || 'Garantista';

  // ── Fábrica recusou todas as peças → garantia finaliza rejeitada ──────────
  if (aprovadasIdsList.length === 0) {
    const motivo = String(body.motivo_recusa || '').trim();
    if (!motivo) {
      return NextResponse.json(
        { error: 'Informe o motivo da recusa das peças.' },
        { status: 400 }
      );
    }

    if (todasPecas.length > 0) {
      await supabase.from(TBL_GAR_PECAS).update({ resultado: 'rejeitada' }).eq('garantia_id', id);
    }

    const update: Record<string, unknown> = {
      status: 'rejeitada',
      resultado: 'rejeitada',
      recusado_por: 'fabrica',
      motivo_recusa: motivo,
      pecas_retorno_em: agora,
      finalizada_em: agora,
      updated_at: agora,
      valor_pago_horas: 0,
      valor_pago_km: 0,
      valor_pago_pecas: 0,
      valor_pago_total: 0,
      // Rejeitada → libera o fluxo de cobrança ao cliente
      cobranca_status: 'pendente',
    };
    if (body.garantista_nome) update.garantista_nome = body.garantista_nome;

    const { data, error } = await supabase
      .from(TBL_GARANTIAS)
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Erro ao registrar recusa das peças:', error.message);
      return NextResponse.json({ error: 'Falha ao registrar o retorno das peças.' }, { status: 500 });
    }

    const motivoCurto = motivo.slice(0, 140);
    await registrarEvento(id, {
      tipo: 'rejeitada',
      statusAnterior: 'enviada',
      statusNovo: 'rejeitada',
      ator,
      detalhe: `Fábrica recusou todas as peças — ${motivoCurto}`,
    });
    await notificarTecnico(g.tecnico_nome, {
      titulo: `Garantia ${g.numero} não foi paga`,
      descricao: `A fábrica recusou as peças da OS ${g.id_ordem}. Motivo: ${motivoCurto}`,
    });
    await notificarGarantistas({
      titulo: `Garantia ${g.numero} finalizada (recusada)`,
      descricao: `Fábrica recusou as peças — OS ${g.id_ordem}`,
      link: `/garantias?id=${id}`,
    });
    return NextResponse.json({ garantia: data });
  }

  // ── Alguma peça aprovada → registra resultado por peça e aguarda o serviço ─
  if (aprovadasIdsList.length > 0) {
    await supabase.from(TBL_GAR_PECAS).update({ resultado: 'aprovada' }).in('id', aprovadasIdsList);
  }
  if (rejeitadasIdsList.length > 0) {
    await supabase.from(TBL_GAR_PECAS).update({ resultado: 'rejeitada' }).in('id', rejeitadasIdsList);
  }

  // Valor pago das peças: o garantista pode sobrepor; default = soma das aprovadas
  let vp = Number(body.valor_pago_pecas);
  if (!Number.isFinite(vp) || vp < 0) {
    vp = 0;
    for (const p of todasPecas) {
      if (idsAprovados.has(p.id)) {
        vp += (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
      }
    }
  }

  const update: Record<string, unknown> = {
    status: 'aguardando_servico',
    pecas_retorno_em: agora,
    valor_pago_pecas: vp,
    updated_at: agora,
  };
  if (body.garantista_nome) update.garantista_nome = body.garantista_nome;

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao registrar retorno das peças:', error.message);
    return NextResponse.json({ error: 'Falha ao registrar o retorno das peças.' }, { status: 500 });
  }

  const fmtValor = vp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  await registrarEvento(id, {
    tipo: 'retorno_pecas',
    statusAnterior: 'enviada',
    statusNovo: 'aguardando_servico',
    ator,
    detalhe: `${aprovadasIdsList.length} de ${todasPecas.length} peça(s) aprovada(s) pela fábrica — ${fmtValor}`,
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo: `Garantia ${g.numero}: peças aprovadas pela fábrica`,
    descricao: `Pode agendar e executar o serviço da OS ${g.id_ordem}. Depois o garantista solicita o ressarcimento das horas e km.`,
  });
  await notificarGarantistas({
    titulo: `Peças da garantia ${g.numero} aprovadas — aguardando serviço`,
    descricao: `OS ${g.id_ordem} · ${fmtValor}`,
    link: `/garantias?id=${id}`,
  });

  return NextResponse.json({ garantia: data });
}
