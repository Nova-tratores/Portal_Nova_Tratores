/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Lógica de correção de CMC (núcleo do módulo Ajustes). Portado das rotas/
// helpers de server.js (aplicarUmaCorrecao, /api/analise, reverter, ajuste-custos).
//
// Adaptações vs. o app original:
//  - `conta` JÁ é 'NOVA'/'CASTRO' (= conta_omie). Não há mais minúsculo + labelConta.
//  - supabaseAdmin -> `supabase` (service role com fallback anon).
//  - cache em memória single-instance (lib/ajustes/cache).
// ============================================================================

import type { Conta } from './conta';
import { CONTA_DEFAULT, getContasOmie } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { getConfig } from './config';
import { fmtBR, fmtISO, parseBR, parseAnyDate, addMeses, hoje } from './dates';
import {
  consultarProdutoPorIntegracao,
  obterPosicaoEstoqueProduto,
  incluirAjusteCMC,
  excluirAjusteEstoque,
  listarLocaisEstoque,
  listarClientesResumido,
  sleep,
  SLEEP_BETWEEN_PAGES,
} from './omie';
import { analisarConta } from './analise';

/** Erro com código HTTP sugerido (mapeado pela rota). */
export interface HttpError extends Error {
  http?: number;
  correcaoId?: number | null;
}
export function httpErr(status: number, msg: string): HttpError {
  const e = new Error(msg) as HttpError;
  e.http = status;
  return e;
}

// ---- Janela / cache ----

/**
 * Resolve a janela efetiva (DD/MM/YYYY) a partir de de/ate (YYYY-MM-DD ou
 * DD/MM/YYYY). Default: últimos lookbackMeses.
 */
export function resolveJanelaBR(de?: string | null, ate?: string | null): { dataDeBR: string; dataAteBR: string } {
  const cfg = getConfig();
  const dtAte = de && ate && parseAnyDate(ate) ? (parseAnyDate(ate) as Date) : hoje();
  const dtDe = de && ate && parseAnyDate(de) ? (parseAnyDate(de) as Date) : addMeses(dtAte, -cfg.lookbackMeses);
  return { dataDeBR: fmtBR(dtDe), dataAteBR: fmtBR(dtAte) };
}

export function chaveCacheAnalise(conta: Conta, dataDeBR: string, dataAteBR: string): string {
  return `analise:${conta}:${dataDeBR}:${dataAteBR}`;
}

// ---- Cruzamento com correções já aplicadas ----

/**
 * Seta jaCorrigido / ultimaCorrecao por produto, cruzando com cmc_correcoes.
 */
export async function anotarCorrecoesAplicadas(payload: any): Promise<any> {
  if (!payload || !Array.isArray(payload.produtos) || payload.produtos.length === 0) return payload;
  const cods = payload.produtos.map((p: any) => p.codigoProduto).filter((c: any) => c != null);
  if (cods.length === 0) return payload;
  const { data, error } = await supabase
    .from('cmc_correcoes')
    .select('codigo_produto, codigo_local_estoque, cmc_aplicado, cmc_anterior, codigo_ajuste_omie, status, criado_em, criado_por, nf_origem_data, origem')
    .eq('conta_omie', payload.contaLabel)
    .in('codigo_produto', cods)
    .order('criado_em', { ascending: false })
    .limit(4000);
  if (error) {
    console.warn('[cmc] cruzamento cmc_correcoes falhou:', error.message);
    return payload;
  }
  // mais recente por produto (retrocompat) + aplicadas indexadas por (produto, data-ISO)
  // para casar cada episodio pela data do ajuste retroativo.
  const porProduto = new Map<any, any>();
  const aplicadasPorData = new Map<string, any>();
  for (const row of data || []) {
    if (!porProduto.has(row.codigo_produto)) porProduto.set(row.codigo_produto, row);
    if (row.status === 'aplicado' && row.origem === 'estoque_negativo' && row.nf_origem_data) {
      const iso = String(row.nf_origem_data).slice(0, 10);
      const k = `${row.codigo_produto}|${iso}`;
      if (!aplicadasPorData.has(k)) aplicadasPorData.set(k, row); // ja ordenado desc -> mais recente
    }
  }
  const toISO = (br?: string | null): string => {
    const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };
  for (const p of payload.produtos) {
    const c = p.codigoProduto != null ? porProduto.get(p.codigoProduto) : null;
    if (c) {
      p.jaCorrigido = c.status === 'aplicado';
      p.ultimaCorrecao = c;
    }
    if (Array.isArray(p.episodios) && p.episodios.length > 0) {
      let todos = true;
      for (const ep of p.episodios) {
        const iso = toISO(ep.dataAjusteRetroativoBR);
        const hit = iso ? aplicadasPorData.get(`${p.codigoProduto}|${iso}`) : null;
        ep.jaCorrigido = !!hit;
        ep.ultimaCorrecao = hit || null;
        if (!hit) todos = false;
      }
      p.jaCorrigido = todos; // produto so "corrigido" quando TODOS os episodios foram
    }
  }
  return payload;
}

/**
 * Análise de garantia COM cache em memória + cruzamento de correções + log
 * opcional em cmc_sync_log. Portado de GET /api/analise (server.js:2600).
 */
export async function analisarComCache(
  conta: Conta,
  de?: string | null,
  ate?: string | null,
  force = false,
): Promise<any> {
  const { dataDeBR, dataAteBR } = resolveJanelaBR(de, ate);
  const chave = chaveCacheAnalise(conta, dataDeBR, dataAteBR);

  if (!force) {
    const hit = cache.get<any>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm };
  }

  const t0 = Date.now();
  const payload = await analisarConta(conta, {
    dataDeBR,
    dataAteBR,
    onProgress: (msg: string) => console.log(`[analise ${conta}] ${msg}`),
  });
  await anotarCorrecoesAplicadas(payload);

  // log opcional (não bloqueia)
  supabase
    .from('cmc_sync_log')
    .insert({
      conta_omie: payload.contaLabel,
      fim: new Date().toISOString(),
      status: 'ok',
      produtos_afetados: payload.totalProdutosAfetados,
      nfs_lidas: payload.totalNfs,
      parametros: { de: dataDeBR, ate: dataAteBR, ms: Date.now() - t0 },
    })
    .then(({ error }: any) => {
      if (error) console.warn('[cmc] cmc_sync_log insert:', error.message);
    });

  cache.set(chave, payload, getConfig().cacheTtlSeg);
  return { ...payload, fonte: 'omie' };
}

/** Invalida o cache de análise de uma conta. */
export function invalidarAnalise(conta: Conta): number {
  return cache.invalidatePrefix(`analise:${conta}:`);
}

// ---- Locais de estoque (para resolver onde aplicar o SLD) ----

async function locaisDaConta(conta: Conta): Promise<any[]> {
  const chave = `locais_estoque:${conta}`;
  const hit = cache.get<any[]>(chave);
  if (hit) return hit.valor;
  const locais = await listarLocaisEstoque(conta);
  cache.set(chave, locais, 3600);
  return locais;
}

function escolherLocalAjuste(porLocal: any[]): any {
  let best: any = null;
  for (const pl of porLocal || []) {
    if (!best || Math.abs(Number(pl.saldo || 0)) > Math.abs(Number(best.saldo || 0))) best = pl;
  }
  return best;
}

/** Resolve AO VIVO o local de maior saldo físico (!= 0) para aplicar o ajuste. */
async function resolverLocalAjuste(conta: Conta, idProd: number): Promise<number> {
  const locais = await locaisDaConta(conta);
  if (!locais || !locais.length) throw new Error('nenhum local de estoque ativo na conta');
  const candidatos: any[] = [];
  for (const l of locais) {
    try {
      const pos = await obterPosicaoEstoqueProduto(conta, idProd, { codigoLocalEstoque: l.id });
      const fisico = Number((pos.fisico != null ? pos.fisico : pos.saldo) || 0);
      candidatos.push({ localId: l.id, saldo: fisico });
    } catch {
      /* ignora local que falhou */
    }
  }
  const best = escolherLocalAjuste(candidatos);
  if (!best || best.saldo === 0) {
    throw new Error('produto sem saldo físico em nenhum local - ajuste de CMC via SLD não é aplicável');
  }
  return best.localId;
}

// ---- Aplicar correção ----

export interface CorrecaoBody {
  conta?: string;
  codigoProduto?: number | string | null;
  codigoIntegracao?: string | null;
  codLocal?: number | string | null;
  novoCMC?: number | string;
  cmcSugerido?: number | string | null;
  descricao?: string | null;
  estrategiaSugestao?: string | null;
  nfOrigemNumero?: string | null;
  nfOrigemDataBR?: string | null;
  cfopOrigem?: string | null;
  custoGarantiaUnit?: number | string | null;
  fornecedorId?: number | string | null;
  fornecedorNome?: string | null;
  obs?: string | null;
  origemCorrecao?: 'garantia' | 'estoque_negativo' | 'manual' | 'ajuste_custo';
  dataBR?: string;
  criadoPor?: string;
}

function contaConfigurada(conta: any): conta is Conta {
  return getContasOmie().some((c) => c.id === conta);
}

/**
 * Aplica UMA correção de CMC (SLD) no Omie + grava auditoria em cmc_correcoes.
 * Portado de aplicarUmaCorrecao (server.js:2655).
 */
export async function aplicarUmaCorrecao(body: CorrecaoBody, criadoPor?: string): Promise<any> {
  const conta = body.conta as Conta;
  if (!contaConfigurada(conta)) throw new Error(`Conta "${body.conta}" sem credenciais Omie configuradas`);
  const codigoProduto = body.codigoProduto != null ? Number(body.codigoProduto) : null;
  const codigoIntegracao = body.codigoIntegracao != null ? String(body.codigoIntegracao) : null;
  const codLocalInput = body.codLocal != null && body.codLocal !== '' ? Number(body.codLocal) : null;
  const novoCMC = Number(body.novoCMC);

  if (!codigoProduto && !codigoIntegracao) throw new Error('informe codigoProduto ou codigoIntegracao');
  if (!(novoCMC > 0)) throw new Error('novoCMC deve ser > 0');

  // Pre-flight: garante que a tabela de auditoria existe E está com o schema atual
  // (inclui `origem`) ANTES de tocar o Omie.
  {
    const { error: pe } = await supabase.from('cmc_correcoes').select('id, origem, fornecedor_id').limit(1);
    if (pe) {
      throw httpErr(
        503,
        `tabela cmc_correcoes indisponível ou desatualizada (${pe.message}) - rode sql/cmc_correcoes_init.sql no Supabase. Correção NÃO aplicada (auditoria obrigatória).`,
      );
    }
  }

  // Resolve id_prod se só veio o código de integração
  let idProd: number = codigoProduto as number;
  let descricao = body.descricao || null;
  if (!idProd && codigoIntegracao) {
    const p = await consultarProdutoPorIntegracao(conta, codigoIntegracao);
    if (!p || p.codigoProduto == null) throw new Error(`não consegui resolver o produto pelo código de integração "${codigoIntegracao}"`);
    idProd = p.codigoProduto;
    if (!descricao) descricao = p.descricao;
  }

  // codLocal: usa o informado, ou resolve AO VIVO o local de maior saldo físico.
  const codLocal = codLocalInput != null && Number.isFinite(codLocalInput)
    ? codLocalInput
    : await resolverLocalAjuste(conta, idProd);

  // Guard de duplo clique: já existe correção recente igual?
  try {
    const lim = new Date(Date.now() - 90 * 1000).toISOString();
    const { data: recentes } = await supabase
      .from('cmc_correcoes')
      .select('id, codigo_ajuste_omie, cmc_anterior, cmc_aplicado, qtd_saldo_no_ajuste, status, criado_em')
      .eq('conta_omie', conta)
      .eq('codigo_produto', idProd)
      .eq('codigo_local_estoque', codLocal)
      .eq('status', 'aplicado')
      .gte('criado_em', lim)
      .order('criado_em', { ascending: false })
      .limit(1);
    if (recentes && recentes[0] && Math.abs(Number(recentes[0].cmc_aplicado) - novoCMC) < 0.0001) {
      return {
        ok: true,
        jaAplicado: true,
        duplicado: true,
        codigoAjuste: recentes[0].codigo_ajuste_omie,
        cmcAnterior: Number(recentes[0].cmc_anterior),
        cmcAplicado: Number(recentes[0].cmc_aplicado),
        qtdSaldo: Number(recentes[0].qtd_saldo_no_ajuste),
        correcaoId: recentes[0].id,
      };
    }
  } catch {
    /* não bloqueia */
  }

  // Lê o estado real no Omie (quantidade física do local + CMC atual).
  const pos = await obterPosicaoEstoqueProduto(conta, idProd, { codigoLocalEstoque: codLocal });
  const qtdFisico = Number.isFinite(pos.fisico) && pos.fisico !== 0 ? pos.fisico : Number.isFinite(pos.saldo) && pos.saldo !== 0 ? pos.saldo : 0;
  if (qtdFisico === 0) {
    throw new Error(`produto com estoque físico zero no local ${codLocal} (fisico=${pos.fisico}, saldo=${pos.saldo}) - ajuste de CMC via SLD não é aplicável`);
  }
  const cmcAnterior = pos.cmc;

  // Origem da correção (afeta a observação gravada no Omie e o log).
  const fornecedorId = body.fornecedorId != null && body.fornecedorId !== '' ? Number(body.fornecedorId) || null : null;
  const fornecedorNome = body.fornecedorNome ? String(body.fornecedorNome).trim() : null;
  const origemCorrecao =
    body.origemCorrecao === 'ajuste_custo'
      ? 'ajuste_custo'
      : body.origemCorrecao === 'estoque_negativo'
        ? 'estoque_negativo'
        : body.cmcSugerido != null && body.novoCMC != null && Math.abs(Number(body.cmcSugerido) - Number(body.novoCMC)) > 0.0001
          ? 'manual'
          : 'garantia';
  const nfNum = body.nfOrigemNumero ? String(body.nfOrigemNumero).trim() : '';
  let obs = body.obs && String(body.obs).trim();
  if (!obs) {
    if (origemCorrecao === 'ajuste_custo') obs = `Ajuste de custo inicial (CMC)${fornecedorNome ? ' - fornecedor ' + fornecedorNome : ''}`;
    else if (origemCorrecao === 'estoque_negativo') obs = 'Correcao de CMC - bug de estoque negativo (Omie)';
    else if (nfNum) obs = `Correcao de CMC - NF-e ${nfNum} - garantia distorceu o custo`;
    else obs = 'Correcao de CMC - entrada de garantia distorceu o custo';
  } else if (origemCorrecao === 'ajuste_custo' && fornecedorNome && !obs.toLowerCase().includes(fornecedorNome.toLowerCase())) {
    obs = `${obs} - fornecedor ${fornecedorNome}`;
  }
  if (obs.length > 240) obs = obs.slice(0, 237) + '...';

  // Aplica o ajuste
  let resultado: any = null;
  let erro: string | null = null;
  try {
    resultado = await incluirAjusteCMC(conta, {
      idProd,
      codProduto: idProd,
      codInt: codigoIntegracao,
      codLocal,
      qtdFisicoAtual: qtdFisico,
      novoCMC,
      obs,
      dataBR: body.dataBR,
    });
  } catch (e: any) {
    erro = e.faultstring || e.message;
  }

  // Grava o log de auditoria
  const nfDataISO = body.nfOrigemDataBR ? parseBR(fmtBR(parseAnyDate(body.nfOrigemDataBR) as Date)) || null : null;
  const linha = {
    conta_omie: conta,
    codigo_produto: idProd,
    codigo_integracao: codigoIntegracao,
    descricao_produto: descricao,
    codigo_local_estoque: codLocal,
    cmc_anterior: cmcAnterior,
    cmc_aplicado: erro ? null : novoCMC,
    cmc_sugerido: body.cmcSugerido != null ? Number(body.cmcSugerido) : null,
    qtd_saldo_no_ajuste: qtdFisico,
    estrategia_sugestao: body.estrategiaSugestao || null,
    nf_origem_numero: body.nfOrigemNumero || null,
    nf_origem_data: nfDataISO,
    cfop_origem: body.cfopOrigem || null,
    custo_garantia_unit: body.custoGarantiaUnit != null ? Number(body.custoGarantiaUnit) : null,
    fornecedor_id: fornecedorId,
    fornecedor_nome: fornecedorNome,
    origem: origemCorrecao,
    codigo_ajuste_omie: resultado && resultado.codigoAjuste != null ? Number(resultado.codigoAjuste) || resultado.codigoAjuste : null,
    status: erro ? 'erro' : 'aplicado',
    erro: erro || null,
    obs,
    raw_request: resultado ? resultado.rawRequest : null,
    raw_response: resultado ? resultado.rawResponse : erro ? { erro } : null,
    criado_por: criadoPor || body.criadoPor || 'app',
  };
  let correcaoId: number | null = null;
  try {
    const { data, error } = await supabase.from('cmc_correcoes').insert(linha).select('id').single();
    if (error) console.warn('[cmc] insert cmc_correcoes:', error.message);
    correcaoId = (data as any)?.id ?? null;
  } catch (e: any) {
    console.warn('[cmc] insert cmc_correcoes:', e.message);
  }

  cache.invalidatePrefix(`analise:${conta}:`);

  if (erro) {
    const err = httpErr(502, `falha ao aplicar ajuste no Omie: ${erro}`);
    err.correcaoId = correcaoId;
    throw err;
  }
  return { ok: true, codigoAjuste: resultado.codigoAjuste, cmcAnterior, cmcAplicado: novoCMC, qtdSaldo: qtdFisico, correcaoId };
}

/** Aplica um lote de correções em sequência (throttle entre elas). */
export async function aplicarCorrecoesLote(correcoes: CorrecaoBody[], criadoPor = 'app-lote'): Promise<any> {
  const resultados: any[] = [];
  for (let i = 0; i < correcoes.length; i++) {
    const c = correcoes[i];
    try {
      const r = await aplicarUmaCorrecao(c, criadoPor);
      resultados.push({ codigoProduto: c.codigoProduto ?? null, codLocal: c.codLocal ?? null, ok: true, ...r });
    } catch (e: any) {
      resultados.push({ codigoProduto: c.codigoProduto ?? null, codLocal: c.codLocal ?? null, ok: false, erro: e.message, correcaoId: e.correcaoId || null });
    }
    if (i < correcoes.length - 1) await sleep(SLEEP_BETWEEN_PAGES);
  }
  return { ok: resultados.every((r) => r.ok), resultados };
}

// ---- Reverter correção ----

/** Reverte uma correção (exclui o ajuste no Omie + marca revertido). Portado de /api/reverter-correcao. */
export async function reverterCorrecao(correcaoId: number): Promise<any> {
  const { data: row, error: e1 } = await supabase.from('cmc_correcoes').select('*').eq('id', correcaoId).single();
  if (e1 || !row) throw httpErr(404, 'correcao nao encontrada');
  if (row.status === 'revertido') return { ok: true, jaRevertido: true };
  if (row.status === 'erro') throw httpErr(400, 'essa correcao registrou erro - nao ha ajuste para reverter');

  const ajusteId = row.codigo_ajuste_omie ?? (row.raw_response && (row.raw_response.id_ajuste ?? row.raw_response.nCodAjuste)) ?? null;
  if (ajusteId == null) {
    throw httpErr(400, 'sem id do ajuste no log - reverta manualmente no Omie (Estoque > Ajustes de Estoque)');
  }
  // conta a partir do label gravado (já é 'NOVA'/'CASTRO')
  const contaId = (getContasOmie().find((c) => c.label === row.conta_omie) || ({} as any)).id as Conta | undefined;
  if (!contaId) throw httpErr(400, `conta "${row.conta_omie}" sem credenciais configuradas`);

  let resp: any = null;
  let erro: string | null = null;
  try {
    resp = await excluirAjusteEstoque(contaId, ajusteId);
  } catch (e: any) {
    erro = e.faultstring || e.message;
  }
  if (erro) {
    try {
      await supabase.from('cmc_correcoes').update({ erro: `reverter falhou: ${erro}` }).eq('id', correcaoId);
    } catch {
      /* ignore */
    }
    throw httpErr(502, `falha ao reverter no Omie: ${erro}`);
  }
  try {
    await supabase
      .from('cmc_correcoes')
      .update({ status: 'revertido', erro: null, raw_response: { ...(row.raw_response || {}), reverter: resp } })
      .eq('id', correcaoId);
  } catch (e: any) {
    console.warn('[cmc] update status revertido:', e.message);
  }
  cache.invalidatePrefix(`analise:${contaId}:`);
  cache.invalidatePrefix(`pendentes:${contaId}:`);
  return { ok: true, ajusteId };
}

// ---- Histórico ----

export async function listarHistorico(conta?: Conta, produto?: number | null): Promise<any[]> {
  let q = supabase.from('cmc_correcoes').select('*').order('criado_em', { ascending: false }).limit(1000);
  if (conta) q = q.eq('conta_omie', conta);
  if (produto != null && Number.isFinite(produto)) q = q.eq('codigo_produto', produto);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// ---- Ajuste de custos ----

/** Lista produtos da conta (saldo + CMC) da tabela `produtos` sincronizada. */
export async function listarAjusteCustosProdutos(conta: Conta, force = false): Promise<any> {
  const chave = `ajuste_custos_produtos:${conta}`;
  if (!force) {
    const hit = cache.get<any>(chave);
    if (hit) return hit.valor;
  }
  const produtos: any[] = [];
  let sincronizadoEm: string | null = null;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('produtos')
      .select('codigo_produto, codigo, descricao, estoque, cmc, atualizado_em, inativo, arquivado')
      .eq('conta_omie', conta)
      .order('codigo_produto', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const p of data) {
      if (p.arquivado === true) continue;
      const estoque = Number(p.estoque || 0);
      produtos.push({
        codigoProduto: p.codigo_produto,
        codigo: p.codigo || null,
        descricao: p.descricao || null,
        saldoTotal: estoque,
        cmc: Number(p.cmc || 0),
        codLocal: null,
        ajustavel: estoque !== 0,
        inativo: p.inativo === true,
      });
      if (p.atualizado_em && (!sincronizadoEm || p.atualizado_em > sincronizadoEm)) sincronizadoEm = p.atualizado_em;
    }
    if (data.length < PAGE) break;
  }
  produtos.sort((a, b) => String(a.codigo || a.codigoProduto).localeCompare(String(b.codigo || b.codigoProduto), 'pt-BR', { numeric: true }));
  const payload = {
    conta,
    contaLabel: conta,
    total: produtos.length,
    produtos,
    sincronizadoEm,
    fonte: 'tabela produtos (sync)',
    geradoEm: new Date().toISOString(),
  };
  cache.set(chave, payload, 180);
  return payload;
}

/** Mapa codigo->{nome} de clientes/fornecedores (cache 1h). */
async function obterMapaClientes(conta: Conta): Promise<Record<string, any>> {
  const chave = `clientes_map:${conta}`;
  const hit = cache.get<Record<string, any>>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try {
    arr = await listarClientesResumido(conta);
  } catch (e: any) {
    console.warn('[clientes]', e.message);
  }
  const map: Record<string, any> = {};
  for (const c of arr || []) {
    const cod = c.codigo_cliente ?? c.nCod ?? c.codigo;
    if (cod == null) continue;
    const nome = c.nome_fantasia || c.razao_social || c.cnome || c.nome || null;
    if (!nome) continue;
    map[String(cod)] = { nome, cnpj: c.cnpj_cpf || null, cidade: c.cidade || null };
  }
  cache.set(chave, map, 3600);
  return map;
}

/** Lista fornecedores (clientes) para o dropdown do ajuste de custos. */
export async function listarFornecedores(conta: Conta): Promise<any> {
  const map = await obterMapaClientes(conta);
  const fornecedores = Object.keys(map || {})
    .map((id) => ({ id: Number(id) || id, nome: map[id].nome }))
    .filter((f) => f.nome)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { total: fornecedores.length, fornecedores };
}

/** Aplica CMC inicial de um produto (resolve local ao vivo). Portado de /api/ajuste-custos/aplicar. */
export async function aplicarAjusteCusto(b: CorrecaoBody, criadoPor = 'ajuste-custos'): Promise<any> {
  const conta = b.conta as Conta;
  if (!contaConfigurada(conta)) throw httpErr(400, `Conta "${b.conta}" sem credenciais Omie configuradas`);
  const idProd = b.codigoProduto != null ? Number(b.codigoProduto) : null;
  if (!idProd) throw httpErr(400, 'informe codigoProduto');

  let codLocal = b.codLocal != null && b.codLocal !== '' ? Number(b.codLocal) : null;
  if (codLocal == null || !Number.isFinite(codLocal)) {
    codLocal = await resolverLocalAjuste(conta, idProd);
  }

  const r = await aplicarUmaCorrecao(
    {
      conta,
      codigoProduto: idProd,
      codLocal,
      novoCMC: b.novoCMC,
      descricao: b.descricao,
      obs: b.obs,
      fornecedorId: b.fornecedorId,
      fornecedorNome: b.fornecedorNome,
      origemCorrecao: 'ajuste_custo',
    },
    b.criadoPor || criadoPor,
  );
  cache.invalidatePrefix(`ajuste_custos_produtos:${conta}`);
  return { ...r, codLocal };
}

// Reexport para uso nas rotas (evita import duplicado de fmtISO em outros lugares).
export { fmtISO, CONTA_DEFAULT };
