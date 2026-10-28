// Backfill de CMC em vendas_itens + backfill do campo `modelo` em produtos.
// Portado de server.js: buscarCMCNaData, /api/admin/enriquecer-cmc,
// enriquecer-cmc-loop (+ estado), backfill-modelo (+ estado), vendas-cmc.
//
// Estados em memória são singletons module-level keyed por conta (mesmo padrão
// dos caches de vendas-sync). Jobs em background = funções fire-and-forget.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { sleep } from './utils';
import { OmieBloqueioError } from '@/lib/omie/porta';
import { chavePar, paresParaTentar, proximaTentativa, type Par, type Tentativa } from './cmc-tentativas';
import type { Conta } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// === CMC numa data exata via API Omie (PosicaoEstoque com param data) ===
// Só guarda custo encontrado: o "sem custo" e o erro não ficam no cache (antes ficavam e
// a nova tentativa dias depois respondia do cache, sem perguntar de novo à Omie).
const cmcCache: Record<string, number> = {}; // 'conta:codigo:DD/MM/YYYY' => cmc

async function consultarCMCNaData(codigoProduto: string, dataStr: string, conta: Conta): Promise<{ cmc: number | null; chamou: boolean }> {
  const cacheKey = conta + ':' + codigoProduto + ':' + dataStr;
  if (cmcCache[cacheKey] !== undefined) return { cmc: cmcCache[cacheKey], chamou: false };
  const r = await omieRequest<{ cmc?: number; faultstring?: string }>(
    '/estoque/consulta/', 'PosicaoEstoque',
    { id_prod: parseInt(codigoProduto, 10), codigo_local_estoque: 0, data: dataStr },
    { conta },
  );
  // fault de negócio (produto não existe na data etc.) é resposta: conta como sem custo
  const cmc = num(r.cmc);
  if (cmc <= 0) return { cmc: null, chamou: true };
  cmcCache[cacheKey] = cmc;
  return { cmc, chamou: true };
}

// ============================================================================
// Backfill de cmc_unitario: cada par produto+data é tentado UMA vez por rodada.
// Custo 0 na Omie → espera 1/7/30 dias em vendas_cmc_tentativas; na 4ª desiste.
// ============================================================================
export interface EnriquecerContaResult {
  conta: Conta;
  pares: number;
  tentados: number;
  enriquecidos: number;
  semCusto: number;
  desistidos: number;
  adiados: number;
  jaDesistidos: number;
  erros: number;
  chamadasOmie: number;
  restantes: number;
  paradoPor?: string;
  semTabelaTentativas?: boolean;
}

const tabelaFaltando = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /vendas_cmc_tentativas/.test(e.message || ''));

async function lerItensSemCusto(conta: Conta): Promise<Par[]> {
  const out: Par[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('vendas_itens')
      .select('codigo_produto,data_pedido')
      .eq('conta_omie', conta)
      .is('cmc_unitario', null)
      .not('codigo_produto', 'is', null)
      .not('data_pedido', 'is', null)
      .order('id')
      .range(de, de + 999);
    if (error) throw new Error('vendas_itens: ' + error.message);
    out.push(...((data || []) as Par[]));
    if (!data || data.length < 1000) return out;
  }
}

async function lerTentativas(conta: Conta): Promise<Map<string, Tentativa> | null> {
  const mapa = new Map<string, Tentativa>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('vendas_cmc_tentativas')
      .select('codigo_produto,data_pedido,tentativas,proxima_em,ultimo_resultado')
      .eq('conta_omie', conta)
      .order('codigo_produto').order('data_pedido')
      .range(de, de + 999);
    if (error) {
      if (tabelaFaltando(error)) return null;
      throw new Error('vendas_cmc_tentativas: ' + error.message);
    }
    for (const t of (data || []) as Array<Par & Tentativa>) mapa.set(chavePar(t), t);
    if (!data || data.length < 1000) return mapa;
  }
}

export async function enriquecerCMCConta(
  conta: Conta,
  opts: { maxMs?: number; limitePares?: number; aoProgresso?: (r: EnriquecerContaResult) => void } = {},
): Promise<EnriquecerContaResult> {
  const inicio = Date.now();
  const agora = new Date();
  const linhas = await lerItensSemCusto(conta);
  const tentativas = await lerTentativas(conta);
  const { pares, adiados, desistidos: jaDesistidos } = paresParaTentar(linhas, tentativas ?? new Map(), agora);
  const fila = opts.limitePares ? pares.slice(0, opts.limitePares) : pares;
  const r: EnriquecerContaResult = {
    conta, pares: pares.length, tentados: 0, enriquecidos: 0, semCusto: 0, desistidos: 0,
    adiados, jaDesistidos, erros: 0, chamadasOmie: 0, restantes: 0,
    ...(tentativas ? {} : { semTabelaTentativas: true }),
  };

  const gravarTentativa = async (p: Par, t: Tentativa) => {
    if (!tentativas) return;
    const { error } = await supabase.from('vendas_cmc_tentativas').upsert({
      conta_omie: conta, codigo_produto: p.codigo_produto, data_pedido: p.data_pedido,
      ...t, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'conta_omie,codigo_produto,data_pedido' });
    if (error) console.log('[cmc-backfill] tentativa não gravada: ' + error.message);
  };

  for (let i = 0; i < fila.length; i++) {
    if (opts.maxMs && Date.now() - inicio > opts.maxMs) {
      r.restantes = fila.length - i;
      r.paradoPor = 'tempo';
      break;
    }
    const p = fila[i];
    const k = chavePar(p);
    r.tentados++;
    try {
      const { cmc, chamou } = await consultarCMCNaData(p.codigo_produto, p.data_pedido, conta);
      if (chamou) r.chamadasOmie++;
      if (cmc !== null && cmc > 0) {
        const { error } = await supabase
          .from('vendas_itens')
          .update({ cmc_unitario: cmc })
          .eq('codigo_produto', p.codigo_produto)
          .eq('data_pedido', p.data_pedido)
          .eq('conta_omie', conta);
        if (error) throw new Error(error.message);
        r.enriquecidos++;
        if (tentativas?.has(k)) await supabase.from('vendas_cmc_tentativas').delete()
          .eq('conta_omie', conta).eq('codigo_produto', p.codigo_produto).eq('data_pedido', p.data_pedido);
      } else {
        const t = proximaTentativa(tentativas?.get(k), 'sem_custo', agora);
        if (!t.proxima_em) r.desistidos++; else r.semCusto++;
        await gravarTentativa(p, t);
      }
    } catch (e) {
      if (e instanceof OmieBloqueioError) {
        r.tentados--;
        r.restantes = fila.length - i;
        r.paradoPor = 'bloqueio da Omie: ' + e.message;
        break;
      }
      r.erros++;
      await gravarTentativa(p, proximaTentativa(tentativas?.get(k), 'erro', agora));
    }
    if (r.tentados % 25 === 0) opts.aoProgresso?.(r);
  }
  return r;
}

// Lote avulso (rota /api/estoque/admin/enriquecer-cmc): os `limite` pares mais recentes.
export interface EnriquecerLoteResult {
  ok?: boolean;
  erro?: string;
  conta?: Conta;
  processados?: number;
  enriquecidos?: number;
  erros?: number;
  pendentesRestantes?: number;
  mensagem?: string;
}

export async function enriquecerCMCLote(conta: Conta, limite: number): Promise<EnriquecerLoteResult> {
  const r = await enriquecerCMCConta(conta, { limitePares: limite });
  if (!r.pares) return { ok: true, conta, enriquecidos: 0, mensagem: 'Nenhum item sem CMC para tentar agora' };
  return {
    ok: true, conta, processados: r.tentados, enriquecidos: r.enriquecidos, erros: r.erros,
    pendentesRestantes: Math.max(0, r.pares - r.tentados),
    ...(r.paradoPor ? { mensagem: 'Parou: ' + r.paradoPor } : {}),
  };
}

// ============================================================================
// enriquecer-cmc-loop: a mesma passada em segundo plano + status.
// ============================================================================
export interface EnriquecerLoopState {
  rodando: boolean;
  processados: number;
  enriquecidos: number;
  semCMC: number;
  erros: number;
  iniciadoEm: string;
  finalizadoEm: string | null;
  ultimoLog: string | null;
}

const enriquecimentoLoopState: Record<string, EnriquecerLoopState> = {};

export function getEnriquecimentoStatus(conta?: Conta): EnriquecerLoopState | Record<string, EnriquecerLoopState> | { vazio: true; mensagem: string } {
  if (!conta) return enriquecimentoLoopState;
  return enriquecimentoLoopState[conta] || { vazio: true as const, mensagem: 'Sem estado pra ' + conta };
}

export function iniciarEnriquecimentoCMC(conta: Conta): { ok?: boolean; conta?: Conta; erro?: string; estado?: EnriquecerLoopState } {
  if (enriquecimentoLoopState[conta] && enriquecimentoLoopState[conta].rodando) {
    return { erro: 'Ja rodando pra ' + conta, estado: enriquecimentoLoopState[conta] };
  }
  const state: EnriquecerLoopState = {
    rodando: true, processados: 0, enriquecidos: 0, semCMC: 0, erros: 0,
    iniciadoEm: new Date().toISOString(), finalizadoEm: null, ultimoLog: null,
  };
  enriquecimentoLoopState[conta] = state;

  const copiar = (r: EnriquecerContaResult) => {
    state.processados = r.tentados;
    state.enriquecidos = r.enriquecidos;
    state.semCMC = r.semCusto + r.desistidos;
    state.erros = r.erros;
    state.ultimoLog = 'proc=' + r.tentados + ' enr=' + r.enriquecidos + ' semCMC=' + state.semCMC + ' err=' + r.erros
      + (r.paradoPor ? ' parou: ' + r.paradoPor : '');
  };
  (async () => {
    try {
      copiar(await enriquecerCMCConta(conta, { aoProgresso: copiar }));
    } catch (e) {
      console.log('Enriquecer-loop [' + conta + '] ERRO: ' + (e as Error).message);
      state.erros++;
    }
    state.rodando = false;
    state.finalizadoEm = new Date().toISOString();
  })();

  return { ok: true, conta };
}

// ============================================================================
// vendas-cmc: lista vendas_itens com cmc_unitario (paginado, filtrável).
// ============================================================================
export interface VendasCMCResult {
  vendas: Array<Record<string, unknown>>;
  total: number;
  filtrado: number;
  pagina: number;
  porPagina: number;
  resumo: { total: number; comCmc: number; semCmc: number };
}

export async function listarVendasCMC(conta: Conta, pagina: number, filtro: string, busca: string): Promise<VendasCMCResult> {
  const porPagina = 50;
  const { count: total } = await supabase.from('vendas_itens').select('*', { count: 'exact', head: true }).eq('conta_omie', conta);
  const { count: comCmc } = await supabase
    .from('vendas_itens')
    .select('*', { count: 'exact', head: true })
    .eq('conta_omie', conta)
    .not('cmc_unitario', 'is', null)
    .gt('cmc_unitario', 0);
  const semCmc = (total || 0) - (comCmc || 0);

  let q = supabase
    .from('vendas_itens')
    .select('numero_pedido,data_pedido,descricao,codigo_produto,quantidade,valor_unitario,valor_total,cmc_unitario,mes,ano', { count: 'exact' })
    .eq('conta_omie', conta);
  if (filtro === 'com_cmc') q = q.not('cmc_unitario', 'is', null).gt('cmc_unitario', 0);
  if (filtro === 'sem_cmc') q = q.or('cmc_unitario.is.null,cmc_unitario.eq.0');
  if (busca) q = q.or('descricao.ilike.%' + busca + '%,numero_pedido.ilike.%' + busca + '%,codigo_produto.ilike.%' + busca + '%');
  const offset = (pagina - 1) * porPagina;
  const { data: vendas, count: filtrado } = await q.order('data_pedido', { ascending: false }).range(offset, offset + porPagina - 1);

  return {
    vendas: (vendas as Array<Record<string, unknown>>) || [],
    total: total || 0,
    filtrado: filtrado || (vendas ? vendas.length : 0),
    pagina,
    porPagina,
    resumo: { total: total || 0, comCmc: comCmc || 0, semCmc },
  };
}

// ============================================================================
// backfill-modelo: preenche `modelo` em produtos via Omie ListarProdutos (BG).
// A tabela `produtos` NÃO tem conta_omie — modelo é global. Default conta=NOVA.
// ============================================================================
export interface BackfillModeloState {
  rodando: boolean;
  pagina: number;
  totalPaginas: number;
  lidos: number;
  comModelo: number;
  atualizados: number;
  semMatch: number;
  erros: number;
  soVazios: boolean;
  iniciadoEm: string;
  finalizadoEm: string | null;
  ultimoLog: string | null;
}

const backfillModeloState: Record<string, BackfillModeloState> = {};

export function getBackfillModeloStatus(conta?: Conta): BackfillModeloState | Record<string, BackfillModeloState> | { vazio: true; mensagem: string } {
  if (!conta) return backfillModeloState;
  return backfillModeloState[conta] || { vazio: true as const, mensagem: 'Sem estado pra ' + conta };
}

export function iniciarBackfillModelo(conta: Conta, soVazios: boolean): { ok?: boolean; conta?: Conta; soVazios?: boolean; erro?: string; estado?: BackfillModeloState } {
  if (backfillModeloState[conta] && backfillModeloState[conta].rodando) {
    return { erro: 'Backfill modelo ja rodando pra ' + conta, estado: backfillModeloState[conta] };
  }
  const state: BackfillModeloState = {
    rodando: true, pagina: 0, totalPaginas: 0,
    lidos: 0, comModelo: 0, atualizados: 0, semMatch: 0, erros: 0,
    soVazios, iniciadoEm: new Date().toISOString(), finalizadoEm: null, ultimoLog: null,
  };
  backfillModeloState[conta] = state;

  (async () => {
    try {
      const jaTem = new Set<string>();
      if (soVazios) {
        let offset = 0;
        while (true) {
          const { data } = await supabase
            .from('produtos')
            .select('codigo_produto')
            .not('modelo', 'is', null)
            .neq('modelo', '')
            .range(offset, offset + 999);
          if (!data || data.length === 0) break;
          (data as Array<{ codigo_produto: unknown }>).forEach((r) => jaTem.add(String(r.codigo_produto)));
          if (data.length < 1000) break;
          offset += 1000;
        }
      }

      let pag = 1;
      let totalPag = 1;
      while (pag <= totalPag) {
        let r: { faultstring?: string; total_de_paginas?: number; produto_servico_cadastro?: Array<{ codigo_produto?: unknown; modelo?: unknown }> };
        try {
          r = await omieRequest('/geral/produtos/', 'ListarProdutos', {
            pagina: pag, registros_por_pagina: 50, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N',
          }, { conta });
        } catch (e) {
          state.erros++;
          state.ultimoLog = 'pag ' + pag + ' ERRO: ' + (e as Error).message;
          break;
        }
        if (r.faultstring) {
          state.ultimoLog = 'pag ' + pag + ' fault: ' + r.faultstring;
          break;
        }
        if (pag === 1) {
          totalPag = r.total_de_paginas || 1;
          state.totalPaginas = totalPag;
        }
        const lista = r.produto_servico_cadastro || [];
        if (lista.length === 0) break;

        const updates: Array<{ codigo_produto: string; modelo: string | null }> = [];
        for (const p of lista) {
          state.lidos++;
          const cp = String(p.codigo_produto || '');
          const modelo = String(p.modelo || '').trim();
          if (!cp) continue;
          if (modelo) state.comModelo++;
          if (soVazios && jaTem.has(cp)) continue;
          updates.push({ codigo_produto: cp, modelo: modelo || null });
        }

        for (const u of updates) {
          try {
            const { error, count } = await supabase
              .from('produtos')
              .update({ modelo: u.modelo }, { count: 'exact' })
              .eq('codigo_produto', u.codigo_produto);
            if (error) { state.erros++; continue; }
            if (count && count > 0) state.atualizados++;
            else state.semMatch++;
          } catch {
            state.erros++;
          }
        }

        state.pagina = pag;
        state.ultimoLog = 'pag ' + pag + '/' + totalPag + ' lidos=' + state.lidos + ' atualizados=' + state.atualizados + ' semMatch=' + state.semMatch;
        pag++;
        await sleep(600);
      }
    } catch (e) {
      console.log('Backfill modelo [' + conta + '] ERRO: ' + (e as Error).message);
      state.erros++;
    }
    state.rodando = false;
    state.finalizadoEm = new Date().toISOString();
  })();

  return { ok: true, conta, soVazios };
}
