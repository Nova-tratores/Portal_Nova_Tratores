import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PEND, TBL_GAR_ANEXOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';

// PATCH /api/garantias/[id]/pendencias/[pid] — técnico responde a pendência
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const { id, pid } = await params;
  const body = await req.json();

  const resposta = String(body.resposta_texto || '').trim();
  const anexoIds: string[] = Array.isArray(body.anexo_ids) ? body.anexo_ids : [];
  if (!resposta && anexoIds.length === 0) {
    return NextResponse.json(
      { error: 'Responda com um texto ou anexe ao menos uma imagem.' },
      { status: 400 }
    );
  }

  const { data: pend } = await supabase
    .from(TBL_GAR_PEND)
    .select('*')
    .eq('id', pid)
    .eq('garantia_id', id)
    .maybeSingle();
  if (!pend) return NextResponse.json({ error: 'Pendência não encontrada.' }, { status: 404 });
  if (pend.status !== 'aberta') {
    return NextResponse.json({ error: 'Esta pendência já foi respondida.' }, { status: 400 });
  }

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, garantista_nome')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Fecha a pendência
  const { error: errPend } = await supabase
    .from(TBL_GAR_PEND)
    .update({
      status: 'respondida',
      resposta_texto: resposta || null,
      respondido_por: body.respondido_por || null,
      respondido_em: new Date().toISOString(),
    })
    .eq('id', pid);
  if (errPend) {
    return NextResponse.json({ error: 'Falha ao salvar a resposta.' }, { status: 500 });
  }

  // Vincula os anexos da resposta
  if (anexoIds.length > 0) {
    await supabase
      .from(TBL_GAR_ANEXOS)
      .update({ pendencia_id: pid, categoria: 'pendencia_resposta' })
      .in('id', anexoIds);
  }

  // Volta a garantia ao fluxo: B.O. -> em_analise | info_fabrica -> enviada
  const novoStatus = pend.tipo === 'bo' ? 'em_analise' : 'enviada';
  await supabase
    .from(TBL_GARANTIAS)
    .update({ status: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  await registrarEvento(id, {
    tipo: pend.tipo === 'bo' ? 'bo_respondida' : 'info_respondida',
    statusAnterior: pend.tipo === 'bo' ? 'bo_tecnico' : 'info_pendente',
    statusNovo: novoStatus,
    ator: body.respondido_por || 'Técnico',
    detalhe: resposta || 'Resposta com anexos',
  });
  await notificarGarantistas({
    titulo: `Técnico respondeu — garantia ${g.numero}`,
    descricao: `${body.respondido_por || 'O técnico'} respondeu a pendência da OS ${g.id_ordem}.`,
    link: `/garantias?id=${id}`,
  });

  return NextResponse.json({ success: true, status: novoStatus });
}
