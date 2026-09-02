import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Adiciona itens a um pedido de compra ABERTO. Se o produto já está no pedido,
// soma a quantidade (merge); senão insere uma linha nova.
const ABERTOS = ['rascunho', 'enviado', 'recebido_parcial'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { id: string; nome?: string };
  try {
    user = await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const pedidoId = Number((await params).id);
  try {
    const b = (await req.json().catch(() => ({}))) as {
      itens?: Array<{ codigo_produto?: number; qtd_sugerida?: number; qtd_pedida?: number; preco_estimado?: number }>;
    };
    const novos = (b.itens || []).filter((i) => Number.isFinite(Number(i.codigo_produto)) && Number(i.qtd_pedida) > 0);
    if (novos.length === 0) return NextResponse.json({ erro: 'nenhum item válido' }, { status: 400 });

    const { data: ped } = await supabase.from('pedido_compra').select('id, status').eq('id', pedidoId).maybeSingle();
    if (!ped) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 });
    if (!ABERTOS.includes(ped.status)) return NextResponse.json({ erro: 'pedido não está aberto' }, { status: 400 });

    const { data: existentes } = await supabase.from('pedido_compra_item')
      .select('id, codigo_produto, qtd_pedida').eq('pedido_id', pedidoId);
    const porCp = new Map((existentes ?? []).map((it) => [Number(it.codigo_produto), it]));

    let mesclados = 0; const inserir: Record<string, unknown>[] = [];
    for (const i of novos) {
      const cp = Number(i.codigo_produto); const q = Number(i.qtd_pedida);
      const ja = porCp.get(cp);
      if (ja) {
        await supabase.from('pedido_compra_item').update({ qtd_pedida: (Number(ja.qtd_pedida) || 0) + q }).eq('id', ja.id);
        mesclados++;
      } else {
        inserir.push({ pedido_id: pedidoId, codigo_produto: cp, qtd_sugerida: Number(i.qtd_sugerida) || 0, qtd_pedida: q, preco_estimado: Number(i.preco_estimado) || 0, status_linha: 'aberta' });
      }
    }
    if (inserir.length) {
      const { error } = await supabase.from('pedido_compra_item').insert(inserir);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    }
    supabase.from('audit_log').insert({
      user_id: user.id, user_nome: user.nome || '—', sistema: 'Sugestão de Compra',
      acao: 'editar', entidade: 'pedido_compra', entidade_id: String(pedidoId),
      detalhes: { adicionou: inserir.length, mesclou: mesclados },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, id: pedidoId, adicionados: inserir.length, mesclados });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
