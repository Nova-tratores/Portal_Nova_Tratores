import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ciclo de pedido de compra. GET lista os pedidos abertos (com agregados);
// POST cria um pedido a partir das sugestões selecionadas. conta_omie minúsculo.
const ABERTOS = ['rascunho', 'enviado', 'recebido_parcial'];

function contaLower(v: unknown): 'nova' | 'castro' | null {
  const s = String(v || '').toLowerCase();
  return s === 'nova' || s === 'castro' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const conta = contaLower(req.nextUrl.searchParams.get('conta'));
  try {
    let q = supabase.from('pedido_compra').select('*').in('status', ABERTOS).order('data_pedido', { ascending: false });
    if (conta) q = q.eq('conta_omie', conta);
    const { data: pedidos, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    if (!pedidos || pedidos.length === 0) return NextResponse.json({ pedidos: [] });

    const ids = pedidos.map((p) => p.id);
    const { data: itens } = await supabase.from('pedido_compra_item')
      .select('pedido_id, qtd_pedida, qtd_recebida').in('pedido_id', ids);
    const agg = new Map<number, { n: number; pedida: number; recebida: number }>();
    for (const it of itens ?? []) {
      const a = agg.get(Number(it.pedido_id)) ?? { n: 0, pedida: 0, recebida: 0 };
      a.n++; a.pedida += Number(it.qtd_pedida) || 0; a.recebida += Number(it.qtd_recebida) || 0;
      agg.set(Number(it.pedido_id), a);
    }
    const codForns = [...new Set(pedidos.map((p) => p.codigo_fornecedor).filter((x) => x != null))] as number[];
    const nomes = new Map<number, string>();
    if (codForns.length) {
      const { data: fs } = await supabase.from('Fornecedores').select('id, nome').in('id', codForns);
      for (const f of fs ?? []) nomes.set(Number(f.id), f.nome);
    }
    const hoje = Date.now();
    const lista = pedidos.map((p) => {
      const a = agg.get(Number(p.id)) ?? { n: 0, pedida: 0, recebida: 0 };
      const diasAberto = p.data_pedido ? Math.floor((hoje - new Date(p.data_pedido).getTime()) / 864e5) : 0;
      return {
        id: p.id, conta_omie: p.conta_omie, status: p.status, data_pedido: p.data_pedido,
        codigo_fornecedor: p.codigo_fornecedor, fornecedor: p.codigo_fornecedor != null ? (nomes.get(Number(p.codigo_fornecedor)) ?? `#${p.codigo_fornecedor}`) : 'Não definido',
        observacao: p.observacao, n_itens: a.n, qtd_pedida: a.pedida, qtd_recebida: a.recebida, dias_aberto: diasAberto,
      };
    });
    return NextResponse.json({ pedidos: lista });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user: { id: string; nome?: string };
  try {
    user = await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  try {
    const b = (await req.json().catch(() => ({}))) as {
      conta?: string; codigo_fornecedor?: number | null; snapshot_id?: string; observacao?: string;
      itens?: Array<{ codigo_produto?: number; qtd_sugerida?: number; qtd_pedida?: number; preco_estimado?: number }>;
    };
    const conta = contaLower(b.conta);
    if (!conta) return NextResponse.json({ erro: 'conta obrigatória (nova|castro)' }, { status: 400 });
    const itens = (b.itens || []).filter((i) => Number.isFinite(Number(i.codigo_produto)) && Number(i.qtd_pedida) > 0);
    if (itens.length === 0) return NextResponse.json({ erro: 'nenhum item válido para o pedido' }, { status: 400 });

    const { data: ped, error: e1 } = await supabase.from('pedido_compra').insert({
      conta_omie: conta,
      codigo_fornecedor: b.codigo_fornecedor != null ? Number(b.codigo_fornecedor) : null,
      data_pedido: new Date().toISOString().slice(0, 10),
      status: 'enviado',
      snapshot_id: b.snapshot_id || null,
      observacao: b.observacao || null,
      criado_por: user.id,
    }).select('id').single();
    if (e1 || !ped) return NextResponse.json({ erro: e1?.message || 'falha ao criar pedido' }, { status: 500 });

    const linhas = itens.map((i) => ({
      pedido_id: ped.id,
      codigo_produto: Number(i.codigo_produto),
      qtd_sugerida: Number(i.qtd_sugerida) || 0,
      qtd_pedida: Number(i.qtd_pedida) || 0,
      preco_estimado: Number(i.preco_estimado) || 0,
      status_linha: 'aberta',
    }));
    const { error: e2 } = await supabase.from('pedido_compra_item').insert(linhas);
    if (e2) return NextResponse.json({ erro: e2.message }, { status: 500 });

    supabase.from('audit_log').insert({
      user_id: user.id, user_nome: user.nome || '—', sistema: 'Sugestão de Compra',
      acao: 'criar', entidade: 'pedido_compra', entidade_id: String(ped.id),
      detalhes: { conta, codigo_fornecedor: b.codigo_fornecedor ?? null, itens: linhas.length },
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, id: ped.id, itens: linhas.length });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
