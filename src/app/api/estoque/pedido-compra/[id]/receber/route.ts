import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Fatia 9: recebimento MANUAL de um pedido. Cria os vínculos (que alimentam
// vw_lead_time_realizado) e atualiza qtd_recebida + status. id_receb é opcional.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { id: string; nome?: string };
  try {
    user = await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const { id } = await params;
  const pedidoId = Number(id);
  try {
    const b = (await req.json().catch(() => ({}))) as {
      itens?: Array<{ pedido_item_id?: number; qtd_vinculada?: number; data_entrada_estoque?: string; id_receb?: number | null }>;
    };
    const recebimentos = (b.itens || []).filter((i) => Number(i.pedido_item_id) > 0 && Number(i.qtd_vinculada) > 0);
    if (recebimentos.length === 0) return NextResponse.json({ erro: 'nenhum item recebido informado' }, { status: 400 });

    const { data: ped } = await supabase.from('pedido_compra').select('id, conta_omie, status').eq('id', pedidoId).maybeSingle();
    if (!ped) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 });
    const { data: itens } = await supabase.from('pedido_compra_item')
      .select('id, codigo_produto, qtd_pedida, qtd_recebida, status_linha').eq('pedido_id', pedidoId);
    const porId = new Map((itens ?? []).map((it) => [Number(it.id), it]));

    const hojeISO = new Date().toISOString().slice(0, 10);
    const vinculos: Record<string, unknown>[] = [];
    for (const r of recebimentos) {
      const it = porId.get(Number(r.pedido_item_id));
      if (!it) continue;
      const q = Number(r.qtd_vinculada);
      vinculos.push({
        conta_omie: ped.conta_omie, id_receb: r.id_receb != null ? Number(r.id_receb) : null,
        codigo_produto: it.codigo_produto, pedido_item_id: it.id, qtd_vinculada: q,
        data_entrada_estoque: r.data_entrada_estoque || hojeISO, vinculado_por: user.id,
      });
      // atualiza a linha do item
      const novaRecebida = (Number(it.qtd_recebida) || 0) + q;
      const status = novaRecebida >= Number(it.qtd_pedida) ? 'atendida' : 'parcial';
      await supabase.from('pedido_compra_item').update({ qtd_recebida: novaRecebida, status_linha: status }).eq('id', it.id);
      it.qtd_recebida = novaRecebida; it.status_linha = status;
    }
    if (vinculos.length === 0) return NextResponse.json({ erro: 'itens não pertencem a este pedido' }, { status: 400 });
    const { error: eV } = await supabase.from('pedido_recebimento_vinculo').insert(vinculos);
    if (eV) return NextResponse.json({ erro: eV.message }, { status: 500 });

    // status do pedido: concluído se toda linha atendida, senão recebido_parcial
    const todas = (itens ?? []).every((it) => it.status_linha === 'atendida' || it.status_linha === 'nao_atendida');
    const novoStatus = todas ? 'concluido' : 'recebido_parcial';
    await supabase.from('pedido_compra').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', pedidoId);

    supabase.from('audit_log').insert({
      user_id: user.id, user_nome: user.nome || '—', sistema: 'Sugestão de Compra',
      acao: 'editar', entidade: 'pedido_compra', entidade_id: String(pedidoId),
      detalhes: { recebeu: vinculos.length, status: novoStatus },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, recebidos: vinculos.length, status: novoStatus });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
