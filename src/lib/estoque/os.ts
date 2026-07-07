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

/** Totais de OS faturadas (etapa 60). nota/interno = null quando o cache mensal ainda não tem o split. */
export interface TotaisOS {
  total: number;
  nota: number | null;
  interno: number | null;
}

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

const hojeISO = (): string => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

interface OSFaturada {
  nCodOS: number;
  cNumOS: string;
  valor: number;
  mes: number;
  ano: number;
}

/**
 * Diz quais OS têm NFS-e emitida (retorna o Set de nCodOS "com nota").
 * O ListarOS não traz a NFS-e (DetalhesNfse vem vazio mesmo com nota emitida);
 * a fonte é o StatusOS por OS, cacheado em os_nfse. tem_nota=true é definitivo;
 * tem_nota=false é reverificado 1x/dia enquanto o mês da OS for o corrente
 * (a prefeitura pode autorizar a nota dias depois do faturamento).
 */
async function classificarNfseOS(lista: OSFaturada[], conta: Conta): Promise<Set<number>> {
  const comNota = new Set<number>();
  if (lista.length === 0) return comNota;
  const hoje = hojeISO();

  const cache = new Map<number, { tem_nota: boolean; verificado_em: string }>();
  const ids = lista.map((o) => o.nCodOS);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('os_nfse')
      .select('ncod_os,tem_nota,verificado_em')
      .eq('conta_omie', conta)
      .in('ncod_os', ids.slice(i, i + 200));
    (data || []).forEach((r) => cache.set(Number(r.ncod_os), { tem_nota: !!r.tem_nota, verificado_em: String(r.verificado_em) }));
  }

  for (const os of lista) {
    const c = cache.get(os.nCodOS);
    if (c?.tem_nota) { comNota.add(os.nCodOS); continue; }
    if (c && (c.verificado_em === hoje || !ehMesAtual(os.mes, os.ano))) continue; // sem nota, sem motivo pra reverificar
    try {
      const st = await omieRequest<{ ListaRpsNfse?: Array<{ nNfse?: unknown }> }>(
        '/servicos/os/', 'StatusOS', { nCodOS: os.nCodOS }, { conta },
      );
      const nfse = String((st.ListaRpsNfse || [])[0]?.nNfse || '');
      if (nfse) comNota.add(os.nCodOS);
      await supabase.from('os_nfse').upsert(
        { ncod_os: os.nCodOS, conta_omie: conta, num_os: os.cNumOS, nfse_num: nfse || null, tem_nota: !!nfse, verificado_em: hoje },
        { onConflict: 'ncod_os,conta_omie' },
      );
      await sleep(250);
    } catch {
      // Falhou o StatusOS: não grava nada (tenta de novo no próximo refresh).
      if (c?.tem_nota) comNota.add(os.nCodOS);
    }
  }
  return comNota;
}

/** Soma o valor faturado (etapa 60) das OS não canceladas no período [de, ate], separando com nota × interno. */
export async function buscarOSPeriodo(de: string, ate: string, conta: Conta): Promise<{ total: number; nota: number; interno: number }> {
  const todas = await buscarTodasOS(conta);
  const dtDe = parseDataBR(de);
  const dtAte = parseDataBR(ate);
  let total = 0;
  const faturadas: OSFaturada[] = [];
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    const cancelada = info.cCancelada || cab.cCancelada;
    if (cancelada === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) return;
    if (cab.cEtapa == '60') {
      const valor = num(cab.nValorTotal);
      total += valor;
      faturadas.push({ nCodOS: num(cab.nCodOS), cNumOS: String(cab.cNumOS || ''), valor, mes: dtOS.getMonth() + 1, ano: dtOS.getFullYear() });
    }
  });
  const comNota = await classificarNfseOS(faturadas, conta);
  let nota = 0;
  faturadas.forEach((f) => { if (comNota.has(f.nCodOS)) nota += f.valor; });
  return { total, nota, interno: total - nota };
}

function agendarRefreshOSMesAtual(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':' + mes + '-' + ano;
  if (refreshOSInFlight[key] !== undefined) return;
  refreshOSInFlight[key] = (async () => {
    try {
      const hoje = fmtD(new Date());
      const de = fmtD(new Date(ano, mes - 1, 1));
      const t = await buscarOSPeriodo(de, hoje, conta);
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
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
      const t = await buscarOSPeriodo(de, ate, conta);
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
    } catch (e) {
      console.log('Refresh BG OS passado [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + (e as Error).message);
    } finally {
      delete refreshOSInFlight[key];
    }
  })();
}

/** Soma OS de todas as contas configuradas (modo "Todas"). nota/interno só quando todas as contas têm o split. */
async function obterTotaisOSConsolidado(mes: number, ano: number): Promise<TotaisOS> {
  let total = 0;
  let nota: number | null = 0;
  let interno: number | null = 0;
  for (const c of getContasOmie()) {
    const t = await obterTotaisOS(mes, ano, c.id);
    total += t.total;
    nota = nota != null && t.nota != null ? nota + t.nota : null;
    interno = interno != null && t.interno != null ? interno + t.interno : null;
  }
  return { total, nota, interno };
}

/**
 * Totais de OS de um mês (total + split com nota × interno). UI nunca espera Omie:
 *   - "Todas" → soma consolidada por conta
 *   - mês atual → cache + refresh BG (cold start busca síncrono)
 *   - mês passado → sempre cache; valor 0/ausente OU split ausente dispara refresh BG
 * Linhas antigas de os_mensal (sem valor_nota) servem o total com nota/interno = null
 * até o backfill em background preencher.
 */
export async function obterTotaisOS(mes: number, ano: number, conta: ContaFiltro): Promise<TotaisOS> {
  if (conta === undefined) return obterTotaisOSConsolidado(mes, ano);

  const doRow = (data: { valor_total: unknown; valor_nota: unknown; valor_interno: unknown }): TotaisOS => ({
    total: num(data.valor_total),
    nota: data.valor_nota == null ? null : num(data.valor_nota),
    interno: data.valor_interno == null ? null : num(data.valor_interno),
  });

  if (ehMesAtual(mes, ano)) {
    const hoje = fmtD(new Date());
    const ultimaData = await obterControleCache('os', mes, ano, conta);
    const { data } = await supabase
      .from('os_mensal')
      .select('valor_total,valor_nota,valor_interno')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('conta_omie', conta)
      .maybeSingle();
    if (data) {
      if (ultimaData !== hoje || data.valor_nota == null) agendarRefreshOSMesAtual(mes, ano, conta);
      return doRow(data);
    }
    // Cold start: sem cache, busca síncrono
    const de = fmtD(new Date(ano, mes - 1, 1));
    const t = await buscarOSPeriodo(de, hoje, conta);
    await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
    await salvarControleCache('os', mes, ano, hoje, conta);
    return t;
  }

  // Meses passados: sempre serve cache
  const { data } = await supabase
    .from('os_mensal')
    .select('valor_total,valor_nota,valor_interno')
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('conta_omie', conta)
    .maybeSingle();
  if (data) {
    const t = doRow(data);
    if (t.total === 0 || t.nota == null) agendarRefreshOSPassado(mes, ano, conta);
    return t;
  }
  agendarRefreshOSPassado(mes, ano, conta);
  return { total: 0, nota: null, interno: null };
}

/** Valor total de OS de um mês (compat: só o total). Portado de obterTotalOS (server.js:1281). */
export async function obterTotalOS(mes: number, ano: number, conta: ContaFiltro): Promise<number> {
  return (await obterTotaisOS(mes, ano, conta)).total;
}
