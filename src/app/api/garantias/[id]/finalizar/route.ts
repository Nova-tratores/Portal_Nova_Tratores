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

  if (g.status !== 'enviada') {
    return NextResponse.json(
      { error: 'Só é possível finalizar uma garantia que está na fábrica.' },
      { status: 400 }
    );
  }
  if (!g.retorno_fabrica_url) {
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
  };
  if (body.garantista_nome) update.garantista_nome = body.garantista_nome;

  // Valores pagos só na aprovação. Total = horas + km + peças aprovadas.
  if (resultado === 'aprovada') {
    const vh = (gHoras ?? 0) * VALOR_HORA;
    const vk = (gKm ?? 0) * VALOR_KM;
    let vp = 0;
    for (const p of todasPecas) {
      if (idsAprovados.has(p.id)) {
        vp += (Number(p.preco_unitario) || 0) * (Number(p.quantidade) || 0);
      }
    }
    update.valor_pago_horas = vh;
    update.valor_pago_km = vk;
    update.valor_pago_pecas = vp;
    update.valor_pago_total = vh + vk + vp;
  } else {
    update.valor_pago_horas = 0;
    update.valor_pago_km = 0;
    update.valor_pago_pecas = 0;
    update.valor_pago_total = 0;
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

  await registrarEvento(id, {
    tipo: resultado,
    statusAnterior: 'enviada',
    statusNovo: resultado,
    ator: body.garantista_nome || 'Garantista',
    detalhe:
      resultado === 'aprovada'
        ? `Garantia aprovada — pago em garantia`
        : `Garantia recusada — ${String(body.motivo_recusa || '').slice(0, 140)}`,
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo:
      resultado === 'aprovada'
        ? `Garantia ${g.numero} aprovada`
        : `Garantia ${g.numero} não foi paga`,
    descricao:
      resultado === 'aprovada'
        ? `A OS ${g.id_ordem} foi paga em garantia.`
        : `A garantia da OS ${g.id_ordem} foi recusada pela fábrica.`,
  });
  await notificarGarantistas({
    titulo: `Garantia ${g.numero} finalizada (${resultado === 'aprovada' ? 'aprovada' : 'recusada'})`,
    descricao: `OS ${g.id_ordem}`,
    link: `/garantias?id=${id}`,
  });

  return NextResponse.json({ garantia: data });
}
