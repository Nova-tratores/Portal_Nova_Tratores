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
import { CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const SEM_FAMILIA = 'Sem família';
const SEM_CATEGORIA = 'Sem categoria';

export type TipoFamilia = '' | 'pecas' | 'maquinas';
export type Grupo = 'maquina' | 'peca' | 'ignorar';
export type Dimensao = 'tipo' | 'categoria';

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
function parseItemEntrada(it: Record<string, unknown>): { codigo: string; descricao: string; qtd: number; valor: number } {
  const prod = (it.prod ?? null) as Record<string, unknown> | null;
  if (prod) {
    const nf = (it.nfProdInt ?? {}) as Record<string, unknown>;
    return {
      codigo: String(nf.nCodProd ?? prod.cProd ?? ''),
      descricao: String(prod.xProd ?? ''),
      qtd: num(prod.qCom),
      valor: num(prod.vProd ?? prod.vTotItem),
    };
  }
  // Fallback p/ formatos planos antigos.
  return {
    codigo: String(it.codigo_produto ?? ''),
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
        const { codigo, qtd, valor } = parseItemEntrada(it);
        const fam = famPorCodigo[codigo];
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

export interface SerieDef { key: string; label: string; cor: string; dash?: boolean }
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
}

async function notasDoMes(
  mes: number, ano: number, conta: ContaFiltro,
  famPorCodigo: Record<string, string>, escaped: string | null,
): Promise<{ entradaPeca: number; entradaMaq: number; entradaPorCat: Record<string, number> }> {
  let entradaPeca = 0, entradaMaq = 0;
  const entradaPorCat: Record<string, number> = {};
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('categoria,itens').eq('mes', mes).eq('ano', ano);
    query = filtroConta(query, conta);
    query = query.or('cancelada.is.null,cancelada.eq.false');
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ categoria: unknown; itens: unknown }>;
    for (const nota of lote) {
      const cat = String(nota.categoria ?? '').trim() || SEM_CATEGORIA;
      const itens = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of itens) {
        const { codigo, valor } = parseItemEntrada(it);
        const g = classificarGrupo(famPorCodigo[codigo] || '');
        if (g === 'peca') entradaPeca += valor;
        else if (g === 'maquina') entradaMaq += valor;
        // categoria: só conta o que não é ignorado (mesma base do "tipo")
        if (g !== 'ignorar') entradaPorCat[cat] = (entradaPorCat[cat] || 0) + valor;
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { entradaPeca, entradaMaq, entradaPorCat };
}

async function vendasDoMes(
  mes: number, ano: number, conta: ContaFiltro,
  famPorCodigo: Record<string, string>, catMap: Record<string, string>,
): Promise<{ cogsPeca: number; cogsMaq: number; saidaPeca: number; saidaMaq: number; saidaPorCat: Record<string, number> }> {
  let cogsPeca = 0, cogsMaq = 0, saidaPeca = 0, saidaMaq = 0;
  const saidaPorCat: Record<string, number> = {};
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
    ).range(offset, offset + LOTE - 1);
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
      }
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return { cogsPeca, cogsMaq, saidaPeca, saidaMaq, saidaPorCat };
}

export async function serieMensal(
  meses: Array<{ mes: number; ano: number }>,
  conta: ContaFiltro,
  dimensao: Dimensao = 'tipo',
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
  const catMap = dimensao === 'categoria' ? await buscarCategoriasOmie(conta ?? CONTA_DEFAULT) : {};

  // Fluxos mês a mês (nota + venda do mesmo mês em paralelo; meses em série).
  const fluxos: FluxoMes[] = [];
  for (const m of meses) {
    const [nota, venda] = await Promise.all([
      notasDoMes(m.mes, m.ano, conta, famPorCodigo, escaped),
      vendasDoMes(m.mes, m.ano, conta, famPorCodigo, catMap),
    ]);
    fluxos.push({
      entradaPeca: nota.entradaPeca, entradaMaq: nota.entradaMaq,
      cogsPeca: venda.cogsPeca, cogsMaq: venda.cogsMaq,
      saidaPeca: venda.saidaPeca, saidaMaq: venda.saidaMaq,
      entradaPorCat: nota.entradaPorCat, saidaPorCat: venda.saidaPorCat,
    });
  }

  // Reconstrução do estoque para trás a partir do saldo atual.
  const k = fluxos.length;
  const pecaArr = new Array<number>(k).fill(0);
  const maqArr = new Array<number>(k).fill(0);
  if (k > 0) { pecaArr[k - 1] = estPeca; maqArr[k - 1] = estMaq; }
  for (let i = k - 1; i >= 1; i--) {
    pecaArr[i - 1] = Math.max(0, pecaArr[i] - fluxos[i].entradaPeca + fluxos[i].cogsPeca);
    maqArr[i - 1] = Math.max(0, maqArr[i] - fluxos[i].entradaMaq + fluxos[i].cogsMaq);
  }

  // Séries (estoque sempre peça/máquina) + entrada/saída conforme a dimensão.
  const series: SerieDef[] = [
    { key: 'estoque_peca', label: 'Estoque Peça', cor: '#2563eb' },
    { key: 'estoque_maquina', label: 'Estoque Máquina', cor: '#d97706' },
  ];

  const pontos: PontoMensal[] = meses.map((m, i) => ({
    periodo: labelMes(m.mes, m.ano),
    mes: m.mes,
    ano: m.ano,
    estoque_peca: Math.round(pecaArr[i]),
    estoque_maquina: Math.round(maqArr[i]),
  }));

  if (dimensao === 'tipo') {
    series.push(
      { key: 'nf_entrada_peca', label: 'NF Entrada Peça', cor: '#16a34a' },
      { key: 'nf_entrada_maquina', label: 'NF Entrada Máquina', cor: '#16a34a', dash: true },
      { key: 'nf_saida_peca', label: 'NF Saída Peça', cor: '#dc2626' },
      { key: 'nf_saida_maquina', label: 'NF Saída Máquina', cor: '#dc2626', dash: true },
    );
    fluxos.forEach((f, i) => {
      pontos[i].nf_entrada_peca = Math.round(f.entradaPeca);
      pontos[i].nf_entrada_maquina = Math.round(f.entradaMaq);
      pontos[i].nf_saida_peca = Math.round(f.saidaPeca);
      pontos[i].nf_saida_maquina = Math.round(f.saidaMaq);
    });
  } else {
    // Top categorias por total (entrada+saída) no período; resto → "Outras".
    const totalPorCat: Record<string, number> = {};
    for (const f of fluxos) {
      for (const [c, v] of Object.entries(f.entradaPorCat)) totalPorCat[c] = (totalPorCat[c] || 0) + v;
      for (const [c, v] of Object.entries(f.saidaPorCat)) totalPorCat[c] = (totalPorCat[c] || 0) + v;
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
      for (const [c, v] of Object.entries(f.entradaPorCat)) {
        const k2 = 'entrada::' + mapCat(c);
        pontos[i][k2] = Math.round((pontos[i][k2] as number || 0) + v);
      }
      for (const [c, v] of Object.entries(f.saidaPorCat)) {
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
}

function passaFiltroGrupoFamCat(
  args: { grupo?: string; familia?: string; categoria?: string },
  fam: string,
  cat: string,
): boolean {
  if (args.familia && fam !== args.familia) return false;
  if (args.grupo && classificarGrupo(fam) !== args.grupo) return false;
  if (args.categoria && cat !== args.categoria) return false;
  // por padrão (sem filtro de grupo/categoria/família) exclui os ignorados
  if (!args.familia && classificarGrupo(fam) === 'ignorar') return false;
  return true;
}

async function composicaoEstoque(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  const itens: ComposicaoItem[] = [];
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    const { data, error } = await aplicarContaProdutos(
      supabase.from('produtos').select('codigo_produto,descricao,familia_nome,estoque,valor_estoque'),
      conta,
    ).gt('estoque', 0).range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const p of lote) {
      const fam = String(p.familia_nome ?? '').trim() || SEM_FAMILIA;
      if (!passaFiltroGrupoFamCat(f, fam, '')) continue;
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
    aviso: 'Saldo atual (snapshot do último sync). Nos meses passados o valor do gráfico é reconstruído e aproximado.',
  };
}

async function composicaoEntrada(conta: ContaFiltro, f: ComposicaoFiltro): Promise<ComposicaoResult> {
  const { famPorCodigo } = await carregarProdutos(conta);
  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;
  const itens: ComposicaoItem[] = [];
  let offset = 0;
  const LOTE = 1000;
  while (true) {
    let query = supabase.from('notas_entrada').select('numero_nf,categoria,itens').eq('mes', f.mes!).eq('ano', f.ano!);
    query = filtroConta(query, conta);
    query = query.or('cancelada.is.null,cancelada.eq.false');
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    const { data, error } = await query.range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ numero_nf: unknown; categoria: unknown; itens: unknown }>;
    for (const nota of lote) {
      const cat = String(nota.categoria ?? '').trim() || SEM_CATEGORIA;
      const its = Array.isArray(nota.itens) ? (nota.itens as Array<Record<string, unknown>>) : [];
      for (const it of its) {
        const { codigo, descricao, qtd, valor } = parseItemEntrada(it);
        const fam = famPorCodigo[codigo] || SEM_FAMILIA;
        if (!passaFiltroGrupoFamCat(f, fam, cat)) continue;
        itens.push({ codigo, descricao, familia: fam, categoria: cat, ref: String(nota.numero_nf ?? ''), qtd, valor });
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
    ).range(offset, offset + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const v of lote) {
      const cod = String(v.codigo_produto ?? '');
      const fam = famPorCodigo[cod] || (String(v.familia ?? '').trim() || SEM_FAMILIA);
      const cod_cat = String(v.codigo_categoria ?? '');
      const cat = catMap[cod_cat] || (cod_cat ? cod_cat : SEM_CATEGORIA);
      if (!passaFiltroGrupoFamCat(f, fam, cat)) continue;
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
