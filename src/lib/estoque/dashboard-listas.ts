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
  ehPecaVenda,
  CATEGORIAS_AGRUPADAS,
  type ItemVenda,
  type FixedCats,
} from './categorias';
import { classificarGrupo, comprasPecasMes, type CompraPecaItem } from './cruzamento-familia';
import { preCarregarCMCPorMes } from './vendas-sync';
import { getIgnorarFiltro } from './ignorar-clientes';
import { comCacheResumo } from './resumo-cache';
import { diasUteis } from './historico-grade';
import { localSP, feriadosNacionais, feriadosExtras } from '@/lib/assistente/horario';
import { MESES_CURTO } from './utils';
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
  /** Linhas de item (produto) do card no mês. */
  qtdeItens: number;
  /** Só no card Serviços: COM NFS-e a partir dos ITENS das OS, por tipo de serviço. null = sem a RPC. */
  servItens?: ServicosMes | null;
  /** Só no card Serviços: split OS com NFS-e × internas (null quando os_mensal ainda não tem o split). */
  valorNota?: number | null;
  valorInterno?: number | null;
  /** Só no card Serviços: contagem de OS do mês (toggle "Qtd de OS"). null quando os_mensal ainda não tem o count. */
  qtdeOS?: number | null;
  qtdeNota?: number | null;
  qtdeInterno?: number | null;
}

export interface HistoricoResult {
  catKey: string;
  nome: string;
  meses: HistoricoMesPonto[];
  /** Mês corrente (horário de Brasília): dias úteis FECHADOS (antes de hoje) e do mês, com feriados — base da projeção. */
  diasUteisMes: { ano: number; mes: number; decorridos: number; total: number };
  /** Vista "Semanas" (segunda a domingo, desde 2024). null = RPCs semanais ainda não aplicadas (sql/dashboard-semanas.sql). */
  semanas: HistoricoSemanaPonto[] | null;
}

export interface HistoricoSemanaPonto {
  /** Segunda-feira da semana, 'YYYY-MM-DD'. */
  inicio: string;
  valor: number;
  custo: number;
  qtdePedidos: number;
  qtdeItens: number;
  servItens?: ServicosMes | null;
}

export type TipoServicoGrade = 'HR' | 'KM' | 'SEM_CODIGO' | 'OUTRO';
export interface ServicosParte { valor: number; os: number; itens: number }
export interface ServicosMes extends ServicosParte { porTipo: Record<TipoServicoGrade, ServicosParte> }

interface HistItem extends ItemVenda {
  mes: number;
  ano: number;
  /** Pedidos distintos da linha (1 na leitura crua; vários na linha agrupada da RPC). */
  pedidos: string[];
  /** Linhas de item que a linha representa (1 na leitura crua). */
  linhas: number;
}

// 1º ano lido: o histórico mostra desde 2023, mas 2022 entra como base do Δ.
const HIST_DESDE_ANO = 2022;

/**
 * Linhas JÁ AGRUPADAS por conta × mês × família × tipo × categoria (RPC
 * `vendas_resumo_mensal`, sql/vendas-resumo-mensal.sql), no formato de
 * ItemVenda para reaproveitar a classificação dos cards: valor_total = soma,
 * quantidade = 1 e cmc_unitario = custo somado (o card faz cmc × qtd).
 * Exclui os clientes ignorados, como os cards. null = nenhuma das RPCs existe.
 */
async function lerResumoMensal(conta: ContaFiltro): Promise<HistItem[] | null> {
  const { codigos } = await getIgnorarFiltro(conta);
  // 5 min em memória (resumo-cache.ts); o sync limpa ao gravar.
  return comCacheResumo('hist|' + (conta ?? 'todas') + '|' + codigos.join(','), () => consultarResumoMensal(conta, codigos));
}

async function consultarResumoMensal(conta: ContaFiltro, codigos: string[]): Promise<HistItem[] | null> {
  const params = { p_desde_ano: HIST_DESDE_ANO, p_conta: conta ?? null, p_ignorar: codigos.map(String) };
  type Linha = { ano: number; mes: number; familia: string | null; tipo: string | null; codigo_categoria: string | null; valor: number | string; custo: number | string; linhas: number; pedidos: string[] | null };
  const faltando = (e: { code?: string; message: string }, fn: string) => e.code === 'PGRST202' || e.code === '42883' || e.message.includes(fn);

  // 1 ida só (jsonb, sql/vendas-resumo-mensal-json.sql); sem ela, a RPC em
  // tabela paginada de 1000 (o banco refaz a soma a cada página).
  let linhas: Linha[] = [];
  const j = await supabase.rpc('vendas_resumo_mensal_json', params);
  if (!j.error) {
    linhas = (j.data || []) as Linha[];
  } else {
    if (!faltando(j.error, 'vendas_resumo_mensal_json')) throw new Error('vendas_resumo_mensal_json: ' + j.error.message);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .rpc('vendas_resumo_mensal', params)
        .order('conta_omie').order('ano').order('mes').order('familia').order('tipo').order('codigo_categoria')
        .range(offset, offset + 999);
      if (error) {
        if (faltando(error, 'vendas_resumo_mensal')) return null;
        throw new Error('vendas_resumo_mensal: ' + error.message);
      }
      linhas.push(...((data || []) as Linha[]));
      if (!data || data.length < 1000) break;
    }
  }
  return linhas.map((l) => ({
    ano: l.ano, mes: l.mes, familia: l.familia, tipo: l.tipo, codigo_categoria: l.codigo_categoria,
    valor_total: num(l.valor), quantidade: 1, cmc_unitario: num(l.custo), pedidos: l.pedidos || [], linhas: num(l.linhas),
  }));
}

/** Caminho antigo (sem a RPC): itens crus de vendas_itens, paginados. */
async function lerItensCrus(anos: number[], conta: ContaFiltro): Promise<HistItem[]> {
  const { codigos } = await getIgnorarFiltro(conta);
  const out: HistItem[] = [];
  for (const ano of anos) {
    for (let offset = 0; ; offset += 1000) {
      let q = filtroConta(
        supabase
          .from('vendas_itens')
          .select('id,mes,ano,tipo,familia,valor_total,numero_pedido,codigo_categoria,cmc_unitario,quantidade')
          .eq('ano', ano),
        conta,
      );
      if (codigos.length > 0) q = q.not('codigo_cliente', 'in', '(' + codigos.join(',') + ')');
      const { data } = await q.order('id').range(offset, offset + 999);
      const linhas = (data || []) as Array<ItemVenda & { mes: number; ano: number; numero_pedido: string | null }>;
      for (const l of linhas) out.push({ ...l, pedidos: l.numero_pedido ? [l.numero_pedido] : [], linhas: 1 });
      if (linhas.length < 1000) break;
    }
  }
  return out;
}

/**
 * Serviços COM NFS-e por mês e tipo (HR / KM / Sem código / Outros), dos itens
 * das OS (RPC servicos_resumo_mensal_json, sql/servicos-codigo-resumo.sql).
 * OS contadas sem repetir (uma OS com HR e KM é 1 OS no total). null = sem a RPC.
 */
type LinhaServico = { conta_omie: string; ano?: number; mes?: number; semana?: string; tipo: TipoServicoGrade; valor: number | string; itens: number; os: number[] | null };

/** Soma as linhas da RPC de serviços por período (chave), contando OS sem repetir. */
function agregarServicos(linhas: LinhaServico[], chave: (l: LinhaServico) => string): Map<string, ServicosMes> {
  const vazio = (): ServicosParte => ({ valor: 0, os: 0, itens: 0 });
  const porPeriodo = new Map<string, ServicosMes & { _os: Set<string> }>();
  for (const l of linhas) {
    const k = chave(l);
    let m = porPeriodo.get(k);
    if (!m) {
      m = { ...vazio(), porTipo: { HR: vazio(), KM: vazio(), SEM_CODIGO: vazio(), OUTRO: vazio() }, _os: new Set() };
      porPeriodo.set(k, m);
    }
    const t = m.porTipo[l.tipo] ?? m.porTipo.OUTRO;
    const os = l.os || [];
    t.valor += num(l.valor); t.itens += num(l.itens); t.os += os.length;
    m.valor += num(l.valor); m.itens += num(l.itens);
    for (const n of os) m._os.add(l.conta_omie + ':' + n);
  }
  const out = new Map<string, ServicosMes>();
  for (const [k, m] of porPeriodo) out.set(k, { valor: m.valor, itens: m.itens, os: m._os.size, porTipo: m.porTipo });
  return out;
}

/** Chama uma RPC jsonb do resumo; null quando a função ainda não existe no banco. */
async function rpcResumo<T>(fn: string, params: Record<string, unknown>): Promise<T[] | null> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883' || error.message.includes(fn)) return null;
    throw new Error(fn + ': ' + error.message);
  }
  return (data || []) as T[];
}

/**
 * Serviços COM NFS-e por mês e tipo (HR / KM / Sem código / Outros), dos itens
 * das OS (RPC servicos_resumo_mensal_json, sql/servicos-codigo-resumo.sql).
 * OS contadas sem repetir (uma OS com HR e KM é 1 OS no total). null = sem a RPC.
 */
async function lerServicosPorTipo(conta: ContaFiltro): Promise<Map<string, ServicosMes> | null> {
  const linhas = await comCacheResumo('serv|' + (conta ?? 'todas'), () =>
    rpcResumo<LinhaServico>('servicos_resumo_mensal_json', { p_desde_ano: HIST_DESDE_ANO, p_conta: conta ?? null }));
  return linhas ? agregarServicos(linhas, (l) => l.ano + '-' + l.mes) : null;
}

// Semanas: desde 2024 (a de 2025/2026 tem base do ano anterior).
const SEMANAS_DESDE = '2024-01-01';

async function lerServicosSemanal(conta: ContaFiltro): Promise<Map<string, ServicosMes> | null> {
  const linhas = await comCacheResumo('serv-sem|' + (conta ?? 'todas'), () =>
    rpcResumo<LinhaServico>('servicos_resumo_semanal_json', { p_desde: SEMANAS_DESDE, p_conta: conta ?? null }));
  return linhas ? agregarServicos(linhas, (l) => String(l.semana)) : null;
}

/** Vendas por semana × família × tipo × categoria (RPC vendas_resumo_semanal_json), no formato de HistItem. */
async function lerResumoSemanal(conta: ContaFiltro): Promise<Array<HistItem & { semana: string }> | null> {
  const { codigos } = await getIgnorarFiltro(conta);
  type Linha = { semana: string; familia: string | null; tipo: string | null; codigo_categoria: string | null; valor: number | string; custo: number | string; linhas: number; pedidos: string[] | null };
  const linhas = await comCacheResumo('sem|' + (conta ?? 'todas') + '|' + codigos.join(','), () =>
    rpcResumo<Linha>('vendas_resumo_semanal_json', { p_desde: SEMANAS_DESDE, p_conta: conta ?? null, p_ignorar: codigos.map(String) }));
  if (!linhas) return null;
  return linhas.map((l) => ({
    semana: l.semana, mes: 0, ano: 0, familia: l.familia, tipo: l.tipo, codigo_categoria: l.codigo_categoria,
    valor_total: num(l.valor), quantidade: 1, cmc_unitario: num(l.custo), pedidos: l.pedidos || [], linhas: num(l.linhas),
  }));
}

/** Valor/custo/pedidos/itens de UM card (ou Total Peças) num conjunto de linhas de um período. */
function somarCard(itens: HistItem[], catKey: string, filtroCategoria: string | null, fixed: FixedCats) {
  const agg = agregarCardsPecas(itens, filtroCategoria, fixed);
  const total = catKey === 'totalPecas' || catKey === 'totalGeral' || catKey === 'servico';
  const b = total ? null : agg.porKey[catKey];
  const codigosFiltro = expandirCategoriaFiltro(filtroCategoria);
  const pedidos = new Set<string>();
  let linhas = 0;
  for (const it of itens) {
    if (codigosFiltro && !codigosFiltro.includes(it.codigo_categoria || '')) continue;
    const card = classificarCardPeca(it, fixed);
    if (!card || (!total && card.key !== catKey)) continue;
    it.pedidos.forEach((n) => pedidos.add(n));
    linhas += it.linhas;
  }
  return {
    valor: total ? agg.totalPecas : b?.valor || 0,
    custo: total ? agg.totalCusto : b?.custo || 0,
    pedidos: pedidos.size,
    itens: linhas,
  };
}

/**
 * Pontos semanais do card. Peças pelo dia de faturamento; Serviços (e a parte de
 * serviços do Total Geral) pelos ITENS das OS com NFS-e — os_mensal não tem dia.
 * null quando falta alguma RPC semanal.
 */
async function montarSemanasHistorico(catKey: string, filtroCategoria: string | null, conta: ContaFiltro, fixed: FixedCats): Promise<HistoricoSemanaPonto[] | null> {
  const querPecas = catKey !== 'servico';
  const querServ = catKey === 'servico' || catKey === 'totalGeral';
  const [pecas, serv] = await Promise.all([
    querPecas ? lerResumoSemanal(conta) : Promise.resolve(null),
    querServ ? lerServicosSemanal(conta) : Promise.resolve(null),
  ]);
  if ((querPecas && !pecas) || (querServ && !serv)) return null;
  const porSemana = new Map<string, HistItem[]>();
  for (const it of pecas || []) {
    const lista = porSemana.get(it.semana);
    if (lista) lista.push(it); else porSemana.set(it.semana, [it]);
  }
  const chaves = [...new Set([...porSemana.keys(), ...(serv ? serv.keys() : [])])].sort();
  return chaves.map((inicio) => {
    const p = querPecas ? somarCard(porSemana.get(inicio) || [], catKey, filtroCategoria, fixed) : { valor: 0, custo: 0, pedidos: 0, itens: 0 };
    const s = serv?.get(inicio) ?? null;
    const ponto: HistoricoSemanaPonto = {
      inicio,
      valor: p.valor + (querServ ? s?.valor ?? 0 : 0),
      custo: p.custo,
      qtdePedidos: p.pedidos,
      qtdeItens: p.itens,
    };
    if (catKey === 'servico') ponto.servItens = s ?? { valor: 0, os: 0, itens: 0, porTipo: { HR: { valor: 0, os: 0, itens: 0 }, KM: { valor: 0, os: 0, itens: 0 }, SEM_CODIGO: { valor: 0, os: 0, itens: 0 }, OUTRO: { valor: 0, os: 0, itens: 0 } } };
    return ponto;
  });
}

/** Histórico mês a mês (desde Jan/2022 — a tela mostra desde 2023) de um card específico (por chave). */
export async function montarHistorico(
  catKey: string,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<HistoricoResult> {
  const fixed = await getFixedCats();

  const now = new Date();
  const meses: Array<{ mes: number; ano: number; label: string }> = [];
  const d = new Date(HIST_DESDE_ANO, 0, 1);
  while (d <= now) {
    meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear(), label: MESES_CURTO[d.getMonth()] + '/' + d.getFullYear() });
    d.setMonth(d.getMonth() + 1);
  }

  const anos = [...new Set(meses.map((m) => m.ano))];
  // Semanas em paralelo (RPCs próprias, também no cache); erro nelas não derruba os meses.
  const semanasP = montarSemanasHistorico(catKey, filtroCategoria, conta, fixed).catch((e) => {
    console.log('[historico] semanas: ' + (e as Error).message);
    return null;
  });
  const todosItens: HistItem[] = (await lerResumoMensal(conta)) ?? (await lerItensCrus(anos, conta));

  type OSMensalRow = { mes: number; ano: number; valor_total: number; valor_nota: number | null; valor_interno: number | null; qtde_os: number | null; qtde_os_nota: number | null; qtde_os_interno: number | null };
  let todosOS: OSMensalRow[] = [];
  if (catKey === 'servico' || catKey === 'totalGeral') {
    for (const ano of anos) {
      const { data } = await filtroConta(supabase.from('os_mensal').select('mes,ano,valor_total,valor_nota,valor_interno,qtde_os,qtde_os_nota,qtde_os_interno').eq('ano', ano), conta);
      if (data) todosOS = todosOS.concat(data as OSMensalRow[]);
    }
    if (!conta) {
      // "Todas": soma por mês; split/count só quando TODAS as contas do mês têm o valor (senão null).
      const agregado: Record<string, { total: number; nota: number | null; interno: number | null; qtde: number | null; qtdeNota: number | null; qtdeInterno: number | null }> = {};
      todosOS.forEach((o) => {
        const k = o.mes + '/' + o.ano;
        const a = (agregado[k] ||= { total: 0, nota: 0, interno: 0, qtde: 0, qtdeNota: 0, qtdeInterno: 0 });
        a.total += num(o.valor_total);
        a.nota = a.nota != null && o.valor_nota != null ? a.nota + num(o.valor_nota) : null;
        a.interno = a.interno != null && o.valor_interno != null ? a.interno + num(o.valor_interno) : null;
        a.qtde = a.qtde != null && o.qtde_os != null ? a.qtde + num(o.qtde_os) : null;
        a.qtdeNota = a.qtdeNota != null && o.qtde_os_nota != null ? a.qtdeNota + num(o.qtde_os_nota) : null;
        a.qtdeInterno = a.qtdeInterno != null && o.qtde_os_interno != null ? a.qtdeInterno + num(o.qtde_os_interno) : null;
      });
      todosOS = Object.keys(agregado).map((k) => {
        const p = k.split('/');
        return { mes: parseInt(p[0]), ano: parseInt(p[1]), valor_total: agregado[k].total, valor_nota: agregado[k].nota, valor_interno: agregado[k].interno, qtde_os: agregado[k].qtde, qtde_os_nota: agregado[k].qtdeNota, qtde_os_interno: agregado[k].qtdeInterno };
      });
    }
  }

  // Rótulo do card (para tipo dinâmico, sobre todo o período carregado).
  const aggAll = agregarCardsPecas(todosItens, filtroCategoria, fixed);

  const servPorTipo = catKey === 'servico' ? await lerServicosPorTipo(conta) : null;
  const SERV_VAZIO = (): ServicosMes => ({ valor: 0, os: 0, itens: 0, porTipo: { HR: { valor: 0, os: 0, itens: 0 }, KM: { valor: 0, os: 0, itens: 0 }, SEM_CODIGO: { valor: 0, os: 0, itens: 0 }, OUTRO: { valor: 0, os: 0, itens: 0 } } });
  const resultados: HistoricoMesPonto[] = meses.map((m) => {
    const itensMes = todosItens.filter((it) => it.mes === m.mes && it.ano === m.ano);
    // Peças do card (Total Peças/Total Geral = todas). Pedidos = só os que têm item
    // DESTE card (no app antigo era o mês inteiro, com máquinas).
    const p = somarCard(itensMes, catKey, filtroCategoria, fixed);
    const osMes = todosOS.find((o) => o.mes === m.mes && o.ano === m.ano);
    const totalOS = osMes ? num(osMes.valor_total) : 0;
    // Serviços: só COM NFS-e (fallback total de OS enquanto o split não veio) — mesma régua do card.
    const servNota = osMes && osMes.valor_nota != null ? num(osMes.valor_nota) : totalOS;
    const valor = catKey === 'servico' ? servNota : catKey === 'totalGeral' ? p.valor + servNota : p.valor;
    const custo = catKey === 'servico' ? 0 : p.custo;
    const ponto: HistoricoMesPonto = { label: m.label, mes: m.mes, ano: m.ano, valor, custo, qtdePedidos: p.pedidos, qtdeItens: p.itens };
    if (catKey === 'servico') {
      ponto.servItens = servPorTipo ? (servPorTipo.get(m.ano + '-' + m.mes) ?? SERV_VAZIO()) : null;
      ponto.valorNota = osMes ? (osMes.valor_nota == null ? null : num(osMes.valor_nota)) : null;
      ponto.valorInterno = osMes ? (osMes.valor_interno == null ? null : num(osMes.valor_interno)) : null;
      ponto.qtdeOS = osMes ? (osMes.qtde_os == null ? null : num(osMes.qtde_os)) : null;
      ponto.qtdeNota = osMes ? (osMes.qtde_os_nota == null ? null : num(osMes.qtde_os_nota)) : null;
      ponto.qtdeInterno = osMes ? (osMes.qtde_os_interno == null ? null : num(osMes.qtde_os_interno)) : null;
    }
    return ponto;
  });

  let nomeCard: string;
  if (catKey === 'totalPecas') nomeCard = 'Total Pecas';
  else if (catKey === 'servico') nomeCard = 'Servicos';
  else if (catKey === 'totalGeral') nomeCard = 'Total Geral Servicos + Pecas';
  else nomeCard = aggAll.porKey[catKey]?.nome || catKey;

  const hojeSP = localSP(new Date());
  const feriados = new Set([...feriadosNacionais(hojeSP.ano), ...feriadosExtras()]);
  const diasUteisMes = {
    ano: hojeSP.ano,
    mes: hojeSP.mes,
    decorridos: diasUteis(hojeSP.ano, hojeSP.mes, feriados, hojeSP.dia - 1),
    total: diasUteis(hojeSP.ano, hojeSP.mes, feriados),
  };
  return { catKey, nome: nomeCard, meses: resultados, diasUteisMes, semanas: await semanasP };
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
  /** Cliente + conta: usados pela coluna "NF" do popup de vendas (resolve o DANFE). */
  codigo_cliente?: number | string | null;
  nome_cliente?: string | null;
  conta_omie?: string | null;
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

/** Preenche `nome_cliente` vazio a partir do cadastro (portal_nt_clientes_cadastro_omie), sem Omie.
 *  `vendas_itens.nome_cliente` vem sempre vazio (o ListarPedidos da Omie só traz o código),
 *  então resolvemos código → nome como o popup de OS faz (os.ts resolverNomesClientes). */
async function enriquecerNomeCliente(rows: VendaRow[]): Promise<void> {
  const codigos = [...new Set(
    rows.filter((v) => !v.nome_cliente && v.codigo_cliente != null && v.codigo_cliente !== '')
      .map((v) => Number(v.codigo_cliente)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  if (codigos.length === 0) return;
  const nomeMap: Record<number, string> = {};
  for (let i = 0; i < codigos.length; i += LOTE_LOOKUP) {
    const { data } = await supabase
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli,nome_fantasia,razao_social')
      .in('cod_cli', codigos.slice(i, i + LOTE_LOOKUP));
    (data as Array<{ cod_cli: unknown; nome_fantasia?: string; razao_social?: string }> | null)?.forEach((cli) => {
      const nome = String(cli.nome_fantasia || cli.razao_social || '').trim();
      if (nome) nomeMap[num(cli.cod_cli)] = nome;
    });
  }
  rows.forEach((v) => {
    const c = Number(v.codigo_cliente);
    if (!v.nome_cliente && nomeMap[c]) v.nome_cliente = nomeMap[c];
  });
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
        .select('mes,numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,tipo,familia,codigo_categoria,cmc_unitario,codigo_cliente,nome_cliente,conta_omie')
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
  await enriquecerNomeCliente(vendas);
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
  /** Fatia de Peças por origem (Balcão = cat 1.01.03; Oficina = resto). pecasBalcao + pecasOficina = pecas. */
  pecasBalcao: number;
  pecasOficina: number;
  servicos: number;
  maquinas: number;
  /** Unidades de máquina vendidas no mês (rótulo do gráfico de máquinas). */
  maquinasUn: number;
  /** Peças + Serviços do MESMO mês do ano anterior (linha fantasma YoY). 0 se não houver. */
  psAnoAnt: number;
  /** Peças + Serviços do MESMO mês de -2 anos (comparativo "Comparar"). 0 se não houver. */
  psAno2Ant: number;
  /** Compras (entradas) de peças do mês — sparkline do card "Entradas" + razão. */
  compras: number;
}

/** Ponto de uma janela comparativa (-1/-2 anos) para o "Comparar" (gráficos abaixo). */
export interface ComparativoPonto {
  label: string;
  mes: number;
  ano: number;
  pecas: number;
  pecasBalcao: number;
  pecasOficina: number;
  servicos: number;
}
export interface TendenciaResult {
  pontos: TendenciaPonto[];
  comparativos: { a1: ComparativoPonto[]; a2: ComparativoPonto[] };
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
export async function montarTendencia(conta: ContaFiltro): Promise<TendenciaResult> {
  const fixed = await getFixedCats();
  // Códigos contábeis de peça "Balcão" (o resto das peças é "Oficina").
  const CAT_BALCAO = new Set(CATEGORIAS_AGRUPADAS['Revenda de Pecas Balcao'] || []);

  const now = new Date();
  // Monta 36 meses: os 12 exibidos precisam do mesmo mês de -1 ano (psAnoAnt) e
  // de -2 anos (psAno2Ant) para o comparativo "Comparar" do gráfico. Só os
  // últimos 12 são retornados.
  const meses: Array<{ mes: number; ano: number; label: string }> = [];
  for (let i = 35; i >= 0; i--) {
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

  // Calcula peças/serviços/máquinas de TODOS os 36 meses (para o YoY / Comparar).
  const porMes = new Map<string, { pecas: number; pecasBalcao: number; pecasOficina: number; servicos: number; maquinas: number; maquinasUn: number }>();
  for (const m of meses) {
    const itensMes = itens.filter((it) => it.mes === m.mes && it.ano === m.ano);
    const pecas = agregarCardsPecas(itensMes, null, fixed).totalPecas;
    // Balcão = itens de peça na categoria 1.01.03; Oficina = total − Balcão (mesma
    // régua de peça do totalPecas, então as duas fatias somam o total exato).
    const pecasBalcao = itensMes.reduce(
      (s, it) => (ehPecaVenda(it) && CAT_BALCAO.has(String(it.codigo_categoria ?? '')) ? s + num(it.valor_total) : s),
      0,
    );
    const maq = agregarMaquinas(itensMes);
    porMes.set(m.mes + '/' + m.ano, {
      pecas,
      pecasBalcao,
      pecasOficina: pecas - pecasBalcao,
      servicos: osPorMes[m.mes + '/' + m.ano] || 0,
      maquinas: maq.reduce((s, x) => s + x.receita, 0),
      maquinasUn: maq.reduce((s, x) => s + x.unidades, 0),
    });
  }

  // Compras (entradas) de peças por mês — só dos 12 exibidos (sparkline + razão).
  const ultimos = meses.slice(-12);
  const comprasPorMes = await Promise.all(ultimos.map((m) => somarComprasPecas(m.mes, m.ano, conta)));

  // Últimos 12, cada um com Peças+Serviços do mesmo mês de -1 e -2 anos.
  const pontos: TendenciaPonto[] = ultimos.map((m, i) => {
    const d = porMes.get(m.mes + '/' + m.ano)!;
    const ant = porMes.get(m.mes + '/' + (m.ano - 1));
    const ant2 = porMes.get(m.mes + '/' + (m.ano - 2));
    return {
      label: m.label,
      mes: m.mes,
      ano: m.ano,
      pecas: d.pecas,
      pecasBalcao: d.pecasBalcao,
      pecasOficina: d.pecasOficina,
      servicos: d.servicos,
      maquinas: d.maquinas,
      maquinasUn: d.maquinasUn,
      psAnoAnt: ant ? ant.pecas + ant.servicos : 0,
      psAno2Ant: ant2 ? ant2.pecas + ant2.servicos : 0,
      compras: comprasPorMes[i],
    };
  });

  // "Comparar": janelas de 12 meses anteriores (para desenhar os gráficos abaixo).
  const janela = (arr: Array<{ mes: number; ano: number; label: string }>): ComparativoPonto[] =>
    arr.map((m) => {
      const d = porMes.get(m.mes + '/' + m.ano);
      return {
        label: m.label, mes: m.mes, ano: m.ano,
        pecas: d?.pecas ?? 0,
        pecasBalcao: d?.pecasBalcao ?? 0,
        pecasOficina: d?.pecasOficina ?? 0,
        servicos: d?.servicos ?? 0,
      };
    });
  const comparativos = { a1: janela(meses.slice(-24, -12)), a2: janela(meses.slice(-36, -24)) };

  return { pontos, comparativos };
}
