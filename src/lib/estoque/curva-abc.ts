// Curva ABC (Pareto de vendas por produto/cliente/família) + produtos inativos.
// Portado de /api/curva-abc e /api/curva-abc/inativos (server.js:3353/3490).

import { supabase, filtroConta } from './supabase';
import { getCategoriasConfig, tipoMatchCategoria } from './categorias';
import { CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function passaFiltroFamilia(familia: unknown, filtroFamilia: string): boolean {
  if (!filtroFamilia) return true;
  const fam = norm(String(familia ?? ''));
  if (filtroFamilia === 'pecas') return fam === '' || fam.includes('peca') || fam.includes('pecas');
  if (filtroFamilia === 'maquinas') return fam.includes('maquina') || fam.includes('trator') || fam.includes('implemento') || fam.includes('agricul');
  return true;
}

export type CurvaTipo = 'produto' | 'cliente' | 'familia';

export interface CurvaABCItem {
  codigo: string;
  descricao: string;
  valor_total: number;
  custo_total: number;
  quantidade: number;
  ocorrencias: number;
  percentual: number;
  percentual_acumulado: number;
  margem: number;
  posicao: number;
  classe: 'A' | 'B' | 'C';
  sku?: string;
}

export interface CurvaABCResult {
  itens: CurvaABCItem[];
  resumo: { totalGeral: number; qtdeA: number; qtdeB: number; qtdeC: number; valorA: number; valorB: number; valorC: number };
  periodo: string;
  tipo: CurvaTipo;
  totalItens: number;
}

interface ItemABC {
  codigo_produto?: string;
  descricao?: string;
  codigo_cliente?: string;
  valor_total?: number | string;
  quantidade?: number | string;
  cmc_unitario?: number | string;
  familia?: string;
  tipo?: string;
}

export async function calcularCurvaABC(
  tipo: CurvaTipo,
  periodo: number,
  tipoCaract: string,
  filtroFamilia: string,
  conta: ContaFiltro,
): Promise<CurvaABCResult> {
  const cats = await getCategoriasConfig();
  const catFiltro = tipoCaract ? cats.find((c) => c.nome.toLowerCase() === tipoCaract.toLowerCase()) : undefined;
  const now = new Date();
  const mesesList: Array<{ mes: number; ano: number }> = [];
  for (let i = 0; i < periodo; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    mesesList.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }

  let todos: ItemABC[] = [];
  for (const m of mesesList) {
    let offset = 0;
    while (true) {
      const { data } = await filtroConta(
        supabase
          .from('vendas_itens')
          .select('codigo_produto,descricao,codigo_cliente,valor_total,quantidade,cmc_unitario,familia,tipo')
          .eq('mes', m.mes)
          .eq('ano', m.ano),
        conta,
      )
        .order('valor_total', { ascending: false })
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      let filtrado = data as ItemABC[];
      if (filtroFamilia) filtrado = filtrado.filter((it) => passaFiltroFamilia(it.familia, filtroFamilia));
      if (tipoCaract) {
        if (catFiltro) filtrado = filtrado.filter((it) => tipoMatchCategoria(it.tipo, catFiltro));
        else filtrado = filtrado.filter((it) => norm(String(it.tipo ?? '')) === norm(tipoCaract));
      }
      todos = todos.concat(filtrado);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  const grupos: Record<string, CurvaABCItem> = {};
  todos.forEach((item) => {
    let chave: string, desc: string;
    if (tipo === 'cliente') { chave = item.codigo_cliente || 'SEM_CLIENTE'; desc = item.descricao || chave; }
    else if (tipo === 'familia') { chave = (item.tipo || 'SEM_TIPO').trim(); desc = chave; }
    else { chave = item.codigo_produto || 'SEM_CODIGO'; desc = item.descricao || chave; }
    if (!grupos[chave]) {
      grupos[chave] = {
        codigo: chave, descricao: desc, valor_total: 0, custo_total: 0, quantidade: 0,
        ocorrencias: 0, percentual: 0, percentual_acumulado: 0, margem: 0, posicao: 0, classe: 'C',
      };
    }
    const g = grupos[chave];
    g.valor_total += num(item.valor_total);
    g.custo_total += num(item.cmc_unitario) > 0 && num(item.quantidade) > 0 ? num(item.cmc_unitario) * num(item.quantidade) : 0;
    g.quantidade += num(item.quantidade);
    g.ocorrencias++;
    if (item.descricao) g.descricao = item.descricao;
  });

  const lista = Object.values(grupos).sort((a, b) => b.valor_total - a.valor_total);
  const totalGeral = lista.reduce((s, it) => s + it.valor_total, 0);
  let acumulado = 0;
  let qtdeA = 0, qtdeB = 0, qtdeC = 0, valorA = 0, valorB = 0, valorC = 0;
  lista.forEach((it, i) => {
    acumulado += it.valor_total;
    it.percentual = totalGeral > 0 ? (it.valor_total / totalGeral) * 100 : 0;
    it.percentual_acumulado = totalGeral > 0 ? (acumulado / totalGeral) * 100 : 0;
    it.margem = it.valor_total - it.custo_total;
    it.posicao = i + 1;
    if (it.percentual_acumulado <= 80) { it.classe = 'A'; qtdeA++; valorA += it.valor_total; }
    else if (it.percentual_acumulado <= 95) { it.classe = 'B'; qtdeB++; valorB += it.valor_total; }
    else { it.classe = 'C'; qtdeC++; valorC += it.valor_total; }
  });

  if (tipo === 'cliente') {
    const codsCli = lista.map((it) => it.codigo).filter((c) => c !== 'SEM_CLIENTE');
    for (let i = 0; i < codsCli.length; i += 50) {
      const lote = codsCli.slice(i, i + 50);
      const { data: clientes } = await supabase.from('Clientes_Omie').select('id,nome').in('id', lote);
      if (clientes) {
        const map: Record<string, string> = {};
        (clientes as Array<{ id: unknown; nome?: string }>).forEach((c) => { map[String(c.id)] = c.nome || ''; });
        lista.forEach((it) => { if (map[it.codigo]) it.descricao = map[it.codigo]; });
      }
    }
  }
  if (tipo === 'produto') {
    const codsProd = lista.map((it) => it.codigo).filter((c) => c && c !== 'SEM_CODIGO');
    const skuMap: Record<string, string> = {};
    for (let i = 0; i < codsProd.length; i += 50) {
      const lote = codsProd.slice(i, i + 50).map((c) => parseInt(c)).filter((n) => !isNaN(n));
      if (lote.length === 0) continue;
      const { data: prods } = await filtroConta(supabase.from('Produtos_Completos').select('id_omie,Codigo_Produto').in('id_omie', lote), conta);
      if (prods) (prods as Array<{ id_omie: unknown; Codigo_Produto?: string }>).forEach((p) => { skuMap[String(p.id_omie)] = p.Codigo_Produto || ''; });
    }
    lista.forEach((it) => { if (skuMap[it.codigo]) it.sku = skuMap[it.codigo]; });
  }

  return {
    itens: lista,
    resumo: { totalGeral, qtdeA, qtdeB, qtdeC, valorA, valorB, valorC },
    periodo: periodo + ' meses',
    tipo,
    totalItens: lista.length,
  };
}

// ====================== Inativos ======================

export interface InativoItem {
  codigo_produto: string;
  sku: string;
  descricao: string;
  ultima_venda: string | null;
  dias_parado: number | null;
  saldo: number | null;
  cmc: number | null;
  valor_estoque: number | null;
  sugestao: string;
}

export interface InativosResult {
  inativos: InativoItem[];
  total: number;
  totalCatalogo: number;
  totalVendidos: number;
  resumo: { nuncaVendidos: number; mais365: number; mais180: number; menos180: number; valorParadoTotal: number; comEstoque: number };
  periodo: string;
}

export async function listarInativos(
  periodo: number,
  tipoCaract: string,
  filtroFamilia: string,
  conta: ContaFiltro,
): Promise<InativosResult> {
  const contaId: Conta = conta ?? CONTA_DEFAULT;
  const cats = await getCategoriasConfig();
  const now = new Date();

  // Filtro por tipo (caract) via produto_tipo
  const tiposPorProduto: Record<string, string> = {};
  if (tipoCaract) {
    const catFiltro = cats.find((c) => c.nome.toLowerCase() === tipoCaract.toLowerCase());
    let off2 = 0;
    while (true) {
      const { data: pts } = await supabase.from('produto_tipo').select('codigo_produto,tipo').eq('conta_omie', contaId).range(off2, off2 + 999);
      if (!pts || pts.length === 0) break;
      (pts as Array<{ codigo_produto: string; tipo?: string }>).forEach((p) => {
        if (catFiltro) { if (tipoMatchCategoria(p.tipo, catFiltro)) tiposPorProduto[p.codigo_produto] = p.tipo || ''; }
        else if (norm(String(p.tipo ?? '')) === norm(tipoCaract)) tiposPorProduto[p.codigo_produto] = p.tipo || '';
      });
      if (pts.length < 1000) break;
      off2 += 1000;
    }
  }

  // Catálogo (Produtos_Completos)
  let catalogo: Array<{ id_omie: number; Codigo_Produto?: string; Descricao_Produto?: string }> = [];
  let offset = 0;
  while (true) {
    const { data } = await filtroConta(
      supabase.from('Produtos_Completos').select('id_omie,Codigo_Produto,Descricao_Produto'),
      conta,
    ).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    catalogo = catalogo.concat(data as typeof catalogo);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (tipoCaract && Object.keys(tiposPorProduto).length > 0) {
    catalogo = catalogo.filter((p) => tiposPorProduto[String(p.id_omie)]);
  }
  if (filtroFamilia) {
    const famMap: Record<string, string> = {};
    let offFam = 0;
    while (true) {
      const { data: pts } = await supabase.from('produto_tipo').select('codigo_produto,familia').eq('conta_omie', contaId).range(offFam, offFam + 999);
      if (!pts || pts.length === 0) break;
      (pts as Array<{ codigo_produto: string; familia?: string }>).forEach((p) => { famMap[p.codigo_produto] = p.familia || ''; });
      if (pts.length < 1000) break;
      offFam += 1000;
    }
    catalogo = catalogo.filter((p) => passaFiltroFamilia(famMap[String(p.id_omie)], filtroFamilia));
  }

  // Códigos vendidos no período
  const vendidos = new Set<string>();
  for (let i = 0; i < periodo; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = d.getMonth() + 1, ano = d.getFullYear();
    let off = 0;
    while (true) {
      const { data } = await filtroConta(
        supabase.from('vendas_itens').select('codigo_produto,data_pedido').eq('mes', mes).eq('ano', ano),
        conta,
      ).range(off, off + 999);
      if (!data || data.length === 0) break;
      (data as Array<{ codigo_produto?: string }>).forEach((it) => { if (it.codigo_produto) vendidos.add(String(it.codigo_produto)); });
      if (data.length < 1000) break;
      off += 1000;
    }
  }

  const inativos = catalogo.filter((p) => !vendidos.has(String(p.id_omie)));

  // Última venda histórica dos inativos
  const codsInativos = inativos.map((p) => String(p.id_omie));
  const ultimaVendaHist: Record<string, string> = {};
  for (let i = 0; i < codsInativos.length; i += 200) {
    const lote = codsInativos.slice(i, i + 200);
    const { data } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_produto,data_pedido').in('codigo_produto', lote).order('data_pedido', { ascending: false }).limit(1000),
      conta,
    );
    if (data) (data as Array<{ codigo_produto: string; data_pedido: string }>).forEach((it) => {
      const k = String(it.codigo_produto);
      if (!ultimaVendaHist[k] || it.data_pedido > ultimaVendaHist[k]) ultimaVendaHist[k] = it.data_pedido;
    });
  }

  // Estoque dos inativos (tabela produtos)
  const estoqueMap: Record<string, { estoque: number; cmc: number; valor_estoque: number }> = {};
  const idsInativos = inativos.map((p) => String(p.id_omie)).filter(Boolean);
  for (let i = 0; i < idsInativos.length; i += 200) {
    const lote = idsInativos.slice(i, i + 200);
    let resp = await supabase.from('produtos').select('codigo_produto,estoque,cmc,valor_estoque').in('codigo_produto', lote);
    if (resp.error) {
      const loteNum = lote.map((s) => parseInt(s)).filter((n) => !isNaN(n));
      resp = await supabase.from('produtos').select('codigo_produto,estoque,cmc,valor_estoque').in('codigo_produto', loteNum);
      if (resp.error) break;
    }
    if (resp.data) (resp.data as Array<{ codigo_produto: unknown; estoque: unknown; cmc: unknown; valor_estoque: unknown }>).forEach((p) => {
      estoqueMap[String(p.codigo_produto)] = { estoque: num(p.estoque), cmc: num(p.cmc), valor_estoque: num(p.valor_estoque) };
    });
  }

  const resultado: InativoItem[] = inativos.map((p) => {
    const idStr = String(p.id_omie);
    const ultimaVenda = ultimaVendaHist[idStr] || null;
    const est = estoqueMap[idStr];
    const saldo = est ? est.estoque : null;
    const cmc = est ? est.cmc : null;
    const valorEstoque = est ? est.valor_estoque : null;
    let diasParado: number | null = null;
    if (ultimaVenda) {
      const partes = ultimaVenda.split('/');
      if (partes.length === 3) {
        const dt = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
        diasParado = Math.round((now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    const temEstoque = saldo !== null && saldo > 0;
    let sugestao = 'Avaliar';
    if (diasParado === null && !temEstoque) sugestao = 'Descontinuar';
    else if (diasParado === null && temEstoque) sugestao = 'Liquidar (tem estoque)';
    else if (diasParado !== null && diasParado > 365 && temEstoque) sugestao = 'Liquidar';
    else if (diasParado !== null && diasParado > 365) sugestao = 'Descontinuar';
    else if (diasParado !== null && diasParado > 180 && temEstoque) sugestao = 'Promover';
    else sugestao = 'Monitorar';

    return { codigo_produto: idStr, sku: p.Codigo_Produto || '', descricao: p.Descricao_Produto || '', ultima_venda: ultimaVenda, dias_parado: diasParado, saldo, cmc, valor_estoque: valorEstoque, sugestao };
  });

  resultado.sort((a, b) => {
    if (a.dias_parado === null && b.dias_parado === null) return 0;
    if (a.dias_parado === null) return -1;
    if (b.dias_parado === null) return 1;
    return b.dias_parado - a.dias_parado;
  });

  const nuncaVendidos = resultado.filter((r) => r.dias_parado === null).length;
  const mais365 = resultado.filter((r) => r.dias_parado !== null && r.dias_parado > 365).length;
  const mais180 = resultado.filter((r) => r.dias_parado !== null && r.dias_parado > 180 && r.dias_parado <= 365).length;
  const menos180 = resultado.filter((r) => r.dias_parado !== null && r.dias_parado <= 180).length;
  const valorParadoTotal = resultado.reduce((s, r) => s + (r.valor_estoque || 0), 0);
  const comEstoque = resultado.filter((r) => r.saldo && r.saldo > 0).length;

  return {
    inativos: resultado,
    total: resultado.length,
    totalCatalogo: catalogo.length,
    totalVendidos: vendidos.size,
    resumo: { nuncaVendidos, mais365, mais180, menos180, valorParadoTotal, comEstoque },
    periodo: periodo + ' meses',
  };
}
