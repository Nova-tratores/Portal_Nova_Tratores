import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PEND, TBL_GAR_PECAS, VALOR_HORA, VALOR_KM } from '@/lib/garantias/constants';
import { registrarEvento, notificarTecnico, notificarGarantistas } from '@/lib/garantias/server';

// POST /api/garantias/[id]/finalizar
// body: { resultado:'aprovada'|'rejeitada', motivo_recusa?, garantista_horas, garantista_km, garantista_obs?, garantista_nome? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const resultado = body.resultado === 'aprovada' ? 'aprovada' : body.resultado === 'rejeitada' ? 'rejeitada' : null;
  if (!resultado) {
    return NextResponse.json({ error: 'Informe se a garantia foi aprovada ou recusada.' }, { status: 400 });
  }

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, tecnico_nome, retorno_fabrica_url, tecnico_horas, tecnico_km')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Recusa interna do garantista: aceita finalizar em 'em_analise' (e
  // 'bo_tecnico' quando o garantista decide encerrar mesmo com B.O. pendente).
  // Aprovar continua exigindo que tenha passado pela fábrica (status='enviada').
  const recusaInterna = resultado === 'rejeitada' && body.recusa_garantista === true;
  if (recusaInterna) {
    if (g.status !== 'em_analise' && g.status !== 'bo_tecnico') {
      return NextResponse.json(
        { error: 'A recusa interna só vale antes de enviar à fábrica.' },
        { status: 400 }
      );
    }
  } else if (g.status !== 'enviada') {
    return NextResponse.json(
      { error: 'Só é possível finalizar uma garantia que está na fábrica.' },
      { status: 400 }
    );
  }
  // Retorno da fábrica só é exigido quando a recusa vem da fábrica.
  if (!recusaInterna && !g.retorno_fabrica_url) {
    return NextResponse.json(
      { error: 'Anexe o arquivo de retorno da fábrica antes de finalizar a garantia.' },
      { status: 400 }
    );
  }
  if (resultado === 'rejeitada' && !String(body.motivo_recusa || '').trim()) {
    return NextResponse.json({ error: 'Informe o motivo da recusa.' }, { status: 400 });
  }

  // Não finalizar com pendência aberta
  const { data: pendAberta } = await supabase
    .from(TBL_GAR_PEND)
    .select('id')
    .eq('garantia_id', id)
    .eq('status', 'aberta')
    .limit(1);
  if (pendAberta && pendAberta.length > 0) {
    return NextResponse.json(
      { error: 'Resolva a pendência aberta antes de finalizar.' },
      { status: 400 }
    );
  }

  const gHoras = body.garantista_horas === '' || body.garantista_horas == null ? null : Number(body.garantista_horas);
  const gKm = body.garantista_km === '' || body.garantista_km == null ? null : Number(body.garantista_km);

  // Peças aprovadas: array de IDs de garantia_pecas marcados como pagos pela fábrica.
  // Se não vier `pecas_aprovadas`, considera todas como aprovadas (compat).
  const pecasAprovadasIds: string[] = Array.isArray(body.pecas_aprovadas) ? body.pecas_aprovadas : [];
  const { data: pecasGarantia } = await supabase
    .from(TBL_GAR_PECAS)
    .select('id, descricao, quantidade, preco_unitario')
    .eq('garantia_id', id);
  const todasPecas = (pecasGarantia || []) as { id: string; descricao: string; quantidade: number; preco_unitario: number }[];
  const idsAprovados = body.pecas_aprovadas === undefined
    ? new Set(todasPecas.map((p) => p.id))
    : new Set(pecasAprovadasIds);

  const update: Record<string, unknown> = {
    status: resultado,
    resultado,
    finalizada_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    garantista_horas: gHoras,
    garantista_km: gKm,
    garantista_obs: body.garantista_obs || null,
    motivo_recusa: resultado === 'rejeitada' ? String(body.motivo_recusa).trim() : null,
    recusado_por: resultado === 'rejeitada' ? (recusaInterna ? 'garantista' : 'fabrica') : null,
  };
  if (body.garantista_nome) update.garantista_nome = body.garantista_nome;

  // M.O. e deslocamento são aprováveis igual às peças: a garantia pode pagar só
  // um, os dois ou nenhum. Default (sem flag) = paga, pra manter compatibilidade.
  const moAprovada = body.mo_aprovada !== false;
  const deslocAprovado = body.desloc_aprovado !== false;

  // Valores pagos só na aprovação. Total = (M.O. se paga) + (desloc se pago) +
  // peças aprovadas. O que a garantia NÃO paga pré-preenche a cobrança ao cliente.
  if (resultado === 'aprovada') {
    const vh = (gHoras ?? 0) * VALOR_HORA;
    const vk = (gKm ?? 0) * VALOR_KM;
    const vhPago = moAprovada ? vh : 0;
    const vkPago = deslocAprovado ? vk : 0;
    let vp = 0;
    for (const p of todasPecas) {
      if (idsAprovados.has(p.id)) {
        vp += (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
      }
    }
    update.valor_pago_horas = vhPago;
    update.valor_pago_km = vkPago;
    update.valor_pago_pecas = vp;
    update.valor_pago_total = vhPago + vkPago + vp;

    // Itens não pagos pela garantia → abre a cobrança ao cliente já pré-marcada.
    const unpaidHoras = !moAprovada && vh > 0;
    const unpaidKm = !deslocAprovado && vk > 0;
    const unpaidPecas = todasPecas.filter((p) => !idsAprovados.has(p.id)).map((p) => p.id);
    if (unpaidHoras || unpaidKm || unpaidPecas.length > 0) {
      update.cobranca_status = 'pendente';
      update.cobranca_itens = { horas: unpaidHoras, km: unpaidKm, pecas: unpaidPecas };
    } else {
      update.cobranca_status = 'nao_aplicavel';
    }
  } else {
    update.valor_pago_horas = 0;
    update.valor_pago_km = 0;
    update.valor_pago_pecas = 0;
    update.valor_pago_total = 0;
    // Rejeitada → libera o fluxo de cobrança ao cliente
    update.cobranca_status = 'pendente';
  }

  // Atualiza o resultado de cada peça
  if (todasPecas.length > 0) {
    const aprovadasIdsList = todasPecas.filter((p) => idsAprovados.has(p.id)).map((p) => p.id);
    const rejeitadasIdsList = todasPecas.filter((p) => !idsAprovados.has(p.id)).map((p) => p.id);
    if (resultado === 'aprovada') {
      if (aprovadasIdsList.length > 0) {
        await supabase.from(TBL_GAR_PECAS).update({ resultado: 'aprovada' }).in('id', aprovadasIdsList);
      }
      if (rejeitadasIdsList.length > 0) {
        await supabase.from(TBL_GAR_PECAS).update({ resultado: 'rejeitada' }).in('id', rejeitadasIdsList);
      }
    } else {
      // Recusada: todas as peças ficam como rejeitadas
      await supabase
        .from(TBL_GAR_PECAS)
        .update({ resultado: 'rejeitada' })
        .eq('garantia_id', id);
    }
  }

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao finalizar garantia:', error.message);
    return NextResponse.json({ error: 'Falha ao finalizar garantia.' }, { status: 500 });
  }

  const motivoCurto = String(body.motivo_recusa || '').slice(0, 140);
  await registrarEvento(id, {
    tipo: recusaInterna ? 'recusada_garantista' : resultado,
    statusAnterior: g.status,
    statusNovo: resultado,
    ator: body.garantista_nome || 'Garantista',
    detalhe:
      resultado === 'aprovada'
        ? `Garantia aprovada — pago em garantia`
        : recusaInterna
          ? `Garantia recusada pelo garantista (sem enviar à fábrica) — ${motivoCurto}`
          : `Garantia recusada pela fábrica — ${motivoCurto}`,
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo:
      resultado === 'aprovada'
        ? `Garantia ${g.numero} aprovada`
        : `Garantia ${g.numero} não foi paga`,
    descricao:
      resultado === 'aprovada'
        ? `A OS ${g.id_ordem} foi paga em garantia.`
        : recusaInterna
          ? `O garantista entendeu que a OS ${g.id_ordem} não cabe garantia. Motivo: ${motivoCurto}`
          : `A garantia da OS ${g.id_ordem} foi recusada pela fábrica.`,
  });
  await notificarGarantistas({
    titulo: `Garantia ${g.numero} finalizada (${resultado === 'aprovada' ? 'aprovada' : 'recusada'})`,
    descricao: `OS ${g.id_ordem}`,
    link: `/garantias?id=${id}`,
  });

  return NextResponse.json({ garantia: data });
}
