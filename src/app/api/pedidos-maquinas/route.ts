// Pedidos de Máquinas — lista (kanban/relação), um pedido, criar e editar.
// GET  ?id=PVM-0001|<id>  -> pedido completo (itens, parcelas, logs, proposta)
// GET                     -> lista (com nº de itens/parcelas e o vendedor)
// POST {proposta_id?}     -> cria (com proposta: já importa cliente/vendedor/parcelas)
// PATCH {id, ...campos, status?} -> edita / move de fase
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import {
  guardar, autor, respostaErro, lerCompleto, lerPedido, log, exigirEditavel, T,
  CAMPOS_EDITAVEIS, ErroPedido,
} from '@/lib/pedidos-maquinas/server';
import { podeMoverPara, faseInfo, CONTA_PADRAO } from '@/lib/pedidos-maquinas/regras';
import { importarPropostaNoPedido } from '@/lib/pedidos-maquinas/importar-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guardar(req);
  if (g.resposta) return g.resposta;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) return Response.json(await lerCompleto(id));

    const { data, error } = await supabaseAdmin.from(T.pedidos)
      .select('id, id_pedido, status, status_desde, empresa, cliente, cliente_documento, vendedor_id, proposta_id, valor_total, previsao_faturamento, pedido_omie, nf_numero, faturado_omie_em, criado_em, criado_por')
      .order('criado_em', { ascending: false }).limit(2000);
    if (error) throw error;
    const ids = (data || []).map((p) => p.id);
    const [itens, vends] = await Promise.all([
      ids.length ? supabaseAdmin.from(T.itens).select('pedido_id, descricao, modelo, chassi').in('pedido_id', ids) : Promise.resolve({ data: [] }),
      supabaseAdmin.from('vendedores').select('id, nome'),
    ]);
    const nomeVend = new Map((vends.data || []).map((v: { id: number; nome: string }) => [v.id, v.nome]));
    const itensPor = new Map<number, { descricao: string; modelo: string | null; chassi: string | null }[]>();
    for (const i of (itens.data || []) as { pedido_id: number; descricao: string; modelo: string | null; chassi: string | null }[]) {
      itensPor.set(i.pedido_id, [...(itensPor.get(i.pedido_id) || []), i]);
    }
    return Response.json({
      pedidos: (data || []).map((p) => ({
        ...p,
        valor_total: Number(p.valor_total),
        vendedor_nome: p.vendedor_id ? nomeVend.get(p.vendedor_id) || null : null,
        maquinas: (itensPor.get(p.id) || []).map((i) => i.modelo || i.descricao).slice(0, 4),
        chassis: (itensPor.get(p.id) || []).map((i) => i.chassi).filter(Boolean),
      })),
    });
  } catch (e) {
    return respostaErro(e, 'GET');
  }
}

export async function POST(req: Request) {
  const g = await guardar(req, 'criar');
  if (g.resposta) return g.resposta;
  try {
    const b = await req.json().catch(() => ({}));
    const quem = autor(g.user);
    const { data, error } = await supabaseAdmin.from(T.pedidos).insert({
      criado_por: quem,
      cliente: b.cliente ? String(b.cliente).slice(0, 200) : null,
      cliente_documento: b.cliente_documento ? String(b.cliente_documento).replace(/\D/g, '') : null,
      vendedor_id: b.vendedor_id ? Number(b.vendedor_id) : null,
      empresa: b.empresa === 'Castro Peças' ? 'Castro Peças' : 'Nova Tratores',
      conta_corrente: CONTA_PADRAO, // Bradesco
      consumo_final: true,
    }).select('id, id_pedido').single();
    if (error) throw error;
    await log(data.id, 'Pedido criado', quem);
    let importacao = null;
    if (b.proposta_id) {
      importacao = await importarPropostaNoPedido(data.id, Number(b.proposta_id), { cliente: true, itens: true, parcelas: true }, quem);
    }
    return Response.json({ ok: true, id: data.id, id_pedido: data.id_pedido, importacao });
  } catch (e) {
    return respostaErro(e, 'POST');
  }
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const moverFase = b.status !== undefined && Object.keys(b).every((k) => k === 'id' || k === 'status');
  const g = await guardar(req, moverFase ? 'mover_fase' : 'editar');
  if (g.resposta) return g.resposta;
  try {
    const p = await lerPedido(b.id);
    const quem = autor(g.user);

    if (moverFase) {
      const erro = podeMoverPara(p.status, String(b.status), { enviado: !!p.pedido_omie });
      if (erro) throw new ErroPedido(409, erro);
      const { error } = await supabaseAdmin.from(T.pedidos).update({ status: b.status }).eq('id', p.id);
      if (error) throw error;
      await log(p.id, `Fase: ${faseInfo(p.status).rotulo} → ${faseInfo(b.status).rotulo}`, quem);
      return Response.json({ ok: true });
    }

    // Depois de enviado só dá para mexer no que não vai à Omie
    const soInterno = ['observacao', 'previsao_faturamento'];
    const campos = CAMPOS_EDITAVEIS.filter((k) => b[k] !== undefined);
    if (campos.some((k) => !soInterno.includes(k))) exigirEditavel(p);
    else if (p.status === 'cancelado') throw new ErroPedido(409, 'Pedido cancelado.');

    const patch: Record<string, unknown> = {};
    const mudou: Record<string, { de: unknown; para: unknown }> = {};
    for (const k of campos) {
      let v = b[k];
      if (k === 'vendedor_id') v = v ? Number(v) : null;
      else if (k === 'consumo_final') v = !!v;
      else if (k === 'departamentos') v = Array.isArray(v) ? v.slice(0, 20).map((d: { codigo: unknown; perc: unknown }) => ({ codigo: String(d.codigo), perc: Number(d.perc) || 0 })) : [];
      else if (k === 'cliente_documento') { v = v ? String(v).replace(/\D/g, '') : null; patch.cliente_cod_omie = null; }
      else if (k === 'empresa') v = v === 'Castro Peças' ? 'Castro Peças' : 'Nova Tratores';
      else if (k === 'previsao_faturamento') v = /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
      else v = v === '' || v == null ? null : String(v).slice(0, 2000);
      patch[k] = v;
      const antes = (p as unknown as Record<string, unknown>)[k];
      if (JSON.stringify(antes ?? null) !== JSON.stringify(v ?? null)) mudou[k] = { de: antes, para: v };
    }
    if (!Object.keys(mudou).length) return Response.json({ ok: true, semMudanca: true });
    const { error } = await supabaseAdmin.from(T.pedidos).update(patch).eq('id', p.id);
    if (error) throw error;
    await log(p.id, `Alterado: ${Object.keys(mudou).join(', ')}`, quem, mudou);
    return Response.json({ ok: true });
  } catch (e) {
    return respostaErro(e, 'PATCH');
  }
}
