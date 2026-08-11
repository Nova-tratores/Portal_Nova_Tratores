// Leituras de apoio do dashboard: histórico de 1 card, categorias presentes,
// vendas detalhadas, itens de um pedido e compras do mês.
// Portado de /api/dashboard/{historico,categorias-vendas,vendas,pedido-itens,compras}.

import { supabase, filtroConta } from './supabase';
import {
  agregarCardsPecas,
  agregarMaquinas,
  getFixedCats,
  classificarCardPeca,
  expandirCategoriaFiltro,
  CATEGORIAS_AGRUPADAS,
  type ItemVenda,
} from './categorias';
import { classificarGrupo, comprasPecasMes, type CompraPecaItem } from './cruzamento-familia';
import { preCarregarCMCPorMes } from './vendas-sync';
import { getIgnorarFiltro } from './ignorar-clientes';
import { ehMesAtual, diasUteisDoMes, diasUteisAteHoje, MESES_CURTO } from './utils';
import { CONTA_DEFAULT, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// ====================== /api/dashboard/historico ======================

interface HistoricoMesPonto {
  label: string;
  mes: number;
  ano: number;
  valor: number;
  custo: number;
  qtdePedidos: number;
  /** Só no card Serviços: split OS com NFS-e × internas (null quando os_mensal ainda não tem o split). */
  valorNota?: number | null;
  valorInterno?: number | null;
}

export interface HistoricoResult {
  catKey: string;
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

/** Histórico mês a mês (desde Jan/2023) de um card específico (por chave). */
export async function montarHistorico(
  catKey: string,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<HistoricoResult> {
  const fixed = await getFixedCats();

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

  type OSMensalRow = { mes: number; ano: number; valor_total: number; valor_nota: number | null; valor_interno: number | null };
  let todosOS: OSMensalRow[] = [];
  if (catKey === 'servico' || catKey === 'totalGeral') {
    for (const ano of anos) {
      const { data } = await filtroConta(supabase.from('os_mensal').select('mes,ano,valor_total,valor_nota,valor_interno').eq('ano', ano), conta);
      if (data) todosOS = todosOS.concat(data as OSMensalRow[]);
    }
    if (!conta) {
      // "Todas": soma por mês; split só quando TODAS as contas do mês têm o split (senão null).
      const agregado: Record<string, { total: number; nota: number | null; interno: number | null }> = {};
      todosOS.forEach((o) => {
        const k = o.mes + '/' + o.ano;
        const a = (agregado[k] ||= { total: 0, nota: 0, interno: 0 });
        a.total += num(o.valor_total);
        a.nota = a.nota != null && o.valor_nota != null ? a.nota + num(o.valor_nota) : null;
        a.interno = a.interno != null && o.valor_interno != null ? a.interno + num(o.valor_interno) : null;
      });
      todosOS = Object.keys(agregado).map((k) => {
        const p = k.split('/');
        return { mes: parseInt(p[0]), ano: parseInt(p[1]), valor_total: agregado[k].total, valor_nota: agregado[k].nota, valor_interno: agregado[k].interno };
      });
    }
  }

  // Rótulo do card (para tipo dinâmico, sobre todo o período carregado).
  const aggAll = agregarCardsPecas(todosItens, filtroCategoria, fixed);

  const resultados: HistoricoMesPonto[] = meses.map((m) => {
    const itensMes = todosItens.filter((it) => it.mes === m.mes && it.ano === m.ano);
    const agg = agregarCardsPecas(itensMes, filtroCategoria, fixed);
    const osMes = todosOS.find((o) => o.mes === m.mes && o.ano === m.ano);
    const totalOS = osMes ? num(osMes.valor_total) : 0;
    let valor: number, custo: number;
    if (catKey === 'totalPecas') { valor = agg.totalPecas; custo = agg.totalCusto; }
    // Serviços: só COM NFS-e (fallback total de OS enquanto o split não veio) —
    // mesma régua do card no dashboard.
    else if (catKey === 'servico') { valor = osMes && osMes.valor_nota != null ? num(osMes.valor_nota) : totalOS; custo = 0; }
    // Total Geral = peças + serviços COM NOTA (fallback: total de OS quando o split falta)
    else if (catKey === 'totalGeral') { valor = agg.totalPecas + (osMes && osMes.valor_nota != null ? num(osMes.valor_nota) : totalOS); custo = agg.totalCusto; }
    else { const b = agg.porKey[catKey]; valor = b?.valor || 0; custo = b?.custo || 0; }
    const pedidosUnicos = new Set(itensMes.map((it) => it.numero_pedido).filter(Boolean)).size;
    const ponto: HistoricoMesPonto = { label: m.label, mes: m.mes, ano: m.ano, valor, custo, qtdePedidos: pedidosUnicos };
    if (catKey === 'servico') {
      ponto.valorNota = osMes ? (osMes.valor_nota == null ? null : num(osMes.valor_nota)) : null;
      ponto.valorInterno = osMes ? (osMes.valor_interno == null ? null : num(osMes.valor_interno)) : null;
    }
    return ponto;
  });

  let nomeCard: string;
  if (catKey === 'totalPecas') nomeCard = 'Total Pecas';
  else if (catKey === 'servico') nomeCard = 'Servicos';
  else if (catKey === 'totalGeral') nomeCard = 'Total Geral Servicos + Pecas';
  else nomeCard = aggAll.porKey[catKey]?.nome || catKey;

  const ehMesCorrente = ehMesAtual(now.getMonth() + 1, now.getFullYear());
  const totalDU = ehMesCorrente ? diasUteisDoMes(now.getFullYear(), now.getMonth() + 1) : 0;
  const transcorridoDU = ehMesCorrente ? diasUteisAteHoje(now.getFullYear(), now.getMonth() + 1) : 0;
  const proporcao = ehMesCorrente && totalDU > 0 ? transcorridoDU / totalDU : 1;
  return { catKey, nome: nomeCard, meses: resultados, proporcao, diasUteisTranscorridos: transcorridoDU };
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
  /** Só nas listagens que selecionam a coluna (usado pelo CMC do próprio mês). */
  mes?: number | null;
}

const semCmcCodigos = (rows: VendaRow[]): string[] =>
  [...new Set(rows.filter((v) => !(num(v.cmc_unitario) > 0)).map((v) => v.codigo_produto).filter(Boolean))] as string[];

/** `mes = null` (ano inteiro): varre os 12 meses do cmc_historico, cada linha com o CMC do SEU mês. */
async function enriquecerCmc(rows: VendaRow[], mes: number | null, ano: number, conta: ContaFiltro): Promise<void> {
  let semCmc = semCmcCodigos(rows);
  if (semCmc.length === 0) return;
  const meses = mes != null ? [mes] : Array.from({ length: 12 }, (_, i) => i + 1);
  for (const m of meses) {
    const cmcMesMap = await preCarregarCMCPorMes(semCmc, m, ano, conta ?? CONTA_DEFAULT);
    rows.forEach((v) => {
      if (num(v.cmc_unitario) > 0) return;
      if (v.mes != null && v.mes !== m) return;
      if (cmcMesMap[String(v.codigo_produto)] > 0) v.cmc_unitario = cmcMesMap[String(v.codigo_produto)];
    });
    semCmc = semCmcCodigos(rows);
    if (semCmc.length === 0) return;
  }
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

// Lote das buscas de apoio (descrição/tipo). 200 em vez de 50 corta 4x as
// idas ao Supabase — decisivo no "Ano inteiro", que traz milhares de linhas.
const LOTE_LOOKUP = 200;

async function enriquecerDescricao(rows: VendaRow[], conta: ContaFiltro): Promise<void> {
  const codigos = [...new Set(rows.map((v) => v.codigo_produto).filter(Boolean))] as string[];
  if (codigos.length === 0) return;
  const descMap: Record<string, string> = {};
  for (let i = 0; i < codigos.length; i += LOTE_LOOKUP) {
    const lote = codigos.slice(i, i + LOTE_LOOKUP);
    const { data: prods } = await filtroConta(
      supabase.from('Produtos_Completos').select('id_omie,Descricao_Produto').in('id_omie', lote.map((c) => parseInt(c))),
      conta,
    );
    if (prods) (prods as Array<{ id_omie: unknown; Descricao_Produto?: string }>).forEach((p) => { if (p.Descricao_Produto) descMap[String(p.id_omie)] = p.Descricao_Produto; });
  }
  rows.forEach((v) => { if (v.codigo_produto && descMap[v.codigo_produto]) v.descricao = descMap[v.codigo_produto]; });
}

/** Vendas detalhadas do período (`mes = null` → ano inteiro), com filtro de card/categoria e enriquecimento. */
export async function listarVendas(
  mes: number | null,
  ano: number,
  catKey: string | null,
  categoria: string | null,
  conta: ContaFiltro,
  familiaMaquina: string | null = null,
): Promise<VendaRow[]> {
  const fixed = await getFixedCats();
  const { codigos: codigosIgnorar } = await getIgnorarFiltro(conta);

  let vendas: VendaRow[] = [];
  let offset = 0;
  while (true) {
    let q = filtroConta(
      supabase
        .from('vendas_itens')
        .select('mes,numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,tipo,familia,codigo_categoria,cmc_unitario')
        .eq('ano', ano),
      conta,
    );
    if (mes != null) q = (q as typeof q).eq('mes', mes);
    if (codigosIgnorar.length > 0) q = (q as typeof q).not('codigo_cliente', 'in', '(' + codigosIgnorar.join(',') + ')');
    // `id` como desempate: sem ele a paginação por data_pedido (muitas linhas na
    // mesma data) pode repetir/pular registros entre páginas — visível no ano inteiro.
    const { data } = await q
      .order('data_pedido', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
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
    for (let ti = 0; ti < codsEnriquecer.length; ti += LOTE_LOOKUP) {
      const loteTipo = codsEnriquecer.slice(ti, ti + LOTE_LOOKUP);
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

  // "Total Peças" = todo item que classifica em algum card de peça (mesma régua
  // do classificador dos cards → soma dos cards === Total Peças).
  const ehTotalPecas = (v: VendaRow): boolean => classificarCardPeca(v, fixed) !== null;

  if (familiaMaquina) {
    // Drill do card de máquina: só as vendas de máquina daquela família (mesma
    // régua classificarGrupo dos cards). '__TODAS__' = todas as máquinas.
    vendas = vendas.filter(
      (v) => classificarGrupo(v.familia || '') === 'maquina' && (familiaMaquina === '__TODAS__' || v.familia === familiaMaquina),
    );
  } else if (catKey) {
    if (catKey === 'servico') {
      vendas = [];
    } else if (catKey === 'totalPecas' || catKey === 'totalGeral') {
      vendas = vendas.filter(ehTotalPecas);
    } else {
      // card de peça (fix:* ou tipo:*): mesmo classificador da agregação
      vendas = vendas.filter((v) => classificarCardPeca(v, fixed)?.key === catKey);
    }
  } else {
    vendas = vendas.filter((v) => classificarCardPeca(v, fixed) !== null);
  }

  if (categoria) {
    const codigosFiltro = expandirCategoriaFiltro(categoria);
    if (codigosFiltro) vendas = vendas.filter((v) => codigosFiltro.includes(v.codigo_categoria || ''));
  }

  await enriquecerCmc(vendas, mes, ano, conta);
  return vendas;
}

// ====================== /api/dashboard/pedido-itens ======================

/** `mes = 0/null` (ano inteiro): não filtra por mês; o CMC sai do próprio mês de cada linha. */
export async function listarPedidoItens(
  numeroPedido: string,
  mes: number | null,
  ano: number,
  conta: ContaFiltro,
): Promise<VendaRow[]> {
  let q = filtroConta(
    supabase
      .from('vendas_itens')
      .select('mes,numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,tipo,familia,codigo_categoria,cmc_unitario')
      .eq('numero_pedido', numeroPedido),
    conta,
  );
  if (mes) q = (q as typeof q).eq('mes', mes);
  if (ano) q = (q as typeof q).eq('ano', ano);
  const { data } = await q;
  const itens = (data || []) as VendaRow[];
  if (itens.length === 0) return itens;

  await enriquecerDescricao(itens, conta);
  if (ano) await enriquecerCmc(itens, mes || null, ano, conta);
  return itens;
}

// ====================== /api/dashboard/compras ======================
// "Comprei" usa a MESMA solução da tela Cruzamento de Família (`comprasPecasMes`):
// lê as entradas de NF e mantém só o que é PEÇA (família por código+SKU +
// classificarGrupo). Assim o valor e a lista batem com a "Entrada Peça" de lá.

export type CompraRow = CompraPecaItem;

/** Itens de compra de PEÇAS do período (para a listagem "ver itens"). */
export async function listarCompras(mes: number, ano: number, conta: ContaFiltro): Promise<CompraRow[]> {
  return (await comprasPecasMes(mes, ano, conta)).itens;
}

/** Valor comprado de PEÇAS no período (card "Comprei"). `diaCorte` = period-to-date. */
export async function somarComprasPecas(mes: number, ano: number, conta: ContaFiltro, diaCorte: number | null = null): Promise<number> {
  return (await comprasPecasMes(mes, ano, conta, diaCorte)).total;
}

// ====================== /api/dashboard/tendencia ======================

export interface TendenciaPonto {
  label: string;
  mes: number;
  ano: number;
  /** Faturamento do mês por bloco. */
  pecas: number;
  servicos: number;
  maquinas: number;
  /** Unidades de máquina vendidas no mês (rótulo do gráfico de máquinas). */
  maquinasUn: number;
  /** Peças + Serviços do MESMO mês do ano anterior (linha fantasma YoY). 0 se não houver. */
  psAnoAnt: number;
  /** Compras (entradas) de peças do mês — sparkline do card "Entradas" + razão. */
  compras: number;
}

interface TendItem extends ItemVenda {
  mes: number;
  ano: number;
  numero_pedido?: string | null;
}

/**
 * Tendência dos últimos 12 meses (até o mês atual): faturamento de PEÇAS,
 * SERVIÇOS e MÁQUINAS por mês. Lê só o banco (vendas_itens + os_mensal) e reusa
 * `agregarCardsPecas`/`agregarMaquinas` (mesma régua dos cards). Respeita a conta;
 * "Todas" soma NOVA+CASTRO (os_mensal agregado por mês).
 */
export async function montarTendencia(conta: ContaFiltro): Promise<TendenciaPonto[]> {
  const fixed = await getFixedCats();

  const now = new Date();
  // Monta 24 meses (para o YoY: cada um dos 12 exibidos precisa do mesmo mês do
  // ano anterior). Só os últimos 12 são retornados.
  const meses: Array<{ mes: number; ano: number; label: string }> = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear(), label: MESES_CURTO[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) });
  }
  const anos = [...new Set(meses.map((m) => m.ano))];

  // Vendas (peças + máquinas) dos anos envolvidos.
  let itens: TendItem[] = [];
  for (const ano of anos) {
    let offset = 0;
    while (true) {
      const { data } = await filtroConta(
        supabase
          .from('vendas_itens')
          .select('mes,ano,tipo,familia,valor_total,cmc_unitario,quantidade,codigo_categoria,numero_pedido')
          .eq('ano', ano),
        conta,
      )
        .order('mes', { ascending: true })
        .order('numero_pedido', { ascending: true })
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      itens = itens.concat(data as TendItem[]);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  // Serviços = SÓ COM NFS-e (os_mensal.valor_nota, fallback valor_total enquanto
  // o split não veio) — mesma régua do card. Agrega as contas quando "Todas".
  const osPorMes: Record<string, number> = {};
  for (const ano of anos) {
    const { data } = await filtroConta(supabase.from('os_mensal').select('mes,ano,valor_total,valor_nota').eq('ano', ano), conta);
    (data as Array<{ mes: number; ano: number; valor_total: unknown; valor_nota: unknown }> | null)?.forEach((o) => {
      const k = o.mes + '/' + o.ano;
      osPorMes[k] = (osPorMes[k] || 0) + (o.valor_nota != null ? num(o.valor_nota) : num(o.valor_total));
    });
  }

  // Calcula peças/serviços/máquinas de TODOS os 24 meses (para o YoY).
  const porMes = new Map<string, { pecas: number; servicos: number; maquinas: number; maquinasUn: number }>();
  for (const m of meses) {
    const itensMes = itens.filter((it) => it.mes === m.mes && it.ano === m.ano);
    const pecas = agregarCardsPecas(itensMes, null, fixed).totalPecas;
    const maq = agregarMaquinas(itensMes);
    porMes.set(m.mes + '/' + m.ano, {
      pecas,
      servicos: osPorMes[m.mes + '/' + m.ano] || 0,
      maquinas: maq.reduce((s, x) => s + x.receita, 0),
      maquinasUn: maq.reduce((s, x) => s + x.unidades, 0),
    });
  }

  // Compras (entradas) de peças por mês — só dos 12 exibidos (sparkline + razão).
  const ultimos = meses.slice(-12);
  const comprasPorMes = await Promise.all(ultimos.map((m) => somarComprasPecas(m.mes, m.ano, conta)));

  // Retorna só os últimos 12, cada um com o Peças+Serviços do mesmo mês do ano anterior.
  return ultimos.map((m, i) => {
    const d = porMes.get(m.mes + '/' + m.ano)!;
    const ant = porMes.get(m.mes + '/' + (m.ano - 1));
    return {
      label: m.label,
      mes: m.mes,
      ano: m.ano,
      pecas: d.pecas,
      servicos: d.servicos,
      maquinas: d.maquinas,
      maquinasUn: d.maquinasUn,
      psAnoAnt: ant ? ant.pecas + ant.servicos : 0,
      compras: comprasPorMes[i],
    };
  });
}
