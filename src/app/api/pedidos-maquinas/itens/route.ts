// Itens (máquinas e implementos) do Pedido de Máquinas.
// GET    ?q=&empresa=        -> busca no cadastro `produtos` (sem Peças), com estoque/preço
// POST   {pedido_id, item}   -> inclui
// PATCH  {id, qtde?, preco?, desconto?, chassi?} -> altera
// DELETE ?id=                -> tira
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import {
  guardar, autor, respostaErro, lerPedido, exigirEditavel, recalcularTotal, log, T, ErroPedido,
} from '@/lib/pedidos-maquinas/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = 'codigo, codigo_produto, descricao, marca, modelo, familia_nome, estoque, valor_unitario, conta_omie';
const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60);
    const conta = /castro/i.test(url.searchParams.get('empresa') || '') ? 'castro' : 'nova';
    let qb = supabaseAdmin.from('produtos').select(COLS)
      .eq('inativo', false).eq('conta_omie', conta)
      .not('familia_nome', 'ilike', '*peça*').not('familia_nome', 'ilike', '*peca*')
      .order('estoque', { ascending: false }).limit(40);
    qb = q
      ? qb.or(`codigo.ilike.*${q}*,descricao.ilike.*${q}*,modelo.ilike.*${q}*,marca.ilike.*${q}*`)
      : qb.ilike('familia_nome', '*novo*').gt('estoque', 0);
    const { data, error } = await qb;
    if (error) throw error;
    return Response.json({ produtos: data || [] });
  } catch (e) {
    return respostaErro(e, 'itens GET');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    const p = await lerPedido(b.pedido_id);
    exigirEditavel(p);
    const it = b.item || {};
    if (!it.codigo || !it.descricao) throw new ErroPedido(400, 'Escolha o produto.');
    const { error } = await supabaseAdmin.from(T.itens).insert({
      pedido_id: p.id, codigo: String(it.codigo), codigo_produto: it.codigo_produto ? Number(it.codigo_produto) : null,
      descricao: String(it.descricao).slice(0, 300), familia: it.familia || null, marca: it.marca || null, modelo: it.modelo || null,
      chassi: it.chassi ? String(it.chassi).trim().toUpperCase().slice(0, 40) : null,
      qtde: Number(it.qtde) > 0 ? Number(it.qtde) : 1, preco: num(it.preco), desconto: num(it.desconto),
    });
    if (error) throw error;
    const total = await recalcularTotal(p.id);
    await log(p.id, `Item incluído: ${it.descricao}`, autor(g.user));
    return Response.json({ ok: true, total });
  } catch (e) {
    return respostaErro(e, 'itens POST');
  }
}

async function itemDoPedido(id: number) {
  const { data, error } = await supabaseAdmin.from(T.itens).select('id, pedido_id, descricao').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroPedido(404, 'Item não encontrado.');
  return data as { id: number; pedido_id: number; descricao: string };
}

export async function PATCH(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    const it = await itemDoPedido(Number(b.id));
    const p = await lerPedido(it.pedido_id);
    exigirEditavel(p);
    const patch: Record<string, unknown> = {};
    if (b.qtde !== undefined) patch.qtde = Number(b.qtde) > 0 ? Number(b.qtde) : 1;
    if (b.preco !== undefined) patch.preco = num(b.preco);
    if (b.desconto !== undefined) patch.desconto = num(b.desconto);
    if (b.chassi !== undefined) patch.chassi = b.chassi ? String(b.chassi).trim().toUpperCase().slice(0, 40) : null;
    const { error } = await supabaseAdmin.from(T.itens).update(patch).eq('id', it.id);
    if (error) throw error;
    const total = await recalcularTotal(p.id);
    await log(p.id, `Item alterado: ${it.descricao}`, autor(g.user), patch);
    return Response.json({ ok: true, total });
  } catch (e) {
    return respostaErro(e, 'itens PATCH');
  }
}

export async function DELETE(req: Request) {
  const g = await guardar(req, 'editar');
  if (g.resposta) return g.resposta;
  try {
    const it = await itemDoPedido(Number(new URL(req.url).searchParams.get('id')));
    const p = await lerPedido(it.pedido_id);
    exigirEditavel(p);
    const { error } = await supabaseAdmin.from(T.itens).delete().eq('id', it.id);
    if (error) throw error;
    const total = await recalcularTotal(p.id);
    await log(p.id, `Item retirado: ${it.descricao}`, autor(g.user));
    return Response.json({ ok: true, total });
  } catch (e) {
    return respostaErro(e, 'itens DELETE');
  }
}
