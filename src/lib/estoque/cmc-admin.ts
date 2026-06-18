// Backfill de CMC em vendas_itens + backfill do campo `modelo` em produtos.
// Portado de server.js: buscarCMCNaData, /api/admin/enriquecer-cmc,
// enriquecer-cmc-loop (+ estado), backfill-modelo (+ estado), vendas-cmc.
//
// Estados em memória são singletons module-level keyed por conta (mesmo padrão
// dos caches de vendas-sync). Jobs em background = funções fire-and-forget.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { sleep } from './utils';
import type { Conta } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// === CMC numa data exata via API Omie (PosicaoEstoque com param data) ===
const cmcCache: Record<string, number | null> = {}; // 'conta:codigo:DD/MM/YYYY' => cmc|null

async function buscarCMCNaData(codigoProduto: string, dataStr: string, conta: Conta): Promise<number | null> {
  if (!codigoProduto || !dataStr) return null;
  const cacheKey = conta + ':' + codigoProduto + ':' + dataStr;
  if (cmcCache[cacheKey] !== undefined) return cmcCache[cacheKey];
  try {
    const r = await omieRequest<{ cmc?: number }>(
      '/estoque/consulta/', 'PosicaoEstoque',
      { id_prod: parseInt(codigoProduto, 10), codigo_local_estoque: 0, data: dataStr },
      { conta },
    );
    const cmc = num(r.cmc);
    cmcCache[cacheKey] = cmc > 0 ? cmc : null;
  } catch {
    cmcCache[cacheKey] = null;
  }
  return cmcCache[cacheKey];
}

// ============================================================================
// enriquecer-cmc: backfill de cmc_unitario num lote (foreground, paginado pela UI).
// ============================================================================
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
  const { data: itens } = await supabase
    .from('vendas_itens')
    .select('codigo_produto,data_pedido')
    .eq('conta_omie', conta)
    .is('cmc_unitario', null)
    .not('codigo_produto', 'is', null)
    .not('data_pedido', 'is', null)
    .limit(limite * 10);
  if (!itens || itens.length === 0) return { ok: true, conta, enriquecidos: 0, mensagem: 'Nenhum item sem CMC' };

  const vistos = new Set<string>();
  const unicos: Array<{ codigo_produto: string; data_pedido: string }> = [];
  (itens as Array<{ codigo_produto: string; data_pedido: string }>).forEach((it) => {
    const k = it.codigo_produto + ':' + it.data_pedido;
    if (!vistos.has(k)) { vistos.add(k); unicos.push(it); }
  });
  const aProcessar = unicos.slice(0, limite);
  let enriquecidos = 0;
  let erros = 0;
  for (let i = 0; i < aProcessar.length; i++) {
    const it = aProcessar[i];
    try {
      const cmc = await buscarCMCNaData(it.codigo_produto, it.data_pedido, conta);
      if (cmc !== null && cmc > 0) {
        await supabase
          .from('vendas_itens')
          .update({ cmc_unitario: cmc })
          .eq('codigo_produto', it.codigo_produto)
          .eq('data_pedido', it.data_pedido)
          .eq('conta_omie', conta);
        enriquecidos++;
      }
    } catch {
      erros++;
    }
    if (i > 0 && i % 3 === 0) await sleep(1000);
  }
  return { ok: true, conta, processados: aProcessar.length, enriquecidos, erros, pendentesRestantes: unicos.length - aProcessar.length };
}

// ============================================================================
// enriquecer-cmc-loop: backfill em loop até esgotar (background) + status.
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

  (async () => {
    try {
      const tentados = new Set<string>();
      while (true) {
        const { data: itens } = await supabase
          .from('vendas_itens')
          .select('codigo_produto,data_pedido')
          .eq('conta_omie', conta)
          .is('cmc_unitario', null)
          .not('codigo_produto', 'is', null)
          .not('data_pedido', 'is', null)
          .order('codigo_produto', { ascending: true })
          .order('data_pedido', { ascending: true })
          .limit(1000);
        if (!itens || itens.length === 0) break;
        const novos: Array<{ codigo_produto: string; data_pedido: string }> = [];
        const vistos = new Set<string>();
        for (const it of itens as Array<{ codigo_produto: string; data_pedido: string }>) {
          const k = it.codigo_produto + ':' + it.data_pedido;
          if (vistos.has(k) || tentados.has(k)) continue;
          vistos.add(k);
          novos.push(it);
        }
        if (novos.length === 0) break;
        for (const it of novos) {
          const k = it.codigo_produto + ':' + it.data_pedido;
          tentados.add(k);
          try {
            const cmc = await buscarCMCNaData(it.codigo_produto, it.data_pedido, conta);
            if (cmc !== null && cmc > 0) {
              await supabase
                .from('vendas_itens')
                .update({ cmc_unitario: cmc })
                .eq('codigo_produto', it.codigo_produto)
                .eq('data_pedido', it.data_pedido)
                .eq('conta_omie', conta);
              state.enriquecidos++;
            } else {
              state.semCMC++;
            }
          } catch {
            state.erros++;
          }
          state.processados++;
          if (state.processados % 3 === 0) await sleep(1000);
          if (state.processados % 50 === 0) {
            state.ultimoLog = 'proc=' + state.processados + ' enr=' + state.enriquecidos + ' semCMC=' + state.semCMC + ' err=' + state.erros;
          }
        }
      }
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
