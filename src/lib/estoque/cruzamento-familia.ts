// Cruzamento mensal por família: estoque atual (saldo + valor) × entradas do mês
// (notas_entrada) × saídas do mês (vendas_itens), agregados por família.
//
// Fonte única da família = tabela `produtos` (familia_nome). As entradas não têm
// família nativa, então resolvemos via código do produto; as vendas também são
// reconciliadas pela mesma fonte (fallback para vendas_itens.familia) para que as
// três colunas casem na mesma família. Estoque é o SALDO ATUAL (snapshot do
// último sync) — não há histórico mensal de saldo.

import { supabase, filtroConta } from './supabase';
import { getIgnorarFiltro } from './ignorar-clientes';
import type { ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const SEM_FAMILIA = 'Sem família';

export type TipoFamilia = '' | 'pecas' | 'maquinas';
export type Grupo = 'maquina' | 'peca' | 'ignorar';

/**
 * Classifica a família em grupo. Regra do cliente:
 *   - "Kit revisão" → ignorar
 *   - "#N/D" / sem família → ignorar
 *   - contém "peça" → peça
 *   - tudo o resto → máquina
 */
export function classificarGrupo(familia: string): Grupo {
  const fam = norm(familia);
  if (!fam || fam === 'nd' || fam === 'n/d' || fam === '#n/d' || fam.includes('sem famil') || fam.includes('sem nome') || fam.includes('indefinid')) {
    return 'ignorar';
  }
  if (fam.includes('kit') && fam.includes('revis')) return 'ignorar';
  if (fam.includes('peca')) return 'peca';
  return 'maquina';
}

function passaTipo(familia: string, filtro: TipoFamilia): boolean {
  if (!filtro) return true;
  const g = classificarGrupo(familia);
  return filtro === 'maquinas' ? g === 'maquina' : g === 'peca';
}

export interface FamiliaLinha {
  familia: string;
  tipo: Grupo;
  estoque_qtd: number;
  estoque_valor: number;
  entradas_qtd: number;
  entradas_valor: number;
  saidas_qtd: number;
  saidas_valor: number;
}

export interface CruzamentoTotais {
  estoque_qtd: number;
  estoque_valor: number;
  entradas_qtd: number;
  entradas_valor: number;
  saidas_qtd: number;
  saidas_valor: number;
}

export interface CruzamentoResult {
  linhas: FamiliaLinha[];
  totais: CruzamentoTotais;
  mes: number;
  ano: number;
  entradasSemFamilia: number; // nº de itens de entrada sem código casado na tabela produtos
}

interface Acc {
  estoque_qtd: number;
  estoque_valor: number;
  entradas_qtd: number;
  entradas_valor: number;
  saidas_qtd: number;
  saidas_valor: number;
}

function novoAcc(): Acc {
  return { estoque_qtd: 0, estoque_valor: 0, entradas_qtd: 0, entradas_valor: 0, saidas_qtd: 0, saidas_valor: 0 };
}

// A tabela `produtos` grava conta_omie em MINÚSCULO; filtroConta usa o valor cru
// (maiúsculo). Por isso o filtro de conta de produtos é feito à parte.
function aplicarContaProdutos<T>(query: T, conta: ContaFiltro): T {
  if (!conta) return query;
  return (query as { eq(c: string, v: string): T }).eq('conta_omie', String(conta).toLowerCase());
}

/**
 * Carrega a base de produtos: agrega o estoque atual por família e devolve o
 * mapa código→família (fonte única para reconciliar entradas e vendas).
 */
async function carregarProdutos(conta: ContaFiltro): Promise<{
  estoquePorFamilia: Record<string, { qtd: number; valor: number }>;
  famPorCodigo: Record<string, string>;
}> {
  const estoquePorFamilia: Record<string, { qtd: number; valor: number }> = {};
  const famPorCodigo: Record<string, string> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await aplicarContaProdutos(
      supabase.from('produtos').select('codigo_produto,familia_nome,estoque,valor_estoque'),
      conta,
    ).range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; familia_nome: unknown; estoque: unknown; valor_estoque: unknown }>;
    for (const p of lote) {
      const cod = String(p.codigo_produto);
      const fam = String(p.familia_nome ?? '').trim() || SEM_FAMILIA;
      famPorCodigo[cod] = fam;
      const qtd = num(p.estoque);
      const valor = num(p.valor_estoque);
      if (!estoquePorFamilia[fam]) estoquePorFamilia[fam] = { qtd: 0, valor: 0 };
      estoquePorFamilia[fam].qtd += qtd;
      estoquePorFamilia[fam].valor += valor;
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { estoquePorFamilia, famPorCodigo };
}

/** Saídas do mês = vendas_itens (qtd + valor_total), por família. */
async function carregarSaidas(
  mes: number,
  ano: number,
  conta: ContaFiltro,
  famPorCodigo: Record<string, string>,
): Promise<Record<string, { qtd: number; valor: number }>> {
  const porFamilia: Record<string, { qtd: number; valor: number }> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await filtroConta(
      supabase
        .from('vendas_itens')
        .select('codigo_produto,familia,quantidade,valor_total')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    ).range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; familia: unknown; quantidade: unknown; valor_total: unknown }>;
    for (const v of lote) {
      const cod = String(v.codigo_produto ?? '');
      const fam = famPorCodigo[cod] || (String(v.familia ?? '').trim() || SEM_FAMILIA);
      if (!porFamilia[fam]) porFamilia[fam] = { qtd: 0, valor: 0 };
      porFamilia[fam].qtd += num(v.quantidade);
      porFamilia[fam].valor += num(v.valor_total);
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return porFamilia;
}

/** Entradas do mês = itens das notas_entrada, com família resolvida pelo código. */
async function carregarEntradas(
  mes: number,
  ano: number,
  conta: ContaFiltro,
  famPorCodigo: Record<string, string>,
): Promise<{ porFamilia: Record<string, { qtd: number; valor: number }>; semFamilia: number }> {
  const porFamilia: Record<string, { qtd: number; valor: number }> = {};
  let semFamilia = 0;

  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;

  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('itens').eq('mes', mes).eq('ano', ano);
    query = filtroConta(query, conta);
    query = query.or('cancelada.is.null,cancelada.eq.false'); // ignora só as explicitamente canceladas
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ itens: unknown }>;
    for (const nota of lote) {
      const itens = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of itens) {
        const cod = String(it.codigo_produto ?? '');
        const fam = famPorCodigo[cod];
        const chave = fam || SEM_FAMILIA;
        if (!fam) semFamilia++;
        if (!porFamilia[chave]) porFamilia[chave] = { qtd: 0, valor: 0 };
        porFamilia[chave].qtd += num(it.quantidade);
        porFamilia[chave].valor += num(it.valor_total);
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { porFamilia, semFamilia };
}

export async function cruzamentoPorFamilia(
  filtros: { mes: number; ano: number; tipo?: TipoFamilia },
  conta: ContaFiltro,
): Promise<CruzamentoResult> {
  const { mes, ano } = filtros;
  const tipo = filtros.tipo || '';

  const { estoquePorFamilia, famPorCodigo } = await carregarProdutos(conta);
  const [saidas, entradas] = await Promise.all([
    carregarSaidas(mes, ano, conta, famPorCodigo),
    carregarEntradas(mes, ano, conta, famPorCodigo),
  ]);

  // União das famílias das três fontes.
  const acc: Record<string, Acc> = {};
  const garantir = (fam: string): Acc => (acc[fam] ||= novoAcc());

  for (const [fam, v] of Object.entries(estoquePorFamilia)) {
    const a = garantir(fam);
    a.estoque_qtd += v.qtd;
    a.estoque_valor += v.valor;
  }
  for (const [fam, v] of Object.entries(entradas.porFamilia)) {
    const a = garantir(fam);
    a.entradas_qtd += v.qtd;
    a.entradas_valor += v.valor;
  }
  for (const [fam, v] of Object.entries(saidas)) {
    const a = garantir(fam);
    a.saidas_qtd += v.qtd;
    a.saidas_valor += v.valor;
  }

  let linhas: FamiliaLinha[] = Object.entries(acc).map(([familia, a]) => ({
    familia,
    tipo: classificarGrupo(familia),
    estoque_qtd: a.estoque_qtd,
    estoque_valor: a.estoque_valor,
    entradas_qtd: a.entradas_qtd,
    entradas_valor: a.entradas_valor,
    saidas_qtd: a.saidas_qtd,
    saidas_valor: a.saidas_valor,
  }));

  if (tipo) linhas = linhas.filter((l) => passaTipo(l.familia, tipo));

  linhas.sort((a, b) => b.estoque_valor - a.estoque_valor || a.familia.localeCompare(b.familia));

  const totais: CruzamentoTotais = linhas.reduce<CruzamentoTotais>((t, l) => {
    t.estoque_qtd += l.estoque_qtd;
    t.estoque_valor += l.estoque_valor;
    t.entradas_qtd += l.entradas_qtd;
    t.entradas_valor += l.entradas_valor;
    t.saidas_qtd += l.saidas_qtd;
    t.saidas_valor += l.saidas_valor;
    return t;
  }, { estoque_qtd: 0, estoque_valor: 0, entradas_qtd: 0, entradas_valor: 0, saidas_qtd: 0, saidas_valor: 0 });

  return { linhas, totais, mes, ano, entradasSemFamilia: entradas.semFamilia };
}

// ===========================================================================
// Série mensal (gráfico): valor de Estoque Peça, Estoque Máquina, NF Entrada e
// NF Saída, mês a mês.
//
// NF Entrada = soma de valor_nf das notas de entrada do mês (valor total da nota).
// NF Saída   = soma de valor_total das vendas do mês.
// Estoque    = RECONSTRUÍDO a partir do saldo atual, caminhando para trás:
//              estoque_fim(m-1) = estoque_fim(m) − entradas_a_custo(m) + COGS(m).
//              Aproximado: ignora ajustes/devoluções manuais e usa o CMC atual.
// ===========================================================================

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function labelMes(mes: number, ano: number): string {
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

/** Últimos `n` meses (incluindo o atual), em ordem cronológica crescente. */
export function ultimosMeses(n: number): Array<{ mes: number; ano: number }> {
  const out: Array<{ mes: number; ano: number }> = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  return out;
}

export interface PontoMensal {
  periodo: string;
  mes: number;
  ano: number;
  estoque_peca: number;
  estoque_maquina: number;
  nf_entrada: number;
  nf_saida: number;
}

export interface SerieMensalResult {
  pontos: PontoMensal[];
  estoqueAtual: { peca: number; maquina: number };
}

/** Notas de entrada de um mês: total da nota (valor_nf) + custo de entrada por grupo. */
async function notasDoMes(
  mes: number,
  ano: number,
  conta: ContaFiltro,
  famPorCodigo: Record<string, string>,
  escaped: string | null,
): Promise<{ nfTotal: number; custoPeca: number; custoMaq: number }> {
  let nfTotal = 0, custoPeca = 0, custoMaq = 0;
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('valor_nf,itens').eq('mes', mes).eq('ano', ano);
    query = filtroConta(query, conta);
    query = query.or('cancelada.is.null,cancelada.eq.false');
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ valor_nf: unknown; itens: unknown }>;
    for (const nota of lote) {
      nfTotal += num(nota.valor_nf);
      const itens = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of itens) {
        const cod = String(it.codigo_produto ?? '');
        const g = classificarGrupo(famPorCodigo[cod] || '');
        const v = num(it.valor_total);
        if (g === 'peca') custoPeca += v;
        else if (g === 'maquina') custoMaq += v;
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { nfTotal, custoPeca, custoMaq };
}

/** Vendas de um mês: total faturado (valor_total) + COGS (cmc×qtd) por grupo. */
async function vendasDoMes(
  mes: number,
  ano: number,
  conta: ContaFiltro,
  famPorCodigo: Record<string, string>,
): Promise<{ nfTotal: number; cogsPeca: number; cogsMaq: number }> {
  let nfTotal = 0, cogsPeca = 0, cogsMaq = 0;
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await filtroConta(
      supabase
        .from('vendas_itens')
        .select('codigo_produto,familia,quantidade,valor_total,cmc_unitario')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    ).range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; familia: unknown; quantidade: unknown; valor_total: unknown; cmc_unitario: unknown }>;
    for (const v of lote) {
      nfTotal += num(v.valor_total);
      const cod = String(v.codigo_produto ?? '');
      const fam = famPorCodigo[cod] || String(v.familia ?? '');
      const g = classificarGrupo(fam);
      const cogs = num(v.cmc_unitario) * num(v.quantidade);
      if (g === 'peca') cogsPeca += cogs;
      else if (g === 'maquina') cogsMaq += cogs;
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { nfTotal, cogsPeca, cogsMaq };
}

export async function serieMensal(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
): Promise<SerieMensalResult> {
  const { estoquePorFamilia, famPorCodigo } = await carregarProdutos(conta);

  // Estoque atual por grupo (valor).
  let estPeca = 0, estMaq = 0;
  for (const [fam, v] of Object.entries(estoquePorFamilia)) {
    const g = classificarGrupo(fam);
    if (g === 'peca') estPeca += v.valor;
    else if (g === 'maquina') estMaq += v.valor;
  }

  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;

  // Fluxos mês a mês (nota + venda do mesmo mês em paralelo; meses em série).
  const fluxo: Array<{ m: { mes: number; ano: number }; nota: Awaited<ReturnType<typeof notasDoMes>>; venda: Awaited<ReturnType<typeof vendasDoMes>> }> = [];
  for (const m of meses) {
    const [nota, venda] = await Promise.all([
      notasDoMes(m.mes, m.ano, conta, famPorCodigo, escaped),
      vendasDoMes(m.mes, m.ano, conta, famPorCodigo),
    ]);
    fluxo.push({ m, nota, venda });
  }

  // Reconstrução para trás a partir do estoque atual (último mês = mais recente).
  const k = fluxo.length;
  const pecaArr = new Array<number>(k).fill(0);
  const maqArr = new Array<number>(k).fill(0);
  if (k > 0) { pecaArr[k - 1] = estPeca; maqArr[k - 1] = estMaq; }
  for (let i = k - 1; i >= 1; i--) {
    pecaArr[i - 1] = Math.max(0, pecaArr[i] - fluxo[i].nota.custoPeca + fluxo[i].venda.cogsPeca);
    maqArr[i - 1] = Math.max(0, maqArr[i] - fluxo[i].nota.custoMaq + fluxo[i].venda.cogsMaq);
  }

  const pontos: PontoMensal[] = fluxo.map((f, i) => ({
    periodo: labelMes(f.m.mes, f.m.ano),
    mes: f.m.mes,
    ano: f.m.ano,
    estoque_peca: Math.round(pecaArr[i]),
    estoque_maquina: Math.round(maqArr[i]),
    nf_entrada: Math.round(f.nota.nfTotal),
    nf_saida: Math.round(f.venda.nfTotal),
  }));

  return { pontos, estoqueAtual: { peca: estPeca, maquina: estMaq } };
}
