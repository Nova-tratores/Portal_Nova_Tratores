// Leituras de apoio do dashboard: histórico de 1 card, categorias presentes,
// vendas detalhadas, itens de um pedido e compras do mês.
// Portado de /api/dashboard/{historico,categorias-vendas,vendas,pedido-itens,compras}.

import { supabase, filtroConta } from './supabase';
import {
  agregarCards,
  getCategoriasConfig,
  tipoMatchCategoria,
  expandirCategoriaFiltro,
  CATEGORIAS_AGRUPADAS,
  type ItemVenda,
} from './categorias';
import { preCarregarCMCPorMes } from './vendas-sync';
import { getIgnorarFiltro } from './ignorar-clientes';
import { ehMesAtual, diasUteisDoMes, diasUteisAteHoje, MESES_CURTO } from './utils';
import { CONTA_DEFAULT, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ehPecaFamilia = (familia: unknown): boolean => {
  const f = norm(String(familia ?? ''));
  return f === '' || f.includes('peca') || f.includes('pecas');
};

// ====================== /api/dashboard/historico ======================

interface HistoricoMesPonto {
  label: string;
  mes: number;
  ano: number;
  valor: number;
  custo: number;
  qtdePedidos: number;
}

export interface HistoricoResult {
  card: number;
  nome: string;
  meses: HistoricoMesPonto[];
  proporcao: number;
  diasUteisTranscorridos: number;
}

interface HistItem extends ItemVenda {
  mes: number;
  ano: number;
  numero_pedido?: string | null;
}

/** Histórico mês a mês (desde Jan/2023) de um card específico. */
export async function montarHistorico(
  card: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<HistoricoResult> {
  const cats = await getCategoriasConfig();
  const numCats = cats.length;
  const cardPecas = numCats + 1;
  const cardServicos = numCats + 2;
  const cardTotalGeral = numCats + 3;

  const now = new Date();
  const meses: Array<{ mes: number; ano: number; label: string }> = [];
  const d = new Date(2023, 0, 1);
  while (d <= now) {
    meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear(), label: MESES_CURTO[d.getMonth()] + '/' + d.getFullYear() });
    d.setMonth(d.getMonth() + 1);
  }

  const anos = [...new Set(meses.map((m) => m.ano))];
  let todosItens: HistItem[] = [];
  for (const ano of anos) {
    let offset = 0;
    while (true) {
      const { data } = await filtroConta(
        supabase
          .from('vendas_itens')
          .select('mes,ano,tipo,familia,valor_total,numero_pedido,codigo_categoria,cmc_unitario,quantidade')
          .eq('ano', ano),
        conta,
      )
        .order('mes', { ascending: true })
        .order('numero_pedido', { ascending: true })
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      todosItens = todosItens.concat(data as HistItem[]);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  let todosOS: Array<{ mes: number; ano: number; valor_total: number }> = [];
  if (card === cardServicos || card === cardTotalGeral) {
    for (const ano of anos) {
      const { data } = await filtroConta(supabase.from('os_mensal').select('mes,ano,valor_total').eq('ano', ano), conta);
      if (data) todosOS = todosOS.concat(data as Array<{ mes: number; ano: number; valor_total: number }>);
    }
    if (!conta) {
      const agregado: Record<string, number> = {};
      todosOS.forEach((o) => { agregado[o.mes + '/' + o.ano] = (agregado[o.mes + '/' + o.ano] || 0) + num(o.valor_total); });
      todosOS = Object.keys(agregado).map((k) => {
        const p = k.split('/');
        return { mes: parseInt(p[0]), ano: parseInt(p[1]), valor_total: agregado[k] };
      });
    }
  }

  const resultados: HistoricoMesPonto[] = meses.map((m) => {
    const itensMes = todosItens.filter((it) => it.mes === m.mes && it.ano === m.ano);
    const agg = agregarCards(itensMes, filtroCategoria, cats);
    const osMes = todosOS.find((o) => o.mes === m.mes && o.ano === m.ano);
    const totalOS = osMes ? num(osMes.valor_total) : 0;
    const totalPecas = agg.cards.reduce((s, v) => s + v, 0);
    const totalCustoPecas = agg.custosCards.reduce((s, v) => s + v, 0);
    let valor: number, custo: number;
    if (card === 0) { valor = totalPecas; custo = totalCustoPecas; }
    else if (card >= 1 && card <= numCats) { valor = agg.cards[card - 1] || 0; custo = agg.custosCards[card - 1] || 0; }
    else if (card === cardPecas) { valor = agg.cards[numCats] || 0; custo = agg.custosCards[numCats] || 0; }
    else if (card === cardServicos) { valor = totalOS; custo = 0; }
    else if (card === cardTotalGeral) { valor = totalPecas + totalOS; custo = totalCustoPecas; }
    else { valor = 0; custo = 0; }
    const pedidosUnicos = new Set(itensMes.map((it) => it.numero_pedido).filter(Boolean)).size;
    return { label: m.label, mes: m.mes, ano: m.ano, valor, custo, qtdePedidos: pedidosUnicos };
  });

  let nomeCard: string;
  if (card === 0) nomeCard = 'Total Pecas';
  else if (card >= 1 && card <= numCats) nomeCard = cats[card - 1].nome || 'Card ' + card;
  else if (card === cardPecas) nomeCard = 'Pecas Diversas';
  else if (card === cardServicos) nomeCard = 'Servicos';
  else if (card === cardTotalGeral) nomeCard = 'Total Geral Servicos + Pecas';
  else nomeCard = 'Card ' + card;

  const ehMesCorrente = ehMesAtual(now.getMonth() + 1, now.getFullYear());
  const totalDU = ehMesCorrente ? diasUteisDoMes(now.getFullYear(), now.getMonth() + 1) : 0;
  const transcorridoDU = ehMesCorrente ? diasUteisAteHoje(now.getFullYear(), now.getMonth() + 1) : 0;
  const proporcao = ehMesCorrente && totalDU > 0 ? transcorridoDU / totalDU : 1;
  return { card, nome: nomeCard, meses: resultados, proporcao, diasUteisTranscorridos: transcorridoDU };
}

/** Número máximo de card válido (para validação na rota). */
export async function maxCardHistorico(): Promise<number> {
  const cats = await getCategoriasConfig();
  return cats.length + 3;
}

// ====================== /api/dashboard/categorias-vendas ======================

const categoriasVendasCachePorConta: Record<string, { lista: Array<{ codigo: string; descricao: string }>; time: number }> = {};

export async function listarCategoriasVendas(conta: ContaFiltro): Promise<Array<{ codigo: string; descricao: string }>> {
  const cacheKey = conta || '__TODAS__';
  const cached = categoriasVendasCachePorConta[cacheKey];
  if (cached && Date.now() - cached.time < 600_000) return cached.lista;

  const codigosSet = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await filtroConta(
      supabase.from('vendas_itens').select('codigo_categoria').not('codigo_categoria', 'is', null),
      conta,
    ).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    (data as Array<{ codigo_categoria?: string }>).forEach((r) => { if (r.codigo_categoria) codigosSet.add(r.codigo_categoria); });
    if (data.length < 1000) break;
    offset += 1000;
  }
  const gruposPresentes = new Set<string>();
  [...codigosSet].forEach((cod) => {
    for (const [nomeGrupo, codigos] of Object.entries(CATEGORIAS_AGRUPADAS)) {
      if (codigos.includes(cod)) { gruposPresentes.add(nomeGrupo); break; }
    }
  });
  const lista = [...gruposPresentes].map((g) => ({ codigo: g, descricao: g })).sort((a, b) => a.descricao.localeCompare(b.descricao));
  categoriasVendasCachePorConta[cacheKey] = { lista, time: Date.now() };
  return lista;
}

// ====================== /api/dashboard/vendas ======================

interface VendaRow extends ItemVenda {
  numero_pedido?: string | null;
  data_pedido?: string | null;
  descricao?: string | null;
  codigo_produto?: string | null;
  valor_unitario?: number | string | null;
}

async function enriquecerCmc(rows: VendaRow[], mes: number, ano: number, conta: ContaFiltro): Promise<void> {
  let semCmc = [...new Set(rows.filter((v) => !(num(v.cmc_unitario) > 0)).map((v) => v.codigo_produto).filter(Boolean))] as string[];
  if (semCmc.length === 0) return;
  const cmcMesMap = await preCarregarCMCPorMes(semCmc, mes, ano, conta ?? CONTA_DEFAULT);
  rows.forEach((v) => {
    if (!(num(v.cmc_unitario) > 0) && cmcMesMap[String(v.codigo_produto)] > 0) v.cmc_unitario = cmcMesMap[String(v.codigo_produto)];
  });
  semCmc = [...new Set(rows.filter((v) => !(num(v.cmc_unitario) > 0)).map((v) => v.codigo_produto).filter(Boolean))] as string[];
  if (semCmc.length === 0) return;
  // produtos.conta_omie é gravado em MINÚSCULAS (≠ vendas_itens etc.), por isso
  // filtramos com conta.toLowerCase() em vez de filtroConta (que zeraria).
  const filtroContaProdutos = <T,>(q: T): T =>
    conta ? (q as { eq(c: string, v: string): T }).eq('conta_omie', conta.toLowerCase()) : q;
  const cmcProdMap: Record<string, number> = {};
  for (let i = 0; i < semCmc.length; i += 200) {
    const lote = semCmc.slice(i, i + 200);
    let resp = await filtroContaProdutos(supabase.from('produtos').select('codigo_produto,cmc').in('codigo_produto', lote));
    if (resp.error) {
      const loteNum = lote.map((s) => parseInt(s)).filter((n) => !isNaN(n));
      resp = await filtroContaProdutos(supabase.from('produtos').select('codigo_produto,cmc').in('codigo_produto', loteNum));
    }
    if (resp.data) (resp.data as Array<{ codigo_produto: unknown; cmc: unknown }>).forEach((p) => {
      const c = num(p.cmc);
      if (c > 0) cmcProdMap[String(p.codigo_produto)] = c;
    });
  }
  rows.forEach((v) => {
    if (!(num(v.cmc_unitario) > 0) && cmcProdMap[String(v.codigo_produto)]) v.cmc_unitario = cmcProdMap[String(v.codigo_produto)];
  });
}

async function enriquecerDescricao(rows: VendaRow[], conta: ContaFiltro): Promise<void> {
  const codigos = [...new Set(rows.map((v) => v.codigo_produto).filter(Boolean))] as string[];
  if (codigos.length === 0) return;
  const descMap: Record<string, string> = {};
  for (let i = 0; i < codigos.length; i += 50) {
    const lote = codigos.slice(i, i + 50);
    const { data: prods } = await filtroConta(
      supabase.from('Produtos_Completos').select('id_omie,Descricao_Produto').in('id_omie', lote.map((c) => parseInt(c))),
      conta,
    );
    if (prods) (prods as Array<{ id_omie: unknown; Descricao_Produto?: string }>).forEach((p) => { if (p.Descricao_Produto) descMap[String(p.id_omie)] = p.Descricao_Produto; });
  }
  rows.forEach((v) => { if (v.codigo_produto && descMap[v.codigo_produto]) v.descricao = descMap[v.codigo_produto]; });
}

/** Vendas detalhadas do mês, com filtro de card/categoria e enriquecimento. */
export async function listarVendas(
  mes: number,
  ano: number,
  card: number | null,
  categoria: string | null,
  conta: ContaFiltro,
): Promise<VendaRow[]> {
  const cats = await getCategoriasConfig();
  const { codigos: codigosIgnorar } = await getIgnorarFiltro(conta);

  let vendas: VendaRow[] = [];
  let offset = 0;
  while (true) {
    let q = filtroConta(
      supabase
        .from('vendas_itens')
        .select('numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,tipo,familia,codigo_categoria,cmc_unitario')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    );
    if (codigosIgnorar.length > 0) q = (q as typeof q).not('codigo_cliente', 'in', '(' + codigosIgnorar.join(',') + ')');
    const { data } = await q.order('data_pedido', { ascending: false }).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    vendas = vendas.concat(data as VendaRow[]);
    if (data.length < 1000) break;
    offset += 1000;
  }

  await enriquecerDescricao(vendas, conta);

  // Enriquece tipo/familia faltante via produto_tipo
  const codsEnriquecer = [...new Set(vendas.filter((v) => !v.familia).map((v) => v.codigo_produto).filter(Boolean))] as string[];
  if (codsEnriquecer.length > 0) {
    const tipoMap: Record<string, { tipo?: string; familia?: string }> = {};
    for (let ti = 0; ti < codsEnriquecer.length; ti += 50) {
      const loteTipo = codsEnriquecer.slice(ti, ti + 50);
      const resp2 = await filtroConta(supabase.from('produto_tipo').select('codigo_produto,tipo,familia').in('codigo_produto', loteTipo), conta);
      if (resp2.data) (resp2.data as Array<{ codigo_produto: string; tipo?: string; familia?: string }>).forEach((t) => { tipoMap[t.codigo_produto] = t; });
    }
    vendas.forEach((v) => {
      const t = v.codigo_produto ? tipoMap[v.codigo_produto] : undefined;
      if (!v.familia && t) {
        if (!v.tipo && t.tipo) v.tipo = t.tipo;
        if (t.familia) v.familia = t.familia;
      }
    });
  }

  const numCats = cats.length;
  const cardPecasDiversas = numCats + 1;
  const cardServicos = numCats + 2;
  const cardTotalGeral = numCats + 3;
  const ehTotalPecas = (v: VendaRow): boolean => {
    for (let i = 0; i < numCats; i++) if (tipoMatchCategoria(v.tipo, cats[i])) return true;
    return ehPecaFamilia(v.familia);
  };

  if (card !== null && card !== undefined) {
    if (card === cardServicos) {
      vendas = [];
    } else if (card >= 1 && card <= numCats) {
      vendas = vendas.filter((v) => tipoMatchCategoria(v.tipo, cats[card - 1]));
    } else if (card === cardPecasDiversas) {
      vendas = vendas.filter((v) => {
        if (!ehPecaFamilia(v.familia)) return false;
        for (let i = 0; i < numCats; i++) if (tipoMatchCategoria(v.tipo, cats[i])) return false;
        return true;
      });
    } else if (card === 0 || card === cardTotalGeral) {
      vendas = vendas.filter(ehTotalPecas);
    }
  } else {
    vendas = vendas.filter((v) => ehPecaFamilia(v.familia));
  }

  if (categoria) {
    const codigosFiltro = expandirCategoriaFiltro(categoria);
    if (codigosFiltro) vendas = vendas.filter((v) => codigosFiltro.includes(v.codigo_categoria || ''));
  }

  await enriquecerCmc(vendas, mes, ano, conta);
  return vendas;
}

// ====================== /api/dashboard/pedido-itens ======================

export async function listarPedidoItens(
  numeroPedido: string,
  mes: number,
  ano: number,
  conta: ContaFiltro,
): Promise<VendaRow[]> {
  let q = filtroConta(
    supabase
      .from('vendas_itens')
      .select('numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,tipo,familia,codigo_categoria,cmc_unitario')
      .eq('numero_pedido', numeroPedido),
    conta,
  );
  if (mes) q = (q as typeof q).eq('mes', mes);
  if (ano) q = (q as typeof q).eq('ano', ano);
  const { data } = await q;
  const itens = (data || []) as VendaRow[];
  if (itens.length === 0) return itens;

  await enriquecerDescricao(itens, conta);
  if (mes && ano) await enriquecerCmc(itens, mes, ano, conta);
  return itens;
}

// ====================== /api/dashboard/compras ======================

interface CompraRow {
  numero_nf?: string | null;
  data_nota?: string | null;
  codigo_produto?: string | null;
  quantidade?: number | string | null;
  valor_unitario?: number | string | null;
  valor_total?: number | string | null;
  descricao?: string | null;
}

export async function listarCompras(mes: number, ano: number, conta: ContaFiltro): Promise<CompraRow[]> {
  let compras: CompraRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await filtroConta(
      supabase
        .from('compras_itens')
        .select('numero_nf,data_nota,codigo_produto,quantidade,valor_unitario,valor_total')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    )
      .order('data_nota', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    compras = compras.concat(data as CompraRow[]);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const codigos = [...new Set(compras.map((c) => c.codigo_produto).filter(Boolean))] as string[];
  const descMap: Record<string, string> = {};
  const familiaMap: Record<string, string> = {};
  if (codigos.length > 0) {
    for (let i = 0; i < codigos.length; i += 50) {
      const lote = codigos.slice(i, i + 50);
      const { data: prods } = await filtroConta(
        supabase.from('Produtos_Completos').select('id_omie,Descricao_Produto').in('id_omie', lote.map((c) => parseInt(c)).filter((n) => !isNaN(n))),
        conta,
      );
      if (prods) (prods as Array<{ id_omie: unknown; Descricao_Produto?: string }>).forEach((p) => { if (p.Descricao_Produto) descMap[String(p.id_omie)] = p.Descricao_Produto; });
    }
    const naoMapeados = codigos.filter((c) => !descMap[c]);
    if (naoMapeados.length > 0) {
      for (let i = 0; i < naoMapeados.length; i += 50) {
        const lote = naoMapeados.slice(i, i + 50);
        const { data: prods } = await filtroConta(
          supabase.from('Produtos_Completos').select('id_omie,Codigo_Produto,Descricao_Produto').in('Codigo_Produto', lote),
          conta,
        );
        if (prods) (prods as Array<{ Codigo_Produto: string; Descricao_Produto?: string }>).forEach((p) => { if (p.Descricao_Produto) descMap[p.Codigo_Produto] = p.Descricao_Produto; });
      }
    }
    for (let i = 0; i < codigos.length; i += 50) {
      const lote = codigos.slice(i, i + 50);
      const { data: tipos } = await filtroConta(supabase.from('produto_tipo').select('codigo_produto,familia').in('codigo_produto', lote), conta);
      if (tipos) (tipos as Array<{ codigo_produto: string; familia?: string }>).forEach((t) => { if (t.familia) familiaMap[t.codigo_produto] = t.familia; });
    }
    compras.forEach((c) => { c.descricao = (c.codigo_produto && descMap[c.codigo_produto]) || c.codigo_produto; });
  }

  // Só peças (exclui máquinas)
  compras = compras.filter((c) => ehPecaFamilia(c.codigo_produto ? familiaMap[c.codigo_produto] : ''));
  return compras;
}
