import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_EVENTOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarGarantistas } from '@/lib/garantias/server';
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server';
import { detalheCancelamento, statusAoDesfazer, ultimoCancelamento, validarCancelamento } from '@/lib/garantias/cancelamento';

// POST /api/garantias/[id]/cancelar
//   { motivo: 'teste'|'engano'|'outro', obs }  → cancela (qualquer status, até aprovada)
//   { acao: 'desfazer' }                        → volta ao status de antes
// Cancelada sai do quadro, do relatório e dos totais. Duplicação continua em
// /cancelar-duplicada (aponta a original e não se desfaz pela tela).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await protegerRota(req, [{ modulo: 'garantias', acao: 'finalizar' }]);
  if (guarda.resposta) return guarda.resposta;
  const ator = autorDe(guarda.user);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, duplicada_de')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  const agora = new Date().toISOString();

  if (body.acao === 'desfazer') {
    if (g.status !== 'cancelada') return NextResponse.json({ error: 'Esta garantia não está cancelada.' }, { status: 409 });
    if (g.duplicada_de) return NextResponse.json({ error: 'Cancelada por duplicação não se desfaz pela tela.' }, { status: 409 });
    const { data: evs } = await supabase.from(TBL_GAR_EVENTOS)
      .select('tipo, detalhe, status_anterior, created_at').eq('garantia_id', id).eq('tipo', 'cancelada');
    const ev = ultimoCancelamento(evs || []);
    const volta = statusAoDesfazer(ev?.status_anterior);
    const { error } = await supabase.from(TBL_GARANTIAS)
      .update({ status: volta, cancelada_em: null, updated_at: agora }).eq('id', id).eq('status', 'cancelada');
    if (error) return NextResponse.json({ error: `Falha ao desfazer: ${error.message}` }, { status: 500 });
    await registrarEvento(id, { tipo: 'cancelamento_desfeito', statusAnterior: 'cancelada', statusNovo: volta, ator, detalhe: 'Cancelamento desfeito' });
    return NextResponse.json({ ok: true, status: volta });
  }

  if (g.status === 'cancelada') return NextResponse.json({ error: 'Garantia já está cancelada.' }, { status: 409 });
  const v = validarCancelamento(body.motivo, body.obs);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const detalhe = detalheCancelamento(v.motivo, v.obs);

  const { error } = await supabase.from(TBL_GARANTIAS)
    .update({ status: 'cancelada', cancelada_em: agora, updated_at: agora }).eq('id', id).eq('status', g.status);
  if (error) return NextResponse.json({ error: `Falha ao cancelar: ${error.message}` }, { status: 500 });

  await registrarEvento(id, { tipo: 'cancelada', statusAnterior: g.status, statusNovo: 'cancelada', ator, detalhe });
  await notificarGarantistas({
    titulo: `Garantia ${g.numero} cancelada`,
    descricao: `${detalhe} (OS ${g.id_ordem}) — por ${ator}.`,
    link: `/garantias?id=${id}`,
  });
  return NextResponse.json({ ok: true });
}
