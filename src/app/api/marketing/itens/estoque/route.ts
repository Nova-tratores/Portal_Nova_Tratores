/* eslint-disable @typescript-eslint/no-explicit-any */
// Itens expostos ← estoque, e chassi → venda (24/11/2026, José: "não está ligado a um produto do estoque, não pede
// chassi como identificação" + "se conseguir pegar os chassis que foram levados e ligar a uma venda, já coloca").
//
// GET ?q=6075          → máquinas do estoque (produtos: 1 produto por máquina, `codigo` = CHASSI) com foto e preço
// GET ?chassis=A,B,C   → { vendas: { [chassi]: venda | null } }
//    1º pedidos_maquinas_itens.chassi (pedido do portal → cliente, valor, proposta)
//    2º nota faturada (vendas_itens, chassi tirado da descrição — lib/revisoes/vendidos-server.ts)
//    Compara pelo FINAL do chassi (7 caracteres), como o resto do portal: a nota às vezes corta o começo.
import { NextResponse } from 'next/server';
import { guardar, erroResposta } from '@/lib/marketing/rota';
import { db } from '@/lib/marketing/db';
import { modeloDaNota } from '@/lib/revisoes/vendidos';
import { tratoresVendidosRapido } from '@/lib/revisoes/vendidos-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fim = (c: unknown) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-7);

export async function GET(req: Request) {
  const g = await guardar(req, 'marketing');
  if (g.resposta) return g.resposta;
  try {
    const url = new URL(req.url);

    // ── busca no estoque ──
    const q = url.searchParams.get('q');
    if (q !== null) {
      const t = q.trim().replace(/[%,()*]/g, ' ').trim();
      let consulta = db.from('produtos')
        .select('codigo, codigo_produto, descricao, marca, modelo, familia_nome, estoque, valor_unitario, imagem_url, conta_omie')
        .eq('inativo', false)
        .not('familia_nome', 'ilike', '*peça*').not('familia_nome', 'ilike', '*peca*')
        .order('estoque', { ascending: false }).limit(30);
      // Com texto, acha também a que JÁ SAIU do estoque (feira de agosto: a máquina pode ter sido vendida depois).
      consulta = t
        ? consulta.or(`codigo.ilike.*${t}*,descricao.ilike.*${t}*,modelo.ilike.*${t}*,marca.ilike.*${t}*`)
        : consulta.ilike('familia_nome', '*novo*').gt('estoque', 0);
      const { data, error } = await consulta;
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return NextResponse.json({
        maquinas: (data ?? []).map((p: any) => ({
          chassi: p.codigo,
          codigo_produto: p.codigo_produto,
          modelo: [p.marca && !String(p.modelo || '').toUpperCase().includes(String(p.marca).toUpperCase()) ? p.marca : null, p.modelo].filter(Boolean).join(' ') || modeloDaNota(p.descricao),
          descricao: p.descricao,
          familia: p.familia_nome,
          tipo: /implement/i.test(String(p.familia_nome)) ? 'implemento' : /trator/i.test(String(p.familia_nome)) ? 'trator' : 'outro',
          valor: Number(p.valor_unitario) || null,
          foto: p.imagem_url || null,
          empresa: p.conta_omie,
          noEstoque: Number(p.estoque) > 0,
        })),
      });
    }

    // ── venda de cada chassi ──
    const lista = (url.searchParams.get('chassis') || '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 60);
    if (!lista.length) return NextResponse.json({ vendas: {} });
    const vendas: Record<string, any> = Object.fromEntries(lista.map((c) => [c, null]));
    const porFim = new Map(lista.filter((c) => fim(c).length >= 5).map((c) => [fim(c), c]));

    // 1) pedido de máquina do portal
    const filtro = [...porFim.keys()].map((f) => `chassi.ilike.*${f}`).join(',');
    if (filtro) {
      const { data: itens } = await db.from('pedidos_maquinas_itens').select('pedido_id, chassi, preco').or(filtro).limit(200);
      const ids = [...new Set((itens ?? []).map((i: any) => i.pedido_id))];
      if (ids.length) {
        const { data: peds } = await db.from('pedidos_maquinas').select('*').in('id', ids);
        const ped = new Map((peds ?? []).filter((p: any) => !/cancel/i.test(String(p.status))).map((p: any) => [p.id, p]));
        for (const i of itens ?? []) {
          const c = porFim.get(fim(i.chassi));
          const p = ped.get(i.pedido_id);
          if (!c || !p || vendas[c]) continue;
          vendas[c] = {
            origem: 'pedido', cliente: p.cliente || null, valor: Number(i.preco) || Number(p.valor_total) || null,
            data: String(p.faturado_omie_em || p.criado_em || p.created_at || '').slice(0, 10) || null,
            pedido: p.id_pedido || String(p.id), proposta_id: p.proposta_id ?? null, nota: p.nf_numero || null, status: p.status,
          };
        }
      }
    }

    // 2) nota faturada (só pros que faltaram)
    const faltam = lista.filter((c) => !vendas[c] && fim(c).length >= 5);
    if (faltam.length) {
      const ano = new Date().getFullYear() - 1;
      const vendidos = await tratoresVendidosRapido(`${ano}-01-01`, true).catch(() => []);
      for (const v of vendidos) {
        const c = faltam.find((x) => v.chassi && fim(v.chassi) === fim(x));
        if (!c || vendas[c]) continue;
        vendas[c] = {
          origem: 'nota', cliente: v.cliente?.nome || null, valor: v.valor || null, data: v.dataVenda || null,
          pedido: v.pedido || null, proposta_id: null, nota: v.nota?.numero || null, vendedor: v.vendedor || null,
        };
      }
    }
    return NextResponse.json({ vendas });
  } catch (e) {
    return erroResposta(e, 'GET /itens/estoque');
  }
}
