/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Contas a pagar/receber: ranking visual + correção de categoria/departamento
// (AlterarConta*) e baixa (LancarPagamento/Recebimento). Lê contas_pagar/
// contas_receber (sincronizadas por outro pipeline, mesmo Supabase) e escreve no
// Omie. Portado de server.js (/api/contas/*). conta já é 'NOVA'/'CASTRO'.
// ============================================================================

import type { Conta, ContaFiltro } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { fmtBR, parseAnyDate, hoje } from './dates';
import {
  omieRequest,
  alterarContaCategoriaDepto,
  consultarConta,
  listarContasCorrentes,
  baixarConta,
  sleep,
} from './omie';

export function tabelaContas(tipo: string): string {
  return String(tipo) === 'receber' ? 'contas_receber' : 'contas_pagar';
}
export function colNomeContraparte(tipo: string): string {
  return String(tipo) === 'receber' ? 'nome_cliente' : 'nome_fornecedor';
}

const STATUS_ABERTO = ['A VENCER', 'ATRASADO', 'VENCE HOJE'];

export interface FiltrosContas {
  conta?: ContaFiltro;
  de?: string | null;
  ate?: string | null;
  codigoCategoria?: string | null;
  codigoDepartamento?: string | null;
  statusIn?: string[];
}

/** Lê linhas de contas_pagar/receber filtradas (paginado). */
export async function lerContas(tipo: string, filtros: FiltrosContas, colunas: string): Promise<any[]> {
  const tabela = tabelaContas(tipo);
  const todos: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(tabela).select(colunas).range(from, from + PAGE - 1);
    if (filtros.conta) q = q.eq('conta_omie', filtros.conta);
    if (filtros.de) q = q.gte('data_emissao', filtros.de);
    if (filtros.ate) q = q.lte('data_emissao', filtros.ate);
    if ('codigoCategoria' in filtros)
      q = filtros.codigoCategoria === null ? q.is('codigo_categoria', null) : q.eq('codigo_categoria', filtros.codigoCategoria);
    if ('codigoDepartamento' in filtros)
      q = filtros.codigoDepartamento === null ? q.is('codigo_departamento', null) : q.eq('codigo_departamento', filtros.codigoDepartamento);
    if (Array.isArray(filtros.statusIn) && filtros.statusIn.length) q = q.in('status_titulo', filtros.statusIn);
    const { data, error } = await q;
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return todos;
}

/** Ranking por categoria ou departamento (total no período, desc). */
export async function rankingContas(tipo: string, dim: string, conta: ContaFiltro, de?: string | null, ate?: string | null): Promise<any> {
  const rows = await lerContas(
    tipo,
    { conta, de: de || null, ate: ate || null },
    'valor_documento, codigo_categoria, descricao_categoria, codigo_departamento, descricao_departamento',
  );
  const codCol = dim === 'departamento' ? 'codigo_departamento' : 'codigo_categoria';
  const descCol = dim === 'departamento' ? 'descricao_departamento' : 'descricao_categoria';
  const mapa = new Map<string, any>();
  let totalGeral = 0;
  for (const r of rows) {
    const chave = r[codCol] || '(sem)';
    const v = Number(r.valor_documento) || 0;
    totalGeral += v;
    if (!mapa.has(chave)) mapa.set(chave, { codigo: r[codCol] || null, descricao: r[descCol] || '(sem ' + dim + ')', total: 0, n: 0 });
    const o = mapa.get(chave);
    o.total += v;
    o.n += 1;
  }
  const ranking = Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  return { tipo, dim, ranking, totalGeral, totalLancamentos: rows.length };
}

/** Lançamentos de uma categoria/departamento específico. */
export async function lancamentosContas(
  tipo: string,
  dim: string,
  conta: ContaFiltro,
  de: string | null,
  ate: string | null,
  codigo: string | null,
): Promise<any> {
  const nomeCol = colNomeContraparte(tipo);
  const filtros: FiltrosContas = { conta, de: de || null, ate: ate || null };
  (filtros as any)[dim === 'departamento' ? 'codigoDepartamento' : 'codigoCategoria'] = codigo;
  const cols = `conta_omie, codigo_lancamento, valor_documento, data_emissao, data_vencimento, numero_documento, numero_documento_fiscal, ${nomeCol}, codigo_categoria, descricao_categoria, codigo_departamento, descricao_departamento`;
  const rows = await lerContas(tipo, filtros, cols);
  rows.sort((a, b) => (Number(b.valor_documento) || 0) - (Number(a.valor_documento) || 0));
  const lancamentos = rows.slice(0, 1000).map((r) => ({
    conta: r.conta_omie,
    codigoLancamento: r.codigo_lancamento,
    valor: Number(r.valor_documento) || 0,
    dataEmissao: r.data_emissao,
    vencimento: r.data_vencimento,
    numeroDoc: r.numero_documento || r.numero_documento_fiscal || null,
    contraparte: r[nomeCol] || null,
    codigoCategoria: r.codigo_categoria,
    descricaoCategoria: r.descricao_categoria,
    codigoDepartamento: r.codigo_departamento,
    descricaoDepartamento: r.descricao_departamento,
  }));
  return { tipo, dim, total: rows.length, mostrando: lancamentos.length, lancamentos };
}

// ---- Categorias / departamentos / contas correntes (cache 12h) ----

export async function obterCategorias(conta: Conta): Promise<any[]> {
  const chave = `categorias:${conta}`;
  const hit = cache.get<any[]>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try {
    const r = await omieRequest('/geral/categorias/', 'ListarCategorias', { pagina: 1, registros_por_pagina: 500 }, conta);
    arr = r.categoria_cadastro || r.cadastros || [];
  } catch (e: any) {
    console.warn('[categorias]', e.faultstring || e.message);
  }
  const lista = (arr || [])
    .filter((c) => c.totalizadora !== 'S' && c.conta_inativa !== 'S')
    .map((c) => ({ codigo: c.codigo, descricao: c.descricao, contaDre: c.conta_dre_lan_padrao || c.conta_dre || null }))
    .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
  cache.set(chave, lista, 43200);
  return lista;
}

export async function obterDepartamentos(conta: Conta): Promise<any[]> {
  const chave = `departamentos:${conta}`;
  const hit = cache.get<any[]>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try {
    const r = await omieRequest('/geral/departamentos/', 'ListarDepartamentos', { pagina: 1, registros_por_pagina: 500 }, conta);
    arr = r.departamentos || r.cadastros || r.departamento_cadastro || [];
  } catch (e: any) {
    console.warn('[departamentos]', e.faultstring || e.message);
  }
  const lista = (arr || [])
    .filter((d) => d.inativo !== 'S')
    .map((d) => ({ codigo: d.codigo, descricao: d.descricao || d.estrutura || '' }))
    .sort((a, b) => String(a.descricao || '').localeCompare(String(b.descricao || '')));
  cache.set(chave, lista, 43200);
  return lista;
}

export async function obterContasCorrentes(conta: Conta): Promise<any[]> {
  const chave = `contascorrentes:${conta}`;
  const hit = cache.get<any[]>(chave);
  if (hit) return hit.valor;
  let lista: any[] = [];
  try {
    lista = await listarContasCorrentes(conta);
  } catch (e: any) {
    console.warn('[contas-correntes]', e.faultstring || e.message);
  }
  cache.set(chave, lista, 43200);
  return lista;
}

// ---- Correção de categoria/departamento ----

export interface Distribuicao {
  cCodDep: string;
  nPerDep: number;
  cDesDep?: string;
}

export function validarCorrecao({ codigoCategoria, distribuicao }: { codigoCategoria?: string | null; distribuicao?: Distribuicao[] | null }): string | null {
  if (distribuicao) {
    const soma = distribuicao.reduce((s, d) => s + (Number(d.nPerDep) || 0), 0);
    if (Math.abs(soma - 100) > 0.01) return `a soma dos percentuais do rateio deve ser 100 (atual: ${soma})`;
    if (distribuicao.some((d) => !d.cCodDep)) return 'cada linha do rateio precisa de um departamento';
  }
  if (!codigoCategoria && !distribuicao) return 'informe nova categoria e/ou departamento';
  return null;
}

/** Núcleo: corrige UM lançamento no Omie + atualiza Supabase + loga. */
export async function aplicarCorrecaoLancamento(args: {
  conta: Conta;
  tipo: string;
  codigoLancamento: number | string;
  codigoCategoria?: string | null;
  distribuicao?: Distribuicao[] | null;
  origem?: string;
}): Promise<any> {
  const { conta, tipo, codigoLancamento, codigoCategoria, distribuicao, origem } = args;
  let resultado: any = null;
  let erro: any = null;
  let anterior: any = null;
  try {
    const out = await alterarContaCategoriaDepto(conta, { tipo, codigoLancamento, codigoCategoria, distribuicao });
    resultado = out.rawResponse;
    anterior = out.anterior;
  } catch (e: any) {
    erro = e.faultstring || e.message;
    if (e.bloqueio) erro = { msg: erro, bloqueio: true };
  }
  const bloqueio = !!(erro && typeof erro === 'object');
  if (bloqueio) erro = erro.msg;

  let descNovaCat: string | null = null;
  let novoCodDep: string | null = null;
  let novoDescDep: string | null = null;
  if (!erro && codigoCategoria) {
    try {
      const cats = await obterCategorias(conta);
      const c = cats.find((x) => String(x.codigo) === codigoCategoria);
      descNovaCat = c ? c.descricao : null;
    } catch {
      /* ignore */
    }
  }
  if (!erro && distribuicao) {
    novoCodDep = String(distribuicao[0].cCodDep);
    try {
      const deps = await obterDepartamentos(conta);
      const d = deps.find((x) => String(x.codigo) === novoCodDep);
      novoDescDep = d ? d.descricao : distribuicao[0].cDesDep || null;
    } catch {
      /* ignore */
    }
  }
  if (!erro) {
    const upd: any = {};
    if (codigoCategoria) {
      upd.codigo_categoria = codigoCategoria;
      if (descNovaCat) upd.descricao_categoria = descNovaCat;
    }
    if (novoCodDep) {
      upd.codigo_departamento = novoCodDep;
      if (novoDescDep) upd.descricao_departamento = novoDescDep;
    }
    if (Object.keys(upd).length) {
      try {
        await supabase.from(tabelaContas(tipo)).update(upd).eq('conta_omie', conta).eq('codigo_lancamento', Number(codigoLancamento));
      } catch (e: any) {
        console.warn('[corrigir] update linha:', e.message);
      }
    }
  }
  try {
    await supabase.from('contas_correcoes').insert({
      conta_omie: conta,
      tipo,
      codigo_lancamento: Number(codigoLancamento),
      categoria_anterior: anterior ? anterior.codigoCategoria : null,
      categoria_nova: codigoCategoria,
      departamento_anterior: anterior ? anterior.distribuicao : null,
      departamento_novo: distribuicao,
      status: erro ? 'erro' : 'aplicado',
      erro: erro || null,
      raw_request: { tipo, codigoLancamento, codigoCategoria, distribuicao },
      raw_response: erro ? { erro } : resultado,
      criado_por: origem === 'massa' ? 'app-massa' : 'app',
    });
  } catch (e: any) {
    console.warn('[corrigir] log auditoria:', e.message);
  }

  if (erro) return { ok: false, erro, bloqueio };
  return {
    ok: true,
    descStatus: resultado && resultado.descricao_status,
    anterior,
    nova: { codigoCategoria, descricaoCategoria: descNovaCat, codigoDepartamento: novoCodDep, descricaoDepartamento: novoDescDep },
  };
}

/** Correção em massa (loop com throttle). */
export async function corrigirContaMassa(b: {
  tipo: string;
  codigoCategoria?: string | null;
  distribuicao?: Distribuicao[] | null;
  soCategoriaVazia?: boolean;
  soDepartamentoVazio?: boolean;
  itens: Array<{ conta: Conta; codigoLancamento: number | string; temCategoria?: boolean; temDepartamento?: boolean }>;
}): Promise<any> {
  const tipo = b.tipo === 'receber' ? 'receber' : 'pagar';
  const codigoCategoria = b.codigoCategoria != null && String(b.codigoCategoria).trim() !== '' ? String(b.codigoCategoria) : null;
  const distribuicao = Array.isArray(b.distribuicao) && b.distribuicao.length ? b.distribuicao : null;
  const itens = Array.isArray(b.itens) ? b.itens : [];

  const THROTTLE_MS = parseInt(process.env.CONTAS_THROTTLE_MS || '', 10) >= 0 ? parseInt(process.env.CONTAS_THROTTLE_MS || '', 10) : 700;
  const resultados: any[] = [];
  let bloqueado = false;
  let primeiro = true;
  for (const it of itens) {
    const conta = it.conta;
    const aplicarCat = codigoCategoria && (!b.soCategoriaVazia || !it.temCategoria);
    const aplicarDep = distribuicao && (!b.soDepartamentoVazio || !it.temDepartamento);
    if (!aplicarCat && !aplicarDep) {
      resultados.push({ codigoLancamento: it.codigoLancamento, conta, ok: true, pulado: 'nao se aplica ao filtro' });
      continue;
    }
    if (bloqueado) {
      resultados.push({ codigoLancamento: it.codigoLancamento, conta, ok: false, erro: 'pulado: Omie bloqueada' });
      continue;
    }
    if (!primeiro && THROTTLE_MS > 0) await sleep(THROTTLE_MS);
    primeiro = false;
    const out = await aplicarCorrecaoLancamento({
      conta,
      tipo,
      codigoLancamento: it.codigoLancamento,
      codigoCategoria: aplicarCat ? codigoCategoria : null,
      distribuicao: aplicarDep ? distribuicao : null,
      origem: 'massa',
    });
    if (out.bloqueio) bloqueado = true;
    resultados.push({ codigoLancamento: it.codigoLancamento, conta, ok: out.ok, erro: out.erro || null });
  }
  return {
    ok: true,
    total: itens.length,
    aplicados: resultados.filter((r) => r.ok && !r.pulado).length,
    pulados: resultados.filter((r) => r.pulado).length,
    falhas: resultados.filter((r) => !r.ok).length,
    bloqueado,
    resultados,
  };
}

// ---- Baixa de títulos ----

/** Títulos EM ABERTO de uma empresa+tipo. */
export async function titulosAbertos(tipo: string, conta: Conta): Promise<any> {
  const nomeCol = colNomeContraparte(tipo);
  const cols = `conta_omie, codigo_lancamento, valor_documento, valor_pago, data_emissao, data_vencimento, numero_documento, numero_documento_fiscal, numero_parcela, status_titulo, ${nomeCol}, descricao_categoria`;
  const rows = await lerContas(tipo, { conta, statusIn: STATUS_ABERTO }, cols);
  rows.sort((a, b) => String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || '')));
  const titulos = rows.map((r) => {
    const doc = Number(r.valor_documento) || 0;
    const pago = Number(r.valor_pago) || 0;
    return {
      conta: r.conta_omie,
      codigoLancamento: r.codigo_lancamento,
      valorDocumento: doc,
      valorPago: pago,
      valorAberto: Math.max(0, doc - pago),
      dataEmissao: r.data_emissao,
      vencimento: r.data_vencimento,
      numeroDoc: r.numero_documento || r.numero_documento_fiscal || null,
      parcela: r.numero_parcela || null,
      status: r.status_titulo,
      contraparte: r[nomeCol] || null,
      categoria: r.descricao_categoria || null,
    };
  });
  return { tipo, conta, total: titulos.length, titulos };
}

/** Consulta UM título no Omie (para o modal de baixa). */
export async function consultarTitulo(conta: Conta, tipo: string, codigoLancamento: number | string): Promise<any> {
  const t = await consultarConta(conta, tipo, codigoLancamento);
  const ccs = await obterContasCorrentes(conta);
  const idCC = t.id_conta_corrente || null;
  const cc = idCC ? ccs.find((c) => String(c.codigo) === String(idCC)) : null;
  return {
    ok: true,
    statusTitulo: t.status_titulo || null,
    valorDocumento: t.valor_documento != null ? Number(t.valor_documento) : null,
    baixaBloqueada: t.baixa_bloqueada === 'S',
    idContaCorrente: idCC,
    contaCorrenteDescricao: cc ? cc.descricao : idCC ? '(conta corrente ' + idCC + ')' : null,
  };
}

/** Baixa (marca pago/recebido) UM título no Omie + atualiza Supabase + loga. */
export async function baixarTitulo(b: {
  conta: Conta;
  tipo: string;
  codigoLancamento: number | string;
  codigoContaCorrente: number | string;
  valor: number;
  data?: string;
  juros?: number;
  multa?: number;
  desconto?: number;
  observacao?: string;
  conciliar?: boolean;
}): Promise<any> {
  const conta = b.conta;
  const tipo = b.tipo === 'receber' ? 'receber' : 'pagar';
  const juros = Number(b.juros) || 0;
  const multa = Number(b.multa) || 0;
  const desconto = Number(b.desconto) || 0;
  const dt = parseAnyDate(b.data) || hoje();
  const dataBR = fmtBR(dt);
  const dataISO = dataBR.split('/').reverse().join('-');

  let resultado: any = null;
  let erro: string | null = null;
  let anterior: any = null;
  try {
    const out = await baixarConta(conta, {
      tipo,
      codigoLancamento: b.codigoLancamento,
      codigoContaCorrente: b.codigoContaCorrente,
      valor: b.valor,
      data: dataBR,
      juros,
      multa,
      desconto,
      observacao: b.observacao || '',
      conciliar: !!b.conciliar,
    });
    resultado = out.rawResponse;
    anterior = out.anterior;
  } catch (e: any) {
    erro = e.faultstring || e.message;
  }

  if (!erro) {
    const statusLiquidado = tipo === 'receber' ? 'RECEBIDO' : 'PAGO';
    try {
      await supabase
        .from(tabelaContas(tipo))
        .update({ status_titulo: statusLiquidado, data_pagamento: dataISO, valor_pago: b.valor })
        .eq('conta_omie', conta)
        .eq('codigo_lancamento', Number(b.codigoLancamento));
    } catch (e: any) {
      console.warn('[baixar] update linha:', e.message);
    }
  }
  try {
    await supabase.from('contas_baixas').insert({
      conta_omie: conta,
      tipo,
      codigo_lancamento: Number(b.codigoLancamento),
      status_anterior: anterior ? anterior.statusTitulo : null,
      codigo_conta_corrente: Number(b.codigoContaCorrente) || null,
      data_pagamento: dataISO,
      valor: b.valor,
      juros: juros || null,
      multa: multa || null,
      desconto: desconto || null,
      observacao: b.observacao || null,
      status: erro ? 'erro' : 'aplicado',
      erro: erro || null,
      raw_request: { tipo, codigoLancamento: b.codigoLancamento, codigoContaCorrente: b.codigoContaCorrente, valor: b.valor, data: dataBR, juros, multa, desconto },
      raw_response: erro ? { erro } : resultado,
      criado_por: 'app',
    });
  } catch (e: any) {
    console.warn('[baixar] log auditoria:', e.message);
  }

  if (erro) return { ok: false, erro };
  return { ok: true, codigoBaixa: resultado && (resultado.codigo_baixa || resultado.codigo_lancamento), anterior };
}
