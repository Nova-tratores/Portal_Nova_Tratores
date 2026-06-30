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

/** Classifica uma família como máquina ou peça (mesma heurística da Curva ABC/Giro). */
export function classificarTipo(familia: string): 'maquina' | 'peca' {
  const fam = norm(familia);
  if (fam.includes('maquina') || fam.includes('trator') || fam.includes('implemento') || fam.includes('agricul')) {
    return 'maquina';
  }
  return 'peca';
}

function passaTipo(familia: string, filtro: TipoFamilia): boolean {
  if (!filtro) return true;
  const t = classificarTipo(familia);
  return filtro === 'maquinas' ? t === 'maquina' : t === 'peca';
}

export interface FamiliaLinha {
  familia: string;
  tipo: 'maquina' | 'peca';
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
    tipo: classificarTipo(familia),
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
