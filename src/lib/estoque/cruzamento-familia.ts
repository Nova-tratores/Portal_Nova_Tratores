// Cruzamento mensal por família: estoque atual (saldo + valor) × entradas do mês
// (notas_entrada) × saídas do mês (vendas_itens), agregados por família.
//
// Fonte única da família = tabela `produtos` (familia_nome). As entradas não têm
// família nativa, então resolvemos via código interno do produto
// (item.nfProdInt.nCodProd); as vendas são reconciliadas pela mesma fonte
// (fallback para vendas_itens.familia). Estoque é o SALDO ATUAL (snapshot do
// último sync) — não há histórico mensal de saldo.

import { supabase, filtroConta } from './supabase';
import { getIgnorarFiltro } from './ignorar-clientes';
import { buscarCategoriasOmie } from './notas-entrada';
import { buscarPosicaoEstoqueBulkOmie } from './produtos-sync';
import { CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const SEM_FAMILIA = 'Sem família';
const SEM_CATEGORIA = 'Sem categoria';
const SEM_TIPO = 'Sem tipo';
const SNAPSHOT_TABLE = 'estoque_familia_snapshot';
const SNAPSHOT_TIPO_TABLE = 'estoque_tipo_snapshot';

export type TipoFamilia = '' | 'pecas' | 'maquinas';
export type Grupo = 'maquina' | 'peca' | 'ignorar';
export type Dimensao = 'tipo' | 'categoria' | 'familia' | 'tipocarac';

/**
 * Classifica a família em grupo. Regra do cliente:
 *   - "Kit revisão" / "Ativo imobilizado" → ignorar
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
  if (fam.includes('ativo') && fam.includes('imobiliz')) return 'ignorar';
  if (fam.includes('peca')) return 'peca';
  return 'maquina';
}

function passaTipo(familia: string, filtro: TipoFamilia): boolean {
  if (!filtro) return true;
  const g = classificarGrupo(familia);
  return filtro === 'maquinas' ? g === 'maquina' : g === 'peca';
}

/** Extrai código interno, descrição, qtd e valor de um item de nota de entrada
 *  (estrutura crua do Omie: item.prod.* + item.nfProdInt.nCodProd). */
function parseItemEntrada(it: Record<string, unknown>): { codigo: string; sku: string; descricao: string; qtd: number; valor: number } {
  const prod = (it.prod ?? null) as Record<string, unknown> | null;
  if (prod) {
    const nf = (it.nfProdInt ?? {}) as Record<string, unknown>;
    // nCodProd = id interno Omie (0 quando o item não foi vinculado a um produto);
    // cProd = código do fornecedor/SKU. Tratamos 0/'' como "sem id interno".
    const nCod = nf.nCodProd != null ? String(nf.nCodProd) : '';
    return {
      codigo: nCod && nCod !== '0' ? nCod : '',
      sku: String(prod.cProd ?? ''),
      descricao: String(prod.xProd ?? ''),
      qtd: num(prod.qCom),
      valor: num(prod.vProd ?? prod.vTotItem),
    };
  }
  // Fallback p/ formatos planos antigos.
  return {
    codigo: String(it.codigo_produto ?? ''),
    sku: String(it.codigo ?? it.sku ?? ''),
    descricao: String(it.descricao ?? ''),
    qtd: num(it.quantidade),
    valor: num(it.valor_total),
  };
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
  famPorSKU: Record<string, string>;
}> {
  const estoquePorFamilia: Record<string, { qtd: number; valor: number }> = {};
  const famPorCodigo: Record<string, string> = {};
  const famPorSKU: Record<string, string> = {}; // produtos.codigo (SKU, minúsculo) → família
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await aplicarContaProdutos(
      supabase.from('produtos').select('codigo_produto,codigo,familia_nome,estoque,valor_estoque'),
      conta,
    ).order('codigo_produto').order('conta_omie').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; codigo: unknown; familia_nome: unknown; estoque: unknown; valor_estoque: unknown }>;
    for (const p of lote) {
      const cod = String(p.codigo_produto);
      const fam = String(p.familia_nome ?? '').trim() || SEM_FAMILIA;
      famPorCodigo[cod] = fam;
      const sku = String(p.codigo ?? '').trim().toLowerCase();
      if (sku) famPorSKU[sku] = fam;
      const qtd = num(p.estoque);
      const valor = num(p.valor_estoque);
      if (!estoquePorFamilia[fam]) estoquePorFamilia[fam] = { qtd: 0, valor: 0 };
      estoquePorFamilia[fam].qtd += qtd;
      estoquePorFamilia[fam].valor += valor;
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { estoquePorFamilia, famPorCodigo, famPorSKU };
}

// Parser flexível: aceita DD/MM/YYYY (Omie) e ISO. null se vazio/inválido.
function parseDataFlex(s: unknown): Date | null {
  const str = String(s ?? '').trim();
  if (!str) return null;
  if (str.includes('/')) {
    const p = str.split('/');
    if (p.length === 3) { const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])); return isNaN(d.getTime()) ? null : d; }
    return null;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Movimento de máquina em demonstração (remessa em aberto ou já devolvida). */
interface DemoMov { valor: number; saida: Date; entrada: Date | null }

/**
 * Máquinas em demonstração/consignação (CFOP 5.912/6.912): o Omie zera o saldo
 * físico da máquina ao emitir a remessa, então ela some de `produtos.estoque`.
 * Aqui recuperamos essas máquinas de `movimentacao_produtos` (mesma fonte da
 * tela /visual-estoque/remessas e /conferencia-custos) para somar de volta ao
 * "Estoque Máquina". Devolve os movimentos com data de saída e de retorno para
 * a reconstrução mês a mês (uma máquina conta enquanto estava fora naquele fim
 * de mês). Valor = valor_unitario da remessa (ou cmc como fallback) × qtde.
 */
async function carregarDemoMaquinas(conta: ContaFiltro): Promise<DemoMov[]> {
  // 1) movimentos de demonstração (fora agora = Pendente; já devolvidos têm data_entrada)
  const movs: Array<Record<string, unknown>> = [];
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let q = supabase.from('movimentacao_produtos')
      .select('cod_produto,status,data_saida,data_entrada,valor_unitario,qtde,conta_omie')
      .in('status', ['Pendente', 'Devolvida'])
      .order('id');
    if (conta) q = q.eq('conta_omie', String(conta).toLowerCase());
    const { data, error } = await q.range(offset, offset + LOTE - 1);
    if (error) return movs.length ? finalizarDemo(movs, conta) : []; // tabela ausente → sem demo
    const lote = (data || []) as Array<Record<string, unknown>>;
    movs.push(...lote);
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return finalizarDemo(movs, conta);
}

async function finalizarDemo(movs: Array<Record<string, unknown>>, conta: ContaFiltro): Promise<DemoMov[]> {
  if (movs.length === 0) return [];
  // 2) join com produtos (família p/ classificar máquina, cmc fallback, arquivado)
  const cods = [...new Set(movs.map((m) => Number(m.cod_produto)).filter((n) => !isNaN(n)))];
  const prod = new Map<string, { familia: string; cmc: number; arquivado: boolean; conta: string }>();
  for (let i = 0; i < cods.length; i += 500) {
    const batch = cods.slice(i, i + 500);
    let q = supabase.from('produtos').select('codigo_produto,familia_nome,cmc,arquivado,conta_omie').in('codigo_produto', batch);
    q = aplicarContaProdutos(q, conta);
    const { data } = await q;
    for (const p of (data || []) as Array<Record<string, unknown>>) {
      const c = String(p.conta_omie ?? '').toLowerCase();
      prod.set(`${c}:${p.codigo_produto}`, {
        familia: String(p.familia_nome ?? '').trim() || SEM_FAMILIA,
        cmc: num(p.cmc), arquivado: !!p.arquivado, conta: c,
      });
    }
  }
  const out: DemoMov[] = [];
  for (const m of movs) {
    const c = String(m.conta_omie ?? '').toLowerCase();
    const p = prod.get(`${c}:${Number(m.cod_produto)}`);
    if (!p || p.arquivado) continue;
    if (classificarGrupo(p.familia) !== 'maquina') continue;
    const saida = parseDataFlex(m.data_saida);
    if (!saida) continue;
    const vu = num(m.valor_unitario);
    const valor = (vu > 0 ? vu : p.cmc) * (num(m.qtde) || 1);
    if (valor <= 0) continue;
    const entrada = String(m.status) === 'Devolvida' ? parseDataFlex(m.data_entrada) : null;
    out.push({ valor, saida, entrada });
  }
  return out;
}

/** Σ do valor das máquinas em demonstração que estavam FORA no instante `ref`. */
function demoForaEm(demo: DemoMov[], ref: Date): number {
  let s = 0;
  for (const d of demo) if (d.saida <= ref && (d.entrada == null || d.entrada > ref)) s += d.valor;
  return s;
}

/** Resolve a família de um item de entrada: id interno (nCodProd) → SKU (cProd). */
function resolverFamiliaEntrada(
  codigo: string,
  sku: string,
  famPorCodigo: Record<string, string>,
  famPorSKU: Record<string, string>,
): string {
  return famPorCodigo[codigo] || (sku ? famPorSKU[sku.trim().toLowerCase()] : '') || '';
}

/**
 * Mapa codigo_produto(interno) → "Tipo" (característica) da tabela `produto_tipo`,
 * só onde preenchido. É a classificação que a empresa mantém manualmente
 * (ex.: Anel, Filtros, Retentor…). `produto_tipo.conta_omie` é MAIÚSCULO.
 */
async function carregarTipoCaracteristica(conta: ContaFiltro): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await filtroConta(
      supabase.from('produto_tipo').select('codigo_produto,tipo').not('tipo', 'is', null).neq('tipo', ''),
      conta,
    ).order('codigo_produto').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; tipo: unknown }>;
    for (const r of lote) {
      const cod = String(r.codigo_produto ?? '');
      const tp = String(r.tipo ?? '').trim();
      if (cod && tp) mapa[cod] = tp;
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return mapa;
}

/**
 * Saldo atual de estoque (qtd + valor) das PEÇAS, agregado pela característica
 * "Tipo" (tabela produto_tipo). Peça sem Tipo cai no bucket SEM_TIPO. Máquinas e
 * famílias ignoradas ficam de fora. Fonte do saldo: tabela `produtos`.
 */
async function carregarEstoquePorTipo(conta: ContaFiltro): Promise<Record<string, { qtd: number; valor: number }>> {
  const tipoPorCodigo = await carregarTipoCaracteristica(conta);
  const porTipo: Record<string, { qtd: number; valor: number }> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await aplicarContaProdutos(
      supabase.from('produtos').select('codigo_produto,familia_nome,estoque,valor_estoque'),
      conta,
    ).order('codigo_produto').order('conta_omie').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ codigo_produto: unknown; familia_nome: unknown; estoque: unknown; valor_estoque: unknown }>;
    for (const p of lote) {
      const fam = String(p.familia_nome ?? '').trim() || SEM_FAMILIA;
      if (classificarGrupo(fam) !== 'peca') continue; // só Peças
      const cod = String(p.codigo_produto);
      const tipo = tipoPorCodigo[cod] || SEM_TIPO;
      if (!porTipo[tipo]) porTipo[tipo] = { qtd: 0, valor: 0 };
      porTipo[tipo].qtd += num(p.estoque);
      porTipo[tipo].valor += num(p.valor_estoque);
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return porTipo;
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
    ).order('codigo_produto').range(offset, offset + LOTE - 1);
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
  famPorSKU: Record<string, string>,
): Promise<{ porFamilia: Record<string, { qtd: number; valor: number }>; semFamilia: number }> {
  const porFamilia: Record<string, { qtd: number; valor: number }> = {};
  let semFamilia = 0;

  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;

  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('itens').eq('mes', mes).eq('ano', ano).order('ncod_nf');
    query = filtroConta(query, conta);
    // NÃO filtrar por `cancelada`: é string ("" ou data de cancelamento), não bool;
    // a listagem (listarNotasEntrada) também não filtra. Ver memória.
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ itens: unknown }>;
    for (const nota of lote) {
      const itens = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of itens) {
        const { codigo, sku, qtd, valor } = parseItemEntrada(it);
        const fam = resolverFamiliaEntrada(codigo, sku, famPorCodigo, famPorSKU);
        const chave = fam || SEM_FAMILIA;
        if (!fam) semFamilia++;
        if (!porFamilia[chave]) porFamilia[chave] = { qtd: 0, valor: 0 };
        porFamilia[chave].qtd += qtd;
        porFamilia[chave].valor += valor;
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

  const { estoquePorFamilia, famPorCodigo, famPorSKU } = await carregarProdutos(conta);
  const [saidas, entradas] = await Promise.all([
    carregarSaidas(mes, ano, conta, famPorCodigo),
    carregarEntradas(mes, ano, conta, famPorCodigo, famPorSKU),
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

  let linhas: FamiliaLinha[] = Object.entries(acc)
    .filter(([familia]) => classificarGrupo(familia) !== 'ignorar')
    .map(([familia, a]) => ({
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
// Série mensal (gráfico): Estoque Peça/Máquina + NF Entrada/Saída quebrados por
// "tipo" (peça/máquina) OU por "categoria" Omie. Mês a mês.
//
// NF Entrada = soma do valor dos itens das notas do mês (≈ valor da nota).
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

export interface SerieDef { key: string; label: string; cor: string; dash?: boolean; soTabela?: boolean }
export interface PontoMensal {
  periodo: string;
  mes: number;
  ano: number;
  [key: string]: number | string; // estoque_peca, estoque_maquina + chaves dinâmicas das séries
}

export interface SerieMensalResult {
  pontos: PontoMensal[];
  series: SerieDef[];
  dimensao: Dimensao;
  estoqueAtual: { peca: number; maquina: number };
}

// Paleta para categorias (cor = categoria; entrada = linha cheia, saída = tracejada).
const PALETA_CAT = ['#2563eb', '#d97706', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const COR_OUTRAS = '#9ca3af';
const MAX_CATEGORIAS = 6;

/** Fluxos de um mês (nota + venda), com quebra por grupo e por categoria. */
interface FluxoMes {
  // por grupo (peça/máquina) — usado p/ estoque e p/ modo "tipo"
  entradaPeca: number; entradaMaq: number;
  cogsPeca: number; cogsMaq: number;
  saidaPeca: number; saidaMaq: number;
  // por categoria
  entradaPorCat: Record<string, number>;
  saidaPorCat: Record<string, number>;
  // por família
  entradaPorFam: Record<string, number>;
  saidaPorFam: Record<string, number>;
  // por "Tipo" (característica manual, tabela produto_tipo)
  entradaPorTipoCarac: Record<string, number>;
  saidaPorTipoCarac: Record<string, number>;
}

async function notasDoMes(
  mes: number, ano: number, conta: ContaFiltro,
  famPorCodigo: Record<string, string>, famPorSKU: Record<string, string>,
  tipoPorCodigo: Record<string, string>, escaped: string | null,
): Promise<{ entradaPeca: number; entradaMaq: number; entradaPorCat: Record<string, number>; entradaPorFam: Record<string, number>; entradaPorTipoCarac: Record<string, number> }> {
  let entradaPeca = 0, entradaMaq = 0;
  const entradaPorCat: Record<string, number> = {};
  const entradaPorFam: Record<string, number> = {};
  const entradaPorTipoCarac: Record<string, number> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('categoria,itens').eq('mes', mes).eq('ano', ano).order('ncod_nf');
    query = filtroConta(query, conta);
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ categoria: unknown; itens: unknown }>;
    for (const nota of lote) {
      const cat = String(nota.categoria ?? '').trim() || SEM_CATEGORIA;
      const itens = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of itens) {
        const { codigo, sku, valor } = parseItemEntrada(it);
        const fam = resolverFamiliaEntrada(codigo, sku, famPorCodigo, famPorSKU);
        const g = classificarGrupo(fam);
        if (g === 'peca') entradaPeca += valor;
        else if (g === 'maquina') entradaMaq += valor;
        // categoria/família/tipo: só conta o que não é ignorado (mesma base do "tipo")
        if (g !== 'ignorar') {
          entradaPorCat[cat] = (entradaPorCat[cat] || 0) + valor;
          entradaPorFam[fam] = (entradaPorFam[fam] || 0) + valor;
          const tc = tipoPorCodigo[codigo] || SEM_TIPO;
          entradaPorTipoCarac[tc] = (entradaPorTipoCarac[tc] || 0) + valor;
        }
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { entradaPeca, entradaMaq, entradaPorCat, entradaPorFam, entradaPorTipoCarac };
}

async function vendasDoMes(
  mes: number, ano: number, conta: ContaFiltro,
  famPorCodigo: Record<string, string>, catMap: Record<string, string>,
  tipoPorCodigo: Record<string, string>,
): Promise<{ cogsPeca: number; cogsMaq: number; saidaPeca: number; saidaMaq: number; saidaPorCat: Record<string, number>; saidaPorFam: Record<string, number>; saidaPorTipoCarac: Record<string, number> }> {
  let cogsPeca = 0, cogsMaq = 0, saidaPeca = 0, saidaMaq = 0;
  const saidaPorCat: Record<string, number> = {};
  const saidaPorFam: Record<string, number> = {};
  const saidaPorTipoCarac: Record<string, number> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await filtroConta(
      supabase
        .from('vendas_itens')
        .select('codigo_produto,familia,quantidade,valor_total,cmc_unitario,codigo_categoria')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    ).order('codigo_produto').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const cod = String(v.codigo_produto ?? '');
      const fam = famPorCodigo[cod] || String(v.familia ?? '');
      const g = classificarGrupo(fam);
      const valor = num(v.valor_total);
      const cogs = num(v.cmc_unitario) * num(v.quantidade);
      if (g === 'peca') { cogsPeca += cogs; saidaPeca += valor; }
      else if (g === 'maquina') { cogsMaq += cogs; saidaMaq += valor; }
      if (g !== 'ignorar') {
        const cod_cat = String(v.codigo_categoria ?? '');
        const cat = catMap[cod_cat] || (cod_cat ? cod_cat : SEM_CATEGORIA);
        saidaPorCat[cat] = (saidaPorCat[cat] || 0) + valor;
        saidaPorFam[fam] = (saidaPorFam[fam] || 0) + valor;
        const tc = tipoPorCodigo[cod] || SEM_TIPO;
        saidaPorTipoCarac[tc] = (saidaPorTipoCarac[tc] || 0) + valor;
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { cogsPeca, cogsMaq, saidaPeca, saidaMaq, saidaPorCat, saidaPorFam, saidaPorTipoCarac };
}

// ===========================================================================
// Snapshot mensal de estoque por família (tabela estoque_familia_snapshot).
// Como não há histórico de saldo na Omie, congelamos o valor atual a cada
// captura. O cron grava o mês corrente; quando o mês vira, a última captura
// daquele mês fica como "fim de mês". Substitui a reconstrução para trás (que
// inflava o estoque de máquina, pois compras de máquina não passam por NF).
// ===========================================================================

async function upsertSnapshot(
  conta: Conta,
  mes: number,
  ano: number,
  estoquePorFamilia: Record<string, { qtd: number; valor: number }>,
): Promise<number> {
  const contaLow = String(conta).toLowerCase();
  const rows = Object.entries(estoquePorFamilia)
    .filter(([, v]) => v.qtd !== 0 || v.valor !== 0)
    .map(([familia, v]) => ({ conta_omie: contaLow, ano, mes, familia, estoque_qtd: v.qtd, estoque_valor: v.valor }));
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(SNAPSHOT_TABLE).upsert(rows.slice(i, i + 500), { onConflict: 'conta_omie,ano,mes,familia' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Captura/atualiza o snapshot do mês (default: mês atual) para uma conta. */
export async function capturarSnapshotMensal(
  conta: Conta,
  mes?: number,
  ano?: number,
): Promise<{ conta: Conta; mes: number; ano: number; familias: number }> {
  const now = new Date();
  const m = mes ?? now.getMonth() + 1;
  const a = ano ?? now.getFullYear();
  const { estoquePorFamilia } = await carregarProdutos(conta);
  const familias = await upsertSnapshot(conta, m, a, estoquePorFamilia);
  return { conta, mes: m, ano: a, familias };
}

/** Grava/atualiza o snapshot de estoque por Tipo (tabela estoque_tipo_snapshot). */
async function upsertSnapshotTipo(
  conta: Conta,
  mes: number,
  ano: number,
  estoquePorTipo: Record<string, { qtd: number; valor: number }>,
): Promise<number> {
  const contaLow = String(conta).toLowerCase();
  const rows = Object.entries(estoquePorTipo)
    .filter(([, v]) => v.qtd !== 0 || v.valor !== 0)
    .map(([tipo, v]) => ({ conta_omie: contaLow, ano, mes, tipo, estoque_qtd: v.qtd, estoque_valor: v.valor }));
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(SNAPSHOT_TIPO_TABLE).upsert(rows.slice(i, i + 500), { onConflict: 'conta_omie,ano,mes,tipo' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Captura/atualiza o snapshot do mês (default: atual) por Tipo, para uma conta. */
export async function capturarSnapshotTipoMensal(
  conta: Conta,
  mes?: number,
  ano?: number,
): Promise<{ conta: Conta; mes: number; ano: number; tipos: number }> {
  const now = new Date();
  const m = mes ?? now.getMonth() + 1;
  const a = ano ?? now.getFullYear();
  const estoquePorTipo = await carregarEstoquePorTipo(conta);
  const tipos = await upsertSnapshotTipo(conta, m, a, estoquePorTipo);
  return { conta, mes: m, ano: a, tipos };
}

// --- Backfill do histórico real de estoque via posição-por-data na Omie ---

const MAX_MESES_BACKFILL = 60; // teto de segurança

/** Último dia do mês em DD/MM/YYYY; para o mês corrente usa hoje. */
function ultimoDiaMesBR(mes: number, ano: number): string {
  const now = new Date();
  if (mes === now.getMonth() + 1 && ano === now.getFullYear()) {
    const dd = String(now.getDate()).padStart(2, '0');
    return `${dd}/${String(mes).padStart(2, '0')}/${ano}`;
  }
  const ultimo = new Date(ano, mes, 0).getDate(); // dia 0 do mês seguinte = último deste
  return `${String(ultimo).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

export interface BackfillSnapshotStatus {
  rodando: boolean;
  conta?: Conta;
  total?: number;
  processados?: number;
  mesAtual?: string;
  linhasGravadas?: number;
  ultimoErro?: string | null;
  finalizadoEm?: string | null;
}
const backfillSnapStatus: Record<string, BackfillSnapshotStatus> = {};

export function getBackfillSnapshotStatus(conta?: Conta): Record<string, BackfillSnapshotStatus> {
  if (conta) return { [conta]: backfillSnapStatus[conta] || { rodando: false } };
  return backfillSnapStatus;
}

/**
 * Backfill do snapshot histórico: para cada mês de `desde` até o mês atual,
 * consulta a posição de estoque na Omie no fim do mês e grava por família.
 */
export async function backfillSnapshotsHistoricos(
  conta: Conta,
  desde: { ano: number; mes: number },
  ate?: { ano: number; mes: number },
): Promise<{ conta: Conta; mesesProcessados: number; linhasGravadas: number; erros: number }> {
  const now = new Date();
  // Limite de fim: `ate` quando informado (p/ fatiar em pedaços curtos), senão o mês atual.
  const limA = ate?.ano ?? now.getFullYear();
  const limM = ate?.mes ?? now.getMonth() + 1;
  const meses: Array<{ mes: number; ano: number }> = [];
  let y = desde.ano, m = desde.mes;
  while ((y < limA || (y === limA && m <= limM)) && meses.length < MAX_MESES_BACKFILL) {
    meses.push({ mes: m, ano: y });
    m++; if (m > 12) { m = 1; y++; }
  }

  const st: BackfillSnapshotStatus = { rodando: true, conta, total: meses.length, processados: 0, linhasGravadas: 0, ultimoErro: null, finalizadoEm: null };
  backfillSnapStatus[conta] = st;

  // Família atual do cadastro (mapa código → família) + Tipo (produto_tipo).
  const { famPorCodigo } = await carregarProdutos(conta);
  const tipoPorCodigo = await carregarTipoCaracteristica(conta);

  let linhasGravadas = 0, erros = 0;
  for (const mm of meses) {
    st.mesAtual = `${mm.mes}/${mm.ano}`;
    try {
      const data = ultimoDiaMesBR(mm.mes, mm.ano);
      const mapa = await buscarPosicaoEstoqueBulkOmie(conta, data);
      const agg: Record<string, { qtd: number; valor: number }> = {};
      const aggTipo: Record<string, { qtd: number; valor: number }> = {};
      for (const [codigo, { saldo, cmc }] of mapa) {
        const cod = String(codigo);
        const fam = famPorCodigo[cod] || SEM_FAMILIA;
        if (!agg[fam]) agg[fam] = { qtd: 0, valor: 0 };
        agg[fam].qtd += saldo;
        agg[fam].valor += saldo * cmc;
        // Snapshot por Tipo: só Peças (mesma regra de carregarEstoquePorTipo).
        if (classificarGrupo(fam) === 'peca') {
          const tipo = tipoPorCodigo[cod] || SEM_TIPO;
          if (!aggTipo[tipo]) aggTipo[tipo] = { qtd: 0, valor: 0 };
          aggTipo[tipo].qtd += saldo;
          aggTipo[tipo].valor += saldo * cmc;
        }
      }
      const n = await upsertSnapshot(conta, mm.mes, mm.ano, agg);
      await upsertSnapshotTipo(conta, mm.mes, mm.ano, aggTipo);
      linhasGravadas += n;
      st.linhasGravadas = linhasGravadas;
    } catch (e) {
      erros++;
      st.ultimoErro = (e as Error).message;
    }
    st.processados = (st.processados || 0) + 1;
  }

  st.rodando = false;
  st.finalizadoEm = new Date().toISOString();
  return { conta, mesesProcessados: meses.length, linhasGravadas, erros };
}

/** Lê snapshots dos meses pedidos e agrega o valor por grupo (peça/máquina). */
async function lerSnapshotPorMes(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
): Promise<Map<string, { peca: number; maquina: number }>> {
  const map = new Map<string, { peca: number; maquina: number }>();
  const anos = [...new Set(meses.map((m) => m.ano))];
  if (anos.length === 0) return map;
  // Paginação OBRIGATÓRIA + ordem estável: sem isto o PostgREST corta em 1000
  // linhas e o agregado (TODAS) subconta/perde meses inteiros. Ordem pela PK
  // composta garante que range() não pula/repete.
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from(SNAPSHOT_TABLE).select('ano,mes,familia,estoque_valor').in('ano', anos)
      .order('ano').order('mes').order('conta_omie').order('familia');
    if (conta) query = query.eq('conta_omie', String(conta).toLowerCase());
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) {
      // Tabela ainda não criada / sem permissão → trata como "sem snapshots".
      return map;
    }
    const lote = (data || []) as Array<{ ano: number; mes: number; familia: unknown; estoque_valor: unknown }>;
    for (const r of lote) {
      const g = classificarGrupo(String(r.familia ?? ''));
      if (g === 'ignorar') continue;
      const key = `${r.ano}-${r.mes}`;
      const e = map.get(key) || { peca: 0, maquina: 0 };
      if (g === 'peca') e.peca += num(r.estoque_valor);
      else e.maquina += num(r.estoque_valor);
      map.set(key, e);
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return map;
}

/** Lê o snapshot de estoque por Tipo dos meses pedidos: Map<'ano-mes', {tipo: valor}>. */
async function lerSnapshotTipoPorMes(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>();
  const anos = [...new Set(meses.map((m) => m.ano))];
  if (anos.length === 0) return map;
  // Paginação + ordem estável (mesmo motivo de lerSnapshotPorMes: teto 1000).
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from(SNAPSHOT_TIPO_TABLE).select('ano,mes,tipo,estoque_valor').in('ano', anos)
      .order('ano').order('mes').order('conta_omie').order('tipo');
    if (conta) query = query.eq('conta_omie', String(conta).toLowerCase());
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) {
      // Tabela ainda não criada / sem permissão → trata como "sem snapshots".
      return map;
    }
    const lote = (data || []) as Array<{ ano: number; mes: number; tipo: unknown; estoque_valor: unknown }>;
    for (const r of lote) {
      const tipo = String(r.tipo ?? '').trim() || SEM_TIPO;
      const key = `${r.ano}-${r.mes}`;
      const e = map.get(key) || {};
      e[tipo] = (e[tipo] || 0) + num(r.estoque_valor);
      map.set(key, e);
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return map;
}

export interface SerieEstoqueTipoResult {
  pontos: PontoMensal[];
  series: SerieDef[];
  estoqueAtual: Record<string, number>; // saldo atual (valor) por Tipo
}

/**
 * Série mensal do SALDO de estoque (valor R$) das Peças, uma linha por "Tipo".
 * Mês atual = saldo ao vivo (produtos); meses passados = snapshot por Tipo
 * (gap quando sem snapshot). Top 6 Tipos por saldo + "Outras".
 */
export async function serieEstoqueTipo(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
  incluirSemTipo = false,
): Promise<SerieEstoqueTipoResult> {
  const estoquePorTipo = await carregarEstoquePorTipo(conta);
  const estoqueAtual: Record<string, number> = {};
  for (const [tipo, v] of Object.entries(estoquePorTipo)) estoqueAtual[tipo] = Math.round(v.valor);

  const k = meses.length;
  const snapMap = await lerSnapshotTipoPorMes(meses, conta);
  // Semeia/atualiza o snapshot do mês corrente (só quando a conta é específica).
  // Persiste SEMPRE com todos os Tipos (inclui "Sem tipo"); o filtro é só de exibição.
  if (conta && k > 0) {
    try { await upsertSnapshotTipo(conta, meses[k - 1].mes, meses[k - 1].ano, estoquePorTipo); } catch { /* segue sem persistir */ }
  }

  // "Sem tipo" costuma dominar (maioria das peças sem classificação) e achata as
  // demais linhas; por padrão fica fora da exibição (estoqueAtual mantém o valor).
  const exibir = (tipo: string) => incluirSemTipo || tipo !== SEM_TIPO;

  // Tipos a exibir: top 6 por total no período (ao vivo + snapshots) + "Outras".
  const totalPorTipo: Record<string, number> = {};
  for (const [tipo, v] of Object.entries(estoquePorTipo)) { if (exibir(tipo)) totalPorTipo[tipo] = (totalPorTipo[tipo] || 0) + v.valor; }
  for (const rec of snapMap.values()) {
    for (const [tipo, v] of Object.entries(rec)) { if (exibir(tipo)) totalPorTipo[tipo] = (totalPorTipo[tipo] || 0) + v; }
  }
  const ordenados = Object.entries(totalPorTipo).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const top = ordenados.slice(0, MAX_CATEGORIAS);
  const temOutras = ordenados.length > top.length;
  const tipoLista = temOutras ? [...top, 'Outras'] : top;
  const corDe = (idx: number, t: string) => (t === 'Outras' ? COR_OUTRAS : PALETA_CAT[idx % PALETA_CAT.length]);
  const mapTipo = (t: string): string => (top.includes(t) ? t : 'Outras');

  const series: SerieDef[] = tipoLista.map((t, idx) => ({ key: 'estoque::' + t, label: t, cor: corDe(idx, t) }));

  const pontos: PontoMensal[] = meses.map((m, i) => {
    const ponto: PontoMensal = { periodo: labelMes(m.mes, m.ano), mes: m.mes, ano: m.ano };
    const fonte = i === k - 1 ? Object.fromEntries(Object.entries(estoquePorTipo).map(([t, v]) => [t, v.valor])) : snapMap.get(`${m.ano}-${m.mes}`);
    if (fonte) {
      for (const t of tipoLista) ponto['estoque::' + t] = 0;
      for (const [t, v] of Object.entries(fonte)) {
        if (!exibir(t)) continue; // "Sem tipo" oculto não entra (nem em "Outras")
        const key = 'estoque::' + mapTipo(t);
        ponto[key] = Math.round((ponto[key] as number || 0) + v);
      }
    }
    // sem fonte (mês passado sem snapshot) → não define chaves (gap no gráfico)
    return ponto;
  });

  return { pontos, series, estoqueAtual };
}

export async function serieMensal(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
  dimensao: Dimensao = 'tipo',
  incluirDemo = true,
): Promise<SerieMensalResult> {
  const { estoquePorFamilia, famPorCodigo, famPorSKU } = await carregarProdutos(conta);

  // Estoque atual por grupo (valor).
  let estPeca = 0, estMaq = 0;
  for (const [fam, v] of Object.entries(estoquePorFamilia)) {
    const g = classificarGrupo(fam);
    if (g === 'peca') estPeca += v.valor;
    else if (g === 'maquina') estMaq += v.valor;
  }

  // Máquinas em demonstração (fora do saldo físico do Omie) — somadas de volta
  // ao Estoque Máquina, mês a mês, quando o toggle estiver ligado.
  const demo = incluirDemo ? await carregarDemoMaquinas(conta) : [];

  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;
  const catMap = dimensao === 'categoria' ? await buscarCategoriasOmie(conta ?? CONTA_DEFAULT) : {};
  const tipoPorCodigo = dimensao === 'tipocarac' ? await carregarTipoCaracteristica(conta) : {};

  // Fluxos mês a mês (nota + venda do mesmo mês em paralelo; meses em série).
  const fluxos: FluxoMes[] = [];
  for (const m of meses) {
    const [nota, venda] = await Promise.all([
      notasDoMes(m.mes, m.ano, conta, famPorCodigo, famPorSKU, tipoPorCodigo, escaped),
      vendasDoMes(m.mes, m.ano, conta, famPorCodigo, catMap, tipoPorCodigo),
    ]);
    fluxos.push({
      entradaPeca: nota.entradaPeca, entradaMaq: nota.entradaMaq,
      cogsPeca: venda.cogsPeca, cogsMaq: venda.cogsMaq,
      saidaPeca: venda.saidaPeca, saidaMaq: venda.saidaMaq,
      entradaPorCat: nota.entradaPorCat, saidaPorCat: venda.saidaPorCat,
      entradaPorFam: nota.entradaPorFam, saidaPorFam: venda.saidaPorFam,
      entradaPorTipoCarac: nota.entradaPorTipoCarac, saidaPorTipoCarac: venda.saidaPorTipoCarac,
    });
  }

  // Estoque por mês: snapshot persistido (meses passados) + valor AO VIVO no mês
  // atual. Sem snapshot num mês passado → série fica sem ponto (gap). Nada de
  // reconstrução para trás (que inflava o estoque de máquina).
  const k = fluxos.length;
  const snapMap = await lerSnapshotPorMes(meses, conta);
  // Semeia/atualiza o snapshot do mês corrente (só quando a conta é específica).
  if (conta && k > 0) {
    try { await upsertSnapshot(conta, meses[k - 1].mes, meses[k - 1].ano, estoquePorFamilia); } catch { /* segue sem persistir */ }
  }

  // Séries (estoque sempre peça/máquina) + entrada/saída conforme a dimensão.
  const series: SerieDef[] = [
    { key: 'estoque_peca', label: 'Estoque Peça', cor: '#2563eb' },
    { key: 'estoque_maquina', label: 'Estoque Máquina', cor: '#d97706' },
  ];

  const hoje = new Date();
  const pontos: PontoMensal[] = meses.map((m, i) => {
    const ponto: PontoMensal = { periodo: labelMes(m.mes, m.ano), mes: m.mes, ano: m.ano };
    // Faturamento do mês por grupo — campos extra p/ a barra opcional do
    // gráfico; NÃO entram em `series` (não viram linha nem coluna).
    ponto.faturamento_peca = Math.round(fluxos[i]?.saidaPeca ?? 0);
    ponto.faturamento_maquina = Math.round(fluxos[i]?.saidaMaq ?? 0);
    // Máquinas em demonstração que estavam FORA no fim daquele mês (mês atual = hoje).
    const ref = i === k - 1 ? hoje : new Date(m.ano, m.mes, 0, 23, 59, 59);
    const demoMaq = demo.length ? demoForaEm(demo, ref) : 0;
    if (i === k - 1) {
      ponto.estoque_peca = Math.round(estPeca);
      ponto.estoque_maquina = Math.round(estMaq + demoMaq);
    } else {
      const s = snapMap.get(`${m.ano}-${m.mes}`);
      if (s) {
        ponto.estoque_peca = Math.round(s.peca);
        ponto.estoque_maquina = Math.round(s.maquina + demoMaq);
      }
      // sem snapshot → não define as chaves (gap no gráfico)
    }
    return ponto;
  });

  if (dimensao === 'tipo') {
    // Gráfico mostra só as 2 linhas de Estoque (soTabela nas entradas/saídas);
    // a tabela mostra tudo, agrupado: Entrada/Saída/Estoque de Peça, depois Máquina.
    series.length = 0;
    series.push(
      { key: 'nf_entrada_peca', label: 'Entrada Peça', cor: '#16a34a', soTabela: true },
      { key: 'nf_saida_peca', label: 'Saída Peça', cor: '#dc2626', soTabela: true },
      { key: 'estoque_peca', label: 'Estoque Peça', cor: '#2563eb' },
      { key: 'nf_entrada_maquina', label: 'Entrada Máquina', cor: '#16a34a', soTabela: true },
      { key: 'nf_saida_maquina', label: 'Saída Máquina', cor: '#dc2626', soTabela: true },
      { key: 'estoque_maquina', label: 'Estoque Máquina', cor: '#d97706' },
    );
    fluxos.forEach((f, i) => {
      pontos[i].nf_entrada_peca = Math.round(f.entradaPeca);
      pontos[i].nf_entrada_maquina = Math.round(f.entradaMaq);
      pontos[i].nf_saida_peca = Math.round(f.saidaPeca);
      pontos[i].nf_saida_maquina = Math.round(f.saidaMaq);
    });
  } else {
    // categoria / família / tipo (característica): mesma lógica, fontes diferentes.
    const pickEntrada = (f: FluxoMes) => (dimensao === 'familia' ? f.entradaPorFam : dimensao === 'tipocarac' ? f.entradaPorTipoCarac : f.entradaPorCat);
    const pickSaida = (f: FluxoMes) => (dimensao === 'familia' ? f.saidaPorFam : dimensao === 'tipocarac' ? f.saidaPorTipoCarac : f.saidaPorCat);

    // Top itens por total (entrada+saída) no período; resto → "Outras".
    const totalPorCat: Record<string, number> = {};
    for (const f of fluxos) {
      for (const [c, v] of Object.entries(pickEntrada(f))) totalPorCat[c] = (totalPorCat[c] || 0) + v;
      for (const [c, v] of Object.entries(pickSaida(f))) totalPorCat[c] = (totalPorCat[c] || 0) + v;
    }
    const ordenadas = Object.entries(totalPorCat).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const top = ordenadas.slice(0, MAX_CATEGORIAS);
    const temOutras = ordenadas.length > top.length;
    const catLista = temOutras ? [...top, 'Outras'] : top;
    const corDe = (idx: number, cat: string) => (cat === 'Outras' ? COR_OUTRAS : PALETA_CAT[idx % PALETA_CAT.length]);
    const mapCat = (cat: string): string => (top.includes(cat) ? cat : 'Outras');

    catLista.forEach((cat, idx) => {
      series.push({ key: 'entrada::' + cat, label: 'Entrada: ' + cat, cor: corDe(idx, cat) });
      series.push({ key: 'saida::' + cat, label: 'Saída: ' + cat, cor: corDe(idx, cat), dash: true });
    });

    fluxos.forEach((f, i) => {
      for (const cat of catLista) { pontos[i]['entrada::' + cat] = 0; pontos[i]['saida::' + cat] = 0; }
      for (const [c, v] of Object.entries(pickEntrada(f))) {
        const k2 = 'entrada::' + mapCat(c);
        pontos[i][k2] = Math.round((pontos[i][k2] as number || 0) + v);
      }
      for (const [c, v] of Object.entries(pickSaida(f))) {
        const k2 = 'saida::' + mapCat(c);
        pontos[i][k2] = Math.round((pontos[i][k2] as number || 0) + v);
      }
    });
  }

  return { pontos, series, dimensao, estoqueAtual: { peca: estPeca, maquina: estMaq } };
}

// ===========================================================================
// Composição (popup ao clicar numa célula): lista os itens que somam o valor.
//   fonte=estoque  → saldo ATUAL por produto (snapshot), filtrável por grupo/família.
//   fonte=entrada  → itens das notas do mês, filtrável por grupo/categoria/família.
//   fonte=saida    → vendas do mês, filtrável por grupo/categoria/família.
// ===========================================================================

export interface ComposicaoItem {
  codigo: string;
  descricao: string;
  familia: string;
  categoria?: string;
  ref?: string; // nº da NF (entrada) ou nº do pedido (saída)
  qtd: number;
  valor: number;
}
export interface ComposicaoResult {
  itens: ComposicaoItem[];
  total: number;
  somaValor: number;
  fonte: 'estoque' | 'entrada' | 'saida';
  aviso?: string;
}

export interface ComposicaoFiltro {
  fonte: 'estoque' | 'entrada' | 'saida';
  mes?: number;
  ano?: number;
  grupo?: 'peca' | 'maquina';
  categoria?: string;
  familia?: string;
  tipocarac?: string;
}

function passaFiltroGrupoFamCat(
  args: { grupo?: string; familia?: string; categoria?: string; tipocarac?: string },
  fam: string,
  cat: string,
  tipo: string = '',
): boolean {
  if (args.familia && fam !== args.familia) return false;
  if (args.grupo && classificarGrupo(fam) !== args.grupo) return false;
  if (args.categoria && cat !== args.categoria) return false;
  if (args.tipocarac && (tipo || SEM_TIPO) !== args.tipocarac) return false;
  // exclui os ignorados (mesma base da série), exceto ao drilar uma família específica
  if (!args.familia && classificarGrupo(fam) === 'ignorar') return false;
  return true;
}

async function composicaoEstoque(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  const itens: ComposicaoItem[] = [];
  // Mapa Tipo (característica) só quando o drill é por Tipo — igual entrada/saída.
  const tipoPorCodigo = f.tipocarac ? await carregarTipoCaracteristica(conta) : {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await aplicarContaProdutos(
      supabase.from('produtos').select('codigo_produto,descricao,familia_nome,estoque,valor_estoque'),
      conta,
    ).gt('estoque', 0).order('codigo_produto').order('conta_omie').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const p of lote) {
      const fam = String(p.familia_nome ?? '').trim() || SEM_FAMILIA;
      const tipoC = tipoPorCodigo[String(p.codigo_produto ?? '')] || SEM_TIPO;
      if (!passaFiltroGrupoFamCat(f, fam, '', tipoC)) continue;
      itens.push({
        codigo: String(p.codigo_produto ?? ''),
        descricao: String(p.descricao ?? ''),
        familia: fam,
        qtd: num(p.estoque),
        valor: num(p.valor_estoque),
      });
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  itens.sort((a, b) => b.valor - a.valor);
  return {
    itens, total: itens.length, somaValor: itens.reduce((s, i) => s + i.valor, 0), fonte: 'estoque',
    aviso: f.tipocarac
      ? 'Composição do saldo atual por Tipo (não reconstrói item-a-item os meses passados).'
      : 'Saldo atual (snapshot do último sync). Nos meses passados o valor do gráfico é reconstruído e aproximado.',
  };
}

async function composicaoEntrada(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  const { famPorCodigo, famPorSKU } = await carregarProdutos(conta);
  const tipoPorCodigo = f.tipocarac ? await carregarTipoCaracteristica(conta) : {};
  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;
  const itens: ComposicaoItem[] = [];
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('numero_nf,categoria,itens').eq('mes', f.mes!).eq('ano', f.ano!).order('ncod_nf');
    query = filtroConta(query, conta);
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ numero_nf: unknown; categoria: unknown; itens: unknown }>;
    for (const nota of lote) {
      const cat = String(nota.categoria ?? '').trim() || SEM_CATEGORIA;
      const its = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of its) {
        const { codigo, sku, descricao, qtd, valor } = parseItemEntrada(it);
        const fam = resolverFamiliaEntrada(codigo, sku, famPorCodigo, famPorSKU) || SEM_FAMILIA;
        const tipoC = tipoPorCodigo[codigo] || SEM_TIPO;
        if (!passaFiltroGrupoFamCat(f, fam, cat, tipoC)) continue;
        itens.push({ codigo: codigo || sku, descricao, familia: fam, categoria: cat, ref: String(nota.numero_nf ?? ''), qtd, valor });
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  itens.sort((a, b) => b.valor - a.valor);
  return { itens, total: itens.length, somaValor: itens.reduce((s, i) => s + i.valor, 0), fonte: 'entrada' };
}

async function composicaoSaida(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  const { famPorCodigo } = await carregarProdutos(conta);
  const tipoPorCodigo = f.tipocarac ? await carregarTipoCaracteristica(conta) : {};
  const catMap = await buscarCategoriasOmie(conta ?? CONTA_DEFAULT);
  const itens: ComposicaoItem[] = [];
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await filtroConta(
      supabase.from('vendas_itens')
        .select('numero_pedido,codigo_produto,descricao,familia,quantidade,valor_total,codigo_categoria')
        .eq('mes', f.mes!).eq('ano', f.ano!),
      conta,
    ).order('codigo_produto').range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const cod = String(v.codigo_produto ?? '');
      const fam = famPorCodigo[cod] || (String(v.familia ?? '').trim() || SEM_FAMILIA);
      const cod_cat = String(v.codigo_categoria ?? '');
      const cat = catMap[cod_cat] || (cod_cat ? cod_cat : SEM_CATEGORIA);
      const tipoC = tipoPorCodigo[cod] || SEM_TIPO;
      if (!passaFiltroGrupoFamCat(f, fam, cat, tipoC)) continue;
      itens.push({
        codigo: cod, descricao: String(v.descricao ?? ''), familia: fam, categoria: cat,
        ref: String(v.numero_pedido ?? ''), qtd: num(v.quantidade), valor: num(v.valor_total),
      });
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  itens.sort((a, b) => b.valor - a.valor);
  return { itens, total: itens.length, somaValor: itens.reduce((s, i) => s + i.valor, 0), fonte: 'saida' };
}

export async function composicao(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  if (f.fonte === 'estoque') return composicaoEstoque(conta, f);
  if (f.fonte === 'entrada') return composicaoEntrada(conta, f);
  return composicaoSaida(conta, f);
}
