// Lógica de leitura de produto (vendas/compras/histórico) via Supabase.
// Portado de /api/buscar, /api/produto-detalhe e buscarHistoricoProduto (server.js).
// Toda função recebe `conta` EXPLICITAMENTE (ContaFiltro).

import { supabase, filtroConta } from './supabase';
import { consultarEstoqueNaData } from './omie';
import { fmtD, fmtP, parseDataBR, labelMesAno, sleep } from './utils';
import type { Conta, ContaFiltro } from './conta';
import type { VendaItem, CompraItem, VendasPeriodos, HistoricoPonto, CmcPonto } from './types';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

/** Soma de quantidade vendida do produto em 4 períodos (mês atual, mês ant., e mesmos a.a.). */
export async function buscarVendasPeriodos(id: number | string, conta: ContaFiltro): Promise<VendasPeriodos> {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const periodos = [
    { mes: m + 1, ano: y, key: 'v1' as const },
    { mes: m || 12, ano: m ? y : y - 1, key: 'v2' as const },
    { mes: m + 1, ano: y - 1, key: 'v3' as const },
    { mes: m || 12, ano: m ? y - 1 : y - 2, key: 'v4' as const },
  ];
  const somas: Record<string, number> = { v1: 0, v2: 0, v3: 0, v4: 0 };
  for (const p of periodos) {
    const { data: rows } = await filtroConta(
      supabase.from('vendas_itens').select('quantidade').eq('codigo_produto', String(id)).eq('mes', p.mes).eq('ano', p.ano),
      conta,
    );
    somas[p.key] = (rows || []).reduce((s: number, r: { quantidade?: unknown }) => s + num(r.quantidade), 0);
  }
  return {
    ma: { p: fmtP(new Date(y, m, 1)), q: somas.v1 },
    mant: { p: fmtP(new Date(y, m - 1, 1)), q: somas.v2 },
    maaa: { p: fmtP(new Date(y - 1, m, 1)), q: somas.v3 },
    mantaa: { p: fmtP(new Date(y - 1, m - 1, 1)), q: somas.v4 },
  };
}

/** Lista de vendas dos últimos ~12 meses + nomes de cliente (Clientes_Omie). */
export async function buscarVendasLista(id: number | string, conta: ContaFiltro, limite = 15): Promise<VendaItem[]> {
  const y = new Date().getFullYear();
  const { data: vendasDB } = await filtroConta(
    supabase
      .from('vendas_itens')
      .select('numero_pedido,data_pedido,quantidade,valor_unitario,valor_total,codigo_cliente,vendedor')
      .eq('codigo_produto', String(id))
      .gte('ano', y - 1),
    conta,
  )
    .order('data_pedido', { ascending: false })
    .limit(limite * 2);
  if (!vendasDB || vendasDB.length === 0) return [];

  let lista: VendaItem[] = vendasDB.map((v: Record<string, unknown>) => ({
    numero: String(v.numero_pedido || ''),
    data: String(v.data_pedido || ''),
    qtd: num(v.quantidade),
    vu: num(v.valor_unitario),
    vt: num(v.valor_total),
    codCliente: String(v.codigo_cliente || ''),
    vendedor: v.vendedor != null ? String(v.vendedor) : '',
  }));
  lista.sort((a, b) => parseDataBR(b.data).getTime() - parseDataBR(a.data).getTime());
  lista = lista.slice(0, limite);

  const codsClientes = [...new Set(lista.filter((v) => v.codCliente).map((v) => v.codCliente))];
  if (codsClientes.length > 0) {
    const clienteMap: Record<string, string> = {};
    for (let i = 0; i < codsClientes.length; i += 50) {
      const lote = codsClientes.slice(i, i + 50);
      const { data: clientes } = await supabase.from('Clientes_Omie').select('id,nome').in('id', lote);
      if (clientes) clientes.forEach((c: { id: unknown; nome?: unknown }) => { clienteMap[String(c.id)] = String(c.nome || ''); });
    }
    lista.forEach((v) => { v.cliente = clienteMap[v.codCliente] || ''; });
  }
  return lista;
}

/** Compras (compras_itens) + fornecedor via notas_entrada.emitente. */
export async function buscarComprasLista(id: number | string, conta: ContaFiltro, limite = 10): Promise<CompraItem[]> {
  const { data: comprasDB } = await filtroConta(
    supabase
      .from('compras_itens')
      .select('data_nota,numero_nf,quantidade,valor_unitario,valor_total')
      .eq('codigo_produto', String(id)),
    conta,
  )
    .order('data_nota', { ascending: false })
    .limit(limite * 2);
  if (!comprasDB || comprasDB.length === 0) return [];

  let compras: CompraItem[] = comprasDB.map((c: Record<string, unknown>) => ({
    data: String(c.data_nota || ''),
    nf: String(c.numero_nf || ''),
    qtd: num(c.quantidade),
    vu: num(c.valor_unitario),
    vt: num(c.valor_total),
    fornecedor: '',
  }));
  compras.sort((a, b) => parseDataBR(b.data).getTime() - parseDataBR(a.data).getTime());
  compras = compras.slice(0, limite);

  const nfs = [...new Set(compras.map((c) => c.nf).filter(Boolean))];
  if (nfs.length > 0) {
    const { data: notasNF } = await filtroConta(
      supabase.from('notas_entrada').select('numero_nf,emitente').in('numero_nf', nfs),
      conta,
    );
    if (notasNF) {
      const emiMap: Record<string, string> = {};
      notasNF.forEach((n: { numero_nf: unknown; emitente?: { nome_fantasia?: string; razao_social?: string } }) => {
        const e = n.emitente || {};
        emiMap[String(n.numero_nf)] = e.nome_fantasia || e.razao_social || '';
      });
      compras.forEach((c) => { c.fornecedor = emiMap[c.nf] || ''; });
    }
  }
  return compras;
}

interface MesPonto {
  mes: number;
  ano: number;
  data: string;
  label: string;
  ehAtual: boolean;
}

function gerarMesesHistorico(periodoMeses: number): MesPonto[] {
  const N = Math.max(1, periodoMeses || 12);
  const now = new Date();
  const meses: MesPonto[] = [];
  for (let i = N; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    meses.push({
      mes: d.getMonth() + 1,
      ano: d.getFullYear(),
      data: fmtD(ultimo),
      label: labelMesAno(d),
      ehAtual: i === 0,
    });
  }
  return meses;
}

/**
 * Histórico mensal de CMC + venda média + margem (R$). N+1 pontos, cronológico.
 * Usa cache em cmc_historico; busca da Omie só os meses faltantes (exceto mês atual).
 * Portado de buscarHistoricoProduto (server.js:4591).
 */
export async function buscarHistoricoProduto(
  idProd: number,
  periodoMeses: number,
  conta: Conta,
): Promise<HistoricoPonto[]> {
  const meses = gerarMesesHistorico(periodoMeses);
  const cmcMap: Record<string, number> = {};

  // 1) CMC do cache
  const { data: cache } = await supabase
    .from('cmc_historico')
    .select('mes,ano,cmc')
    .eq('id_produto', String(idProd))
    .eq('conta_omie', conta);
  if (cache) cache.forEach((c: { mes: number; ano: number; cmc: unknown }) => { cmcMap[c.mes + '/' + c.ano] = num(c.cmc); });

  // 2) CMC dos meses que faltam (Omie)
  const mesesParaBuscar = meses.filter((m) => m.ehAtual || cmcMap[m.mes + '/' + m.ano] === undefined);
  const novosParaCache: Array<{ id_produto: string; mes: number; ano: number; cmc: number; conta_omie: Conta }> = [];
  for (const m of mesesParaBuscar) {
    try {
      const r = await consultarEstoqueNaData(idProd, m.data, conta);
      const cmc = num(r.cmc);
      cmcMap[m.mes + '/' + m.ano] = cmc;
      if (!m.ehAtual && cmc > 0) {
        novosParaCache.push({ id_produto: String(idProd), mes: m.mes, ano: m.ano, cmc, conta_omie: conta });
      }
    } catch {
      cmcMap[m.mes + '/' + m.ano] = 0;
    }
    await sleep(500);
  }
  if (novosParaCache.length > 0) {
    await supabase.from('cmc_historico').upsert(novosParaCache, { onConflict: 'id_produto,mes,ano,conta_omie' });
  }

  // 3) Venda média mensal (sum(valor_total)/sum(quantidade))
  const vendaMap: Record<string, number> = {};
  const anoMin = Math.min(...meses.map((m) => m.ano));
  const { data: vendasRows } = await filtroConta(
    supabase.from('vendas_itens').select('mes,ano,quantidade,valor_total').eq('codigo_produto', String(idProd)).gte('ano', anoMin),
    conta,
  );
  if (vendasRows) {
    const agg: Record<string, { vt: number; qt: number }> = {};
    vendasRows.forEach((r: { mes: number; ano: number; quantidade?: unknown; valor_total?: unknown }) => {
      const k = r.mes + '/' + r.ano;
      if (!agg[k]) agg[k] = { vt: 0, qt: 0 };
      agg[k].vt += num(r.valor_total);
      agg[k].qt += num(r.quantidade);
    });
    Object.keys(agg).forEach((k) => { vendaMap[k] = agg[k].qt > 0 ? agg[k].vt / agg[k].qt : 0; });
  }

  // 4) Merge
  const resultado: HistoricoPonto[] = meses.map((m) => {
    const k = m.mes + '/' + m.ano;
    const cmcVal = cmcMap[k] || 0;
    const vendaVal = vendaMap[k] || 0;
    const margemVal = vendaVal > 0 && cmcVal > 0 ? vendaVal - cmcVal : 0;
    return { periodo: m.label, mes: m.mes, ano: m.ano, cmc: cmcVal, venda: vendaVal, margem: margemVal };
  });
  resultado.sort((a, b) => a.ano * 100 + a.mes - (b.ano * 100 + b.mes));
  return resultado;
}

/**
 * Histórico de CMC dos últimos 13 meses (mês atual + 12). Portado de
 * /api/cmc-historico (server.js:4844).
 */
export async function buscarCmcHistorico(idProd: number, conta: Conta): Promise<CmcPonto[]> {
  const meses = gerarMesesHistorico(12);
  const resultado: CmcPonto[] = [];
  const cacheMap: Record<string, number> = {};

  const { data: cache } = await supabase
    .from('cmc_historico')
    .select('mes,ano,cmc')
    .eq('id_produto', String(idProd))
    .eq('conta_omie', conta);
  if (cache) cache.forEach((c: { mes: number; ano: number; cmc: unknown }) => { cacheMap[c.mes + '/' + c.ano] = num(c.cmc); });

  const mesesParaBuscar: MesPonto[] = [];
  for (const m of meses) {
    const chave = m.mes + '/' + m.ano;
    if (!m.ehAtual && cacheMap[chave] !== undefined) {
      resultado.push({ periodo: m.label, mes: m.mes, ano: m.ano, cmc: cacheMap[chave], fonte: 'cache' });
    } else {
      mesesParaBuscar.push(m);
    }
  }

  const novosParaCache: Array<{ id_produto: string; mes: number; ano: number; cmc: number; conta_omie: Conta }> = [];
  for (const m of mesesParaBuscar) {
    try {
      const r = await consultarEstoqueNaData(idProd, m.data, conta);
      const cmc = num(r.cmc);
      resultado.push({ periodo: m.label, mes: m.mes, ano: m.ano, cmc, fonte: 'api' });
      if (!m.ehAtual && cmc > 0) {
        novosParaCache.push({ id_produto: String(idProd), mes: m.mes, ano: m.ano, cmc, conta_omie: conta });
      }
    } catch {
      resultado.push({ periodo: m.label, mes: m.mes, ano: m.ano, cmc: 0, fonte: 'erro' });
    }
    await sleep(500);
  }
  if (novosParaCache.length > 0) {
    await supabase.from('cmc_historico').upsert(novosParaCache, { onConflict: 'id_produto,mes,ano,conta_omie' });
  }

  resultado.sort((a, b) => a.ano * 100 + a.mes - (b.ano * 100 + b.mes));
  return resultado;
}
