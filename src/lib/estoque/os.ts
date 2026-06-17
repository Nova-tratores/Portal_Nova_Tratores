// Ordens de Serviço (OS): total faturado por mês (os_mensal) + sync da Omie.
// Portado de server.js: buscarTodasOS, buscarOSPeriodo, obterTotalOS,
// obterTotalOSConsolidado, agendarRefreshOS*. Threading explícito de conta;
// "Todas" (undefined) soma todas as contas configuradas.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { fmtD, parseDataBR, sleep, ehMesAtual } from './utils';
import { salvarControleCache, obterControleCache } from './vendas-sync';
import { getContasOmie, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// Cache em-memória de TODAS as OS por conta (10 min) + dedup de refresh BG.
const todasOSCachePorConta: Record<string, Array<Record<string, unknown>>> = {};
const refreshOSInFlight: Record<string, Promise<void>> = {};

export async function buscarTodasOS(conta: Conta): Promise<Array<Record<string, unknown>>> {
  if (todasOSCachePorConta[conta]) return todasOSCachePorConta[conta];
  const todas: Array<Record<string, unknown>> = [];
  let pag = 1;
  let totalPaginas = 1;
  while (pag <= totalPaginas) {
    try {
      const r = await omieRequest<{
        faultstring?: string;
        total_de_paginas?: number;
        osCadastro?: Array<Record<string, unknown>>;
      }>('/servicos/os/', 'ListarOS', { pagina: pag, registros_por_pagina: 500 }, { conta });
      if (r.faultstring) break;
      if (pag === 1) totalPaginas = r.total_de_paginas || 1;
      if (!r.osCadastro || r.osCadastro.length === 0) break;
      todas.push(...r.osCadastro);
      pag++;
      await sleep(500);
    } catch {
      break;
    }
  }
  todasOSCachePorConta[conta] = todas;
  setTimeout(() => { delete todasOSCachePorConta[conta]; }, 600_000);
  return todas;
}

/** Soma o valor faturado (etapa 60) das OS não canceladas no período [de, ate]. */
export async function buscarOSPeriodo(de: string, ate: string, conta: Conta): Promise<number> {
  const todas = await buscarTodasOS(conta);
  const dtDe = parseDataBR(de);
  const dtAte = parseDataBR(ate);
  let total = 0;
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    const cancelada = info.cCancelada || cab.cCancelada;
    if (cancelada === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) return;
    if (cab.cEtapa == '60') total += num(cab.nValorTotal);
  });
  return total;
}

function agendarRefreshOSMesAtual(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':' + mes + '-' + ano;
  if (refreshOSInFlight[key] !== undefined) return;
  refreshOSInFlight[key] = (async () => {
    try {
      const hoje = fmtD(new Date());
      const de = fmtD(new Date(ano, mes - 1, 1));
      const total = await buscarOSPeriodo(de, hoje, conta);
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: total, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
      await salvarControleCache('os', mes, ano, hoje, conta);
    } catch (e) {
      console.log('Refresh BG OS [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + (e as Error).message);
    } finally {
      delete refreshOSInFlight[key];
    }
  })();
}

function agendarRefreshOSPassado(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':OSpas:' + mes + '-' + ano;
  if (refreshOSInFlight[key] !== undefined) return;
  refreshOSInFlight[key] = (async () => {
    try {
      const de = fmtD(new Date(ano, mes - 1, 1));
      const ate = fmtD(new Date(ano, mes, 0));
      const total = await buscarOSPeriodo(de, ate, conta);
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: total, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
    } catch (e) {
      console.log('Refresh BG OS passado [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + (e as Error).message);
    } finally {
      delete refreshOSInFlight[key];
    }
  })();
}

/** Soma OS de todas as contas configuradas (modo "Todas"). */
async function obterTotalOSConsolidado(mes: number, ano: number): Promise<number> {
  let total = 0;
  for (const c of getContasOmie()) {
    total += (await obterTotalOS(mes, ano, c.id)) || 0;
  }
  return total;
}

/**
 * Valor total de OS de um mês. UI nunca espera Omie:
 *   - "Todas" → soma consolidada por conta
 *   - mês atual → cache + refresh BG (cold start busca síncrono)
 *   - mês passado → sempre cache; valor 0/ausente dispara refresh BG e retorna 0
 * Portado de obterTotalOS (server.js:1281).
 */
export async function obterTotalOS(mes: number, ano: number, conta: ContaFiltro): Promise<number> {
  if (conta === undefined) return obterTotalOSConsolidado(mes, ano);

  if (ehMesAtual(mes, ano)) {
    const hoje = fmtD(new Date());
    const ultimaData = await obterControleCache('os', mes, ano, conta);
    const { data } = await supabase
      .from('os_mensal')
      .select('valor_total')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('conta_omie', conta)
      .maybeSingle();
    if (data) {
      if (ultimaData !== hoje) agendarRefreshOSMesAtual(mes, ano, conta);
      return num(data.valor_total);
    }
    // Cold start: sem cache, busca síncrono
    const de = fmtD(new Date(ano, mes - 1, 1));
    const total = await buscarOSPeriodo(de, hoje, conta);
    await supabase.from('os_mensal').upsert({ mes, ano, valor_total: total, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
    await salvarControleCache('os', mes, ano, hoje, conta);
    return total;
  }

  // Meses passados: sempre serve cache
  const { data } = await supabase
    .from('os_mensal')
    .select('valor_total')
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('conta_omie', conta)
    .maybeSingle();
  if (data) {
    const valor = num(data.valor_total);
    if (valor === 0) agendarRefreshOSPassado(mes, ano, conta);
    return valor;
  }
  agendarRefreshOSPassado(mes, ano, conta);
  return 0;
}
