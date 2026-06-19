/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Verificacao diaria + Alertas. Portado dos helpers/rotas de server.js
// (lerSnapshotEstoque, salvarSnapshotEstoque, gravarAlerta, guardarNegativosCache,
// rodarVerificacaoDiaria, /api/verificacao/*, /api/alertas*).
//
// O motor `verificacaoDiaria` ja vive em lib/ajustes/analise.ts; aqui montamos
// os CALLBACKS que ele recebe (gravarAlerta, lerSnapshot, salvarSnapshot,
// guardarNegativos, listarPedidos) e o disparo em background.
//
// WORKER-READY: o estado da verificacao vive na tabela ajustes_jobs (nao em
// memoria). iniciarVerificacao cria o job 'verificacao-diaria' (conta=null) e
// dispara a varredura async; lerStatusVerificacao le o job do Supabase.
//
// REGRA DE CONTA: conta e' SEMPRE 'NOVA'/'CASTRO'. labelConta(conta) === conta.
// ============================================================================

import type { Conta, ContaFiltro } from './conta';
import { labelConta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { verificacaoDiaria } from './analise';
import { anotarCorrecoesAplicadas } from './cmc';
import { resolveJanelaBR } from './cmc';
import { listarPedidosEnriquecidos } from './pedidos';
import { criarJob, atualizarJob, concluirJob, falharJob, lerJobAtivo, jobRodando } from './jobs';

const NEGATIVOS_CACHE_SEG = (parseInt(process.env.NEGATIVOS_CACHE_HORAS || '', 10) || 6) * 3600;

function hojeISOStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Callbacks da verificacaoDiaria ----

/** Le o ultimo snapshot de estoque da conta (cmc_estoque_ultima_varredura). */
export async function lerSnapshotEstoque(conta: Conta): Promise<{ data: any; snapshot: any } | null> {
  try {
    const { data, error } = await supabase
      .from('cmc_estoque_ultima_varredura')
      .select('data, snapshot')
      .eq('conta_omie', labelConta(conta))
      .single();
    if (error || !data) return null;
    return { data: data.data, snapshot: data.snapshot || {} };
  } catch {
    return null;
  }
}

/** Salva (upsert) o snapshot de estoque de hoje da conta. */
export async function salvarSnapshotEstoque(conta: Conta, snapshot: any): Promise<void> {
  try {
    await supabase
      .from('cmc_estoque_ultima_varredura')
      .upsert(
        {
          conta_omie: labelConta(conta),
          data: hojeISOStr(),
          snapshot,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'conta_omie' },
      );
  } catch (e: any) {
    console.warn('[verificacao] salvarSnapshot:', e.message);
  }
}

export interface AlertaInput {
  conta_omie?: string | null;
  tipo?: string | null;
  codigo_produto?: number | string | null;
  codigo_integracao?: string | null;
  descricao_produto?: string | null;
  ref?: string | null;
  detalhe?: any;
}

/**
 * Grava um alerta em cmc_alertas, com dedup: nao re-alerta o mesmo `ref` nos
 * ultimos 30 dias. Retorna true se gravou.
 */
export async function gravarAlerta(alerta: AlertaInput): Promise<boolean> {
  try {
    if (alerta.ref) {
      const lim = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: ex } = await supabase
        .from('cmc_alertas')
        .select('id')
        .eq('ref', alerta.ref)
        .gte('criado_em', lim)
        .limit(1);
      if (ex && ex[0]) return false;
    }
    const { error } = await supabase.from('cmc_alertas').insert({
      conta_omie: alerta.conta_omie || null,
      tipo: alerta.tipo || null,
      codigo_produto: alerta.codigo_produto != null ? Number(alerta.codigo_produto) || alerta.codigo_produto : null,
      codigo_integracao: alerta.codigo_integracao || null,
      descricao_produto: alerta.descricao_produto || null,
      ref: alerta.ref || null,
      detalhe: alerta.detalhe != null ? alerta.detalhe : null,
    });
    if (error) {
      console.warn('[verificacao] insert alerta:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn('[verificacao] gravarAlerta:', e.message);
    return false;
  }
}

/** Atualiza o cache/state da aba Estoque negativo com o resultado da analise. */
export async function guardarNegativosCache(conta: Conta, resultado: any): Promise<void> {
  try {
    await anotarCorrecoesAplicadas(resultado);
  } catch {
    /* ignora */
  }
  cache.set(`negativos:${conta}`, resultado, NEGATIVOS_CACHE_SEG);
}

/**
 * Objeto com os callbacks da verificacaoDiaria (sem onProgress, que e' ligado
 * por quem dispara). Exportado para a Fase 6 reusar no cron.
 */
export const verificacaoDiariaCallbacks = {
  gravarAlerta,
  lerSnapshot: lerSnapshotEstoque,
  salvarSnapshot: salvarSnapshotEstoque,
  guardarNegativos: guardarNegativosCache,
  // lista pedidos abertos enriquecidos (com diasParadoEtapa); usado p/ gerar
  // alertas pedido_parado. Janela = default (resolveJanelaBR(null, null)).
  listarPedidos: async (conta: Conta): Promise<any[]> => {
    try {
      const { dataDeBR, dataAteBR } = resolveJanelaBR(null, null);
      return await listarPedidosEnriquecidos(conta, dataDeBR, dataAteBR);
    } catch (e: any) {
      console.warn('[verificacao] listarPedidos falhou:', e.message);
      return [];
    }
  },
};

// ---- Disparo WORKER-READY ----

/**
 * Inicia a verificacao diaria em background (worker-ready: job 'verificacao-diaria',
 * conta=null). Se ja ha uma rodando, retorna { jaRodando:true }. Senao { jobId }.
 */
export async function iniciarVerificacao(criadoPor?: string): Promise<any> {
  if (await jobRodando('verificacao-diaria', null)) {
    const ativo = await lerJobAtivo('verificacao-diaria', null);
    return { ok: true, rodando: true, jaRodando: true, jobId: ativo?.id, etapa: ativo?.etapa };
  }
  const jobId = await criarJob('verificacao-diaria', null, criadoPor);

  // dispara em background (Railway: processo long-lived via next start)
  (async () => {
    try {
      const resumo = await verificacaoDiaria({
        onProgress: (m: string) => {
          atualizarJob(jobId, { etapa: m });
          console.log(`[verificacao] ${m}`);
        },
        ...verificacaoDiariaCallbacks,
      });
      await concluirJob(jobId, resumo);
    } catch (e: any) {
      await falharJob(jobId, e.faultstring || e.message);
      console.error('[verificacao]', e);
    }
  })();

  return { ok: true, rodando: true, jobId };
}

/** Estado da verificacao diaria (le o job do Supabase). */
export async function lerStatusVerificacao(): Promise<any> {
  const ativo = await lerJobAtivo('verificacao-diaria', null);
  if (!ativo) return { rodando: false, semDados: true };
  if (ativo.status === 'rodando') {
    return { rodando: true, etapa: ativo.etapa, inicio: ativo.iniciado_em, jobId: ativo.id };
  }
  if (ativo.status === 'concluido') {
    return { rodando: false, etapa: ativo.etapa, inicio: ativo.iniciado_em, fim: ativo.atualizado_em, ultimoResumo: ativo.resultado || null, jobId: ativo.id };
  }
  if (ativo.status === 'erro') {
    return { rodando: false, etapa: ativo.etapa, inicio: ativo.iniciado_em, fim: ativo.atualizado_em, erro: ativo.erro, jobId: ativo.id };
  }
  return { rodando: false };
}

// ---- Alertas (consulta + marcar lido) ----

export interface ListarAlertasOpts {
  conta?: ContaFiltro;
  lido?: boolean;
  tipo?: string;
}

/** Lista alertas (cmc_alertas), filtrando por conta/lido/tipo. */
export async function listarAlertas(opts: ListarAlertasOpts = {}): Promise<{ alertas: any[]; naoLidos: number }> {
  let q = supabase
    .from('cmc_alertas')
    .select('*')
    .order('lido', { ascending: true })
    .order('criado_em', { ascending: false })
    .limit(500);
  if (opts.conta) q = q.eq('conta_omie', labelConta(opts.conta));
  if (opts.lido === false) q = q.eq('lido', false);
  if (opts.lido === true) q = q.eq('lido', true);
  if (opts.tipo) q = q.eq('tipo', opts.tipo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const alertas = data || [];
  const naoLidos = alertas.filter((a: any) => !a.lido).length;
  return { alertas, naoLidos };
}

export interface MarcarLidoOpts {
  ids?: Array<number | string>;
  conta?: ContaFiltro;
  lido?: boolean;
}

/**
 * Marca alertas como lido/nao-lido. Se vier `ids`, marca esses; senao marca
 * TODOS (opcionalmente filtrando por conta).
 */
export async function marcarLido(opts: MarcarLidoOpts = {}): Promise<{ ok: boolean; todos?: boolean; ids?: number[] }> {
  const lido = opts.lido === false ? false : true;
  const ids = (Array.isArray(opts.ids) ? opts.ids : []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (ids.length === 0) {
    // marca todos (opcionalmente filtrando por conta)
    let q = supabase.from('cmc_alertas').update({ lido }).eq('lido', !lido);
    if (opts.conta) q = q.eq('conta_omie', labelConta(opts.conta));
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true, todos: true };
  }
  const { error } = await supabase.from('cmc_alertas').update({ lido }).in('id', ids);
  if (error) throw new Error(error.message);
  return { ok: true, ids };
}
