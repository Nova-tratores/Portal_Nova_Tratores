// Ordens de Serviço (OS): total faturado por mês (os_mensal) + sync da Omie.
// Portado de server.js: buscarTodasOS, buscarOSPeriodo, obterTotalOS,
// obterTotalOSConsolidado, agendarRefreshOS*. Threading explícito de conta;
// "Todas" (undefined) soma todas as contas configuradas.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { fmtD, parseDataBR, sleep, ehMesAtual } from './utils';
import { salvarControleCache, obterControleCache } from './vendas-sync';
import { buscarCategoriasOmie } from './notas-entrada';
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

// ====================== Listagem detalhada (drill-down do card Serviços) ======================

export interface OSListaRow {
  numero_os: string;
  data: string; // dd/mm/aaaa (data de faturamento)
  valor: number;
  codigo_cliente: number | null;
  cliente: string;
  conta: Conta;
  ncod_os: number;
  /** NFS-e emitida (cache os_nfse). null = ainda não verificado pelo refresh BG. */
  tem_nota: boolean | null;
}

/** tem_nota por nCodOS, SÓ do cache os_nfse (não chama Omie — quem verifica é o refresh BG). */
async function buscarTemNotaMap(ids: number[], conta: Conta): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('os_nfse')
      .select('ncod_os,tem_nota')
      .eq('conta_omie', conta)
      .in('ncod_os', ids.slice(i, i + 200));
    (data || []).forEach((r) => map.set(Number(r.ncod_os), !!r.tem_nota));
  }
  return map;
}

/** OS faturadas (etapa 60, não canceladas) de UMA conta no mês — mesmo critério do total do card. */
async function listarOSMesConta(mes: number, ano: number, conta: Conta): Promise<OSListaRow[]> {
  const todas = await buscarTodasOS(conta);
  const dtDe = new Date(ano, mes - 1, 1);
  const dtAte = new Date(ano, mes, 0, 23, 59, 59);
  const rows: OSListaRow[] = [];
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    if ((info.cCancelada || cab.cCancelada) === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) return;
    if (cab.cEtapa != '60') return;
    rows.push({
      numero_os: String(cab.cNumOS || ''),
      data: dataStr,
      valor: num(cab.nValorTotal),
      codigo_cliente: num(cab.nCodCli) || null,
      cliente: '',
      conta,
      ncod_os: num(cab.nCodOS),
      tem_nota: null,
    });
  });
  const notaMap = await buscarTemNotaMap(rows.map((r) => r.ncod_os).filter(Boolean), conta);
  rows.forEach((r) => { r.tem_nota = notaMap.has(r.ncod_os) ? notaMap.get(r.ncod_os)! : null; });
  return rows;
}

/** Preenche `cliente` via cadastro já sincronizado (portal_nt_clientes_cadastro_omie), sem Omie. */
async function resolverNomesClientes(rows: Array<{ codigo_cliente: number | null; cliente: string }>): Promise<void> {
  const codigos = [...new Set(rows.map((r) => r.codigo_cliente).filter(Boolean))] as number[];
  const nomeMap: Record<number, string> = {};
  for (let i = 0; i < codigos.length; i += 200) {
    const { data } = await supabase
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli,nome_fantasia,razao_social')
      .in('cod_cli', codigos.slice(i, i + 200));
    (data || []).forEach((cli) => {
      const nome = String(cli.nome_fantasia || cli.razao_social || '').trim();
      if (nome) nomeMap[num(cli.cod_cli)] = nome;
    });
  }
  rows.forEach((r) => { if (r.codigo_cliente && nomeMap[r.codigo_cliente]) r.cliente = nomeMap[r.codigo_cliente]; });
}

/**
 * OS faturadas do mês com nome do cliente, para o popup "vendas" do card Serviços.
 * conta undefined = "Todas" (soma as contas configuradas).
 */
export async function listarOSMes(mes: number, ano: number, conta: ContaFiltro): Promise<OSListaRow[]> {
  const contas = conta === undefined ? getContasOmie().map((c) => c.id) : [conta];
  const rows: OSListaRow[] = [];
  for (const c of contas) rows.push(...(await listarOSMesConta(mes, ano, c)));
  await resolverNomesClientes(rows);
  return rows.sort((a, b) => b.valor - a.valor);
}

// ====================== Serviços das OS (itens ServicosPrestados) ======================

export type TipoServico = 'HR' | 'KM' | 'OUTRO';

// Códigos do cadastro de serviços da Omie (NOVA). Contas sem esses códigos caem
// no fallback por descrição ("Hora Trabalhada" / "KM" / "Deslocamento").
const HR_NCODSERV = new Set([1979758762, 1979955370]); // Hora Trabalhada
const KM_NCODSERV = new Set([1975974257]); // KM Deslocamento

function classificarTipoServico(nCodServico: number, descricao: string): TipoServico {
  if (HR_NCODSERV.has(nCodServico)) return 'HR';
  if (KM_NCODSERV.has(nCodServico)) return 'KM';
  const d = descricao.trim().toLowerCase();
  if (d.includes('hora trabalhada')) return 'HR';
  if (/^km\b/.test(d) || d.includes('deslocamento')) return 'KM';
  return 'OUTRO';
}

export interface ServicoOSRow {
  numero_os: string;
  data: string; // dd/mm/aaaa (data de faturamento)
  codigo_cliente: number | null;
  cliente: string;
  descricao: string;
  tipo: TipoServico;
  categoria: string; // código Omie (cCodCategItem / cCodCateg da OS)
  categoria_desc: string;
  qtde: number;
  valor_unit: number;
  valor_total: number;
  conta: Conta;
  ncod_os: number;
  /** NFS-e emitida na OS deste item (cache os_nfse). null = ainda não verificado. */
  tem_nota: boolean | null;
}

/** Itens de serviço das OS faturadas (etapa 60, não canceladas) de UMA conta no mês. */
async function listarServicosOSMesConta(mes: number, ano: number, conta: Conta): Promise<ServicoOSRow[]> {
  const todas = await buscarTodasOS(conta);
  const categorias = await buscarCategoriasOmie(conta);
  const dtDe = new Date(ano, mes - 1, 1);
  const dtAte = new Date(ano, mes, 0, 23, 59, 59);
  const rows: ServicoOSRow[] = [];
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    if ((info.cCancelada || cab.cCancelada) === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) return;
    if (cab.cEtapa != '60') return;

    const adic = ((os as Record<string, unknown>).InformacoesAdicionais || {}) as Record<string, unknown>;
    const catOS = String(adic.cCodCateg || '');
    const base = {
      numero_os: String(cab.cNumOS || ''),
      data: dataStr,
      codigo_cliente: num(cab.nCodCli) || null,
      cliente: '',
      conta,
      ncod_os: num(cab.nCodOS),
      tem_nota: null as boolean | null,
    };

    const itens = (Array.isArray((os as Record<string, unknown>).ServicosPrestados)
      ? (os as Record<string, unknown>).ServicosPrestados
      : []) as Array<Record<string, unknown>>;
    if (itens.length === 0) {
      // OS sem itens detalhados: uma linha com o valor do cabeçalho, pra fechar com o total do card.
      rows.push({
        ...base,
        descricao: 'Serviços prestados (sem detalhe)',
        tipo: 'OUTRO',
        categoria: catOS,
        categoria_desc: categorias[catOS] || '',
        qtde: 1,
        valor_unit: num(cab.nValorTotal),
        valor_total: num(cab.nValorTotal),
      });
      return;
    }
    itens.forEach((it) => {
      const descricao = String(it.cDescServ || '').trim();
      const cat = String(it.cCodCategItem || catOS || '');
      const qtde = num(it.nQtde) || 1;
      const valorUnit = num(it.nValUnit);
      rows.push({
        ...base,
        descricao,
        tipo: classificarTipoServico(num(it.nCodServico), descricao),
        categoria: cat,
        categoria_desc: categorias[cat] || '',
        qtde,
        valor_unit: valorUnit,
        valor_total: qtde * valorUnit - num(it.nValorDesconto) + num(it.nValorAcrescimos),
      });
    });
  });
  const notaMap = await buscarTemNotaMap([...new Set(rows.map((r) => r.ncod_os).filter(Boolean))], conta);
  rows.forEach((r) => { r.tem_nota = notaMap.has(r.ncod_os) ? notaMap.get(r.ncod_os)! : null; });
  return rows;
}

/**
 * Serviços que compõem o valor do card Serviços no mês (drill-down "vendas"),
 * com tipo HR/KM/OUTRO e categoria. conta undefined = "Todas".
 */
export async function listarServicosOSMes(mes: number, ano: number, conta: ContaFiltro): Promise<ServicoOSRow[]> {
  const contas = conta === undefined ? getContasOmie().map((c) => c.id) : [conta];
  const rows: ServicoOSRow[] = [];
  for (const c of contas) rows.push(...(await listarServicosOSMesConta(mes, ano, c)));
  await resolverNomesClientes(rows);
  return rows.sort((a, b) => b.valor_total - a.valor_total);
}
