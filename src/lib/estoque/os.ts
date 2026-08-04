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
  /**
   * Sub-split do `interno` (OS sem NFS-e), espelhando a régua do dashboard OMIE:
   *   - internoRetorno = garantia de fábrica (-pgo, cheio) + revisão (cheio) + normal (cheio)
   *     + entrega/montagem pelo VALOR FIXO (comissão por código, não o cheio) → contribuição
   *     de RECEITA do bucket "com retorno", igual ao "Total Entradas" do OMIE.
   *   - internoPuro    = cortesia comercial + contrato interno/oficina (cheio) → interno "de verdade".
   * ⚠️ Como a entrega entra pelo fixo, internoRetorno + internoPuro ≠ interno (a diferença =
   * entrega cheia − comissão fica de fora da receita, como no OMIE). null quando a linha do
   * os_mensal ainda não tem o sub-split (converge via refresh BG).
   */
  internoRetorno: number | null;
  internoPuro: number | null;
}

/**
 * Classifica uma OS SEM NFS-e em 'retorno' (rendeu: garantia/entrega/revisão/normal) ou
 * 'puro' (cortesia/interno). Régua portada do dashboard OMIE (server.js ~6125-6250),
 * baseada no texto do contrato (`InformacoesAdicionais.cNumContrato`). Validado contra o
 * mês fechado: reproduz a classificação do OMIE com 0 divergências usando só o contrato
 * (o OMIE ainda checa nome do cliente/observação como rede de segurança, desnecessária aqui).
 */
export function baldeInterno(contrato: string): 'retorno' | 'puro' {
  const C = String(contrato || '').toUpperCase();
  const isEntrega = /ENTREGA|MONTAGEM|PRÉ ENTREGA|PRE ENTREGA/.test(C);
  const isGarLoja = C.includes('GARANTIA-NT');                                   // garantia da própria loja (loja absorve) → puro
  const isCortComercial = C.includes('CORTESIA COMERCIAL') || C.includes('DEMONSTRA');
  const isInterno = /INTERNO|CORTESIA|OFICINA/.test(C) && !isGarLoja && !isEntrega && !isCortComercial;
  const isGarFabrica = C.includes('GARANTIA') || C.includes('PGO');             // ressarcida pela fábrica → retorno
  // Precedência idêntica ao OMIE: garantia-loja → entrega → cortesia/interno → garantia-fábrica → (revisão/normal)
  if (isGarLoja) return 'puro';
  if (isEntrega) return 'retorno';
  if (isCortComercial) return 'puro';
  if (isInterno) return 'puro';
  if (isGarFabrica) return 'retorno';
  return 'retorno'; // revisão / serviço normal fechado sem nota
}

/**
 * Valor FIXO (comissão por código) de uma OS de entrega técnica/montagem, igual ao
 * dashboard OMIE (server.js ~6259-6262). No "Total Entradas" do OMIE a entrega técnica
 * entra pela comissão fixa, não pelo valor cheio da OS — é o que faz a receita de
 * serviços do Portal bater com a do OMIE. Retorna null quando a OS NÃO é entrega/montagem
 * (aí vale o valor cheio). Validado contra valor_comissao_final do OMIE: 0 divergências.
 */
export function valorFixoEntrega(contrato: string): number | null {
  const C = String(contrato || '').toUpperCase();
  if (!/ENTREGA|MONTAGEM/.test(C)) return null; // demonstração é 'puro', não passa por aqui
  if (C.includes('CARRETA')) return 250;
  if (C.includes('MONTAGEM') && C.includes('DESLIGAMENT')) return 400;
  if (C.includes('MONTAGEM') && !C.includes('QUAD')) return 500;
  return 150;
}

// Códigos de cliente da PRÓPRIA loja (Nova Tratores / Castro Máquinas). Serviço nessas
// máquinas = cortesia comercial (montar/entregar o próprio estoque não é receita), igual
// à régua do dashboard OMIE (cliente inclui "NOVA TRATORES"/"CASTRO MAQUINAS"). É o caso
// da montagem interna, que o contrato sozinho classificaria como "com retorno". Cacheado
// em memória (30 min); a lista muda raríssimo.
const LOJA_PROPRIA_SEED = [1943158003, 5234748319]; // NOVA TRATORES (próprias) — fallback
let lojaPropriaCache: { set: Set<number>; ts: number } | null = null;
async function lerCodigosLojaPropria(): Promise<Set<number>> {
  if (lojaPropriaCache && Date.now() - lojaPropriaCache.ts < 30 * 60_000) return lojaPropriaCache.set;
  const set = new Set<number>(LOJA_PROPRIA_SEED);
  try {
    const { data } = await supabase
      .from('portal_nt_clientes_cadastro_omie')
      .select('cod_cli')
      .or('razao_social.ilike.%NOVA TRATORES%,nome_fantasia.ilike.%NOVA TRATORES%,razao_social.ilike.%CASTRO MAQUINAS%,nome_fantasia.ilike.%CASTRO MAQUINAS%');
    (data || []).forEach((r) => set.add(Number(r.cod_cli)));
  } catch { /* mantém o seed se a query falhar */ }
  lojaPropriaCache = { set, ts: Date.now() };
  return set;
}

// Overrides de OS do OMIE (tabela compartilhada comissoes_os_relatorio):
//   - dataRef ("mês alterado"): a receita conta no mês do data_ref, não no de
//     faturamento — espelha o "Total Entradas" do OMIE.
//   - porTecSum: soma dos ajustes manuais POR TÉCNICO. Na ENTREGA técnica, o OMIE
//     usa esse valor na receita (não o fixo), então o Portal usa a soma pra bater.
// Cacheado 5 min (edições são raras; a tabela é do OMIE, no mesmo Supabase).
interface OverrideOS { dataRef?: string; porTecSum?: number }
let overridesOSCache: { map: Map<string, OverrideOS>; ts: number } | null = null;
async function lerOverridesOS(): Promise<Map<string, OverrideOS>> {
  if (overridesOSCache && Date.now() - overridesOSCache.ts < 5 * 60_000) return overridesOSCache.map;
  const map = new Map<string, OverrideOS>();
  try {
    const { data } = await supabase
      .from('comissoes_os_relatorio')
      .select('numero_os,data_ref,por_tecnico');
    (data || []).forEach((r) => {
      const ov: OverrideOS = {};
      const d = String(r.data_ref || '');
      if (/^\d{4}-\d{2}/.test(d)) ov.dataRef = d;
      const pt = r.por_tecnico;
      if (pt && typeof pt === 'object' && Object.keys(pt).length) {
        ov.porTecSum = Object.values(pt as Record<string, unknown>).reduce((s: number, v) => s + (Number(v) || 0), 0);
      }
      if (ov.dataRef !== undefined || ov.porTecSum !== undefined) map.set(String(r.numero_os), ov);
    });
  } catch { /* tabela do OMIE indisponível — sem override, usa data de faturamento + fixo */ }
  overridesOSCache = { map, ts: Date.now() };
  return map;
}

// Cache em-memória de TODAS as OS por conta (10 min) + dedup de refresh BG.
const todasOSCachePorConta: Record<string, Array<Record<string, unknown>>> = {};
const refreshOSInFlight: Record<string, Promise<void>> = {};

/**
 * Todas as OS da conta + se a paginação chegou ao fim (`completo`).
 * `completo=false` = a Omie falhou/limitou no meio (a lista está TRUNCADA):
 * quem grava em os_mensal/os_servicos_itens TEM de ignorar o resultado, senão
 * um soluço da API zera meses inteiros já sincronizados. Só lista completa
 * entra no cache de 10 min.
 */
export async function buscarTodasOSDetalhado(conta: Conta): Promise<{ lista: Array<Record<string, unknown>>; completo: boolean }> {
  if (todasOSCachePorConta[conta]) return { lista: todasOSCachePorConta[conta], completo: true };
  const todas: Array<Record<string, unknown>> = [];
  let pag = 1;
  let totalPaginas = 1;
  let completo = true;
  while (pag <= totalPaginas) {
    // Até 3 tentativas por página: a Omie às vezes devolve faultstring/erro
    // transitório (rate-limit) numa página no meio da lista (a NOVA tem MUITAS OS).
    // Sem retry, um soluço marcava a lista INTEIRA como truncada e travava o re-sync
    // do mês fechado. Só desiste (completo=false, protege) após as 3 tentativas.
    let r: { faultstring?: string; total_de_paginas?: number; osCadastro?: Array<Record<string, unknown>> } | null = null;
    for (let tent = 0; tent < 3; tent++) {
      try {
        const resp = await omieRequest<{
          faultstring?: string;
          total_de_paginas?: number;
          osCadastro?: Array<Record<string, unknown>>;
        }>('/servicos/os/', 'ListarOS', { pagina: pag, registros_por_pagina: 500 }, { conta });
        if (resp.faultstring) { await sleep(800 * (tent + 1)); continue; }
        r = resp;
        break;
      } catch {
        await sleep(800 * (tent + 1));
      }
    }
    if (!r) { completo = false; break; } // 3 tentativas falharam
    if (pag === 1) totalPaginas = r.total_de_paginas || 1;
    if (!r.osCadastro || r.osCadastro.length === 0) {
      if (pag > 1) completo = false; // parou antes da última página prometida
      break;
    }
    todas.push(...r.osCadastro);
    pag++;
    await sleep(500);
  }
  if (completo) {
    todasOSCachePorConta[conta] = todas;
    setTimeout(() => { delete todasOSCachePorConta[conta]; }, 600_000);
  } else {
    console.log('buscarTodasOS [' + conta + ']: lista TRUNCADA na pag ' + pag + '/' + totalPaginas + ' — não vai gravar em os_mensal');
  }
  return { lista: todas, completo };
}

export async function buscarTodasOS(conta: Conta): Promise<Array<Record<string, unknown>>> {
  return (await buscarTodasOSDetalhado(conta)).lista;
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
  contrato: string; // InformacoesAdicionais.cNumContrato — usado pra separar interno c/ retorno × puro
  codigoCliente: number; // nCodCli — pra detectar loja própria (cortesia comercial)
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

/**
 * Soma o valor faturado (etapa 60) das OS não canceladas no período [de, ate],
 * separando com nota × interno. `completo=false` → a listagem da Omie veio
 * truncada e os totais estão SUBESTIMADOS (não gravar em os_mensal).
 */
export async function buscarOSPeriodo(de: string, ate: string, conta: Conta): Promise<{ total: number; nota: number; interno: number; internoRetorno: number; internoPuro: number; completo: boolean }> {
  const { lista: todas, completo } = await buscarTodasOSDetalhado(conta);
  const overrides = await lerOverridesOS();
  const dtDe = parseDataBR(de);
  const dtAte = parseDataBR(ate);
  let total = 0;
  const faturadas: OSFaturada[] = [];
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    const adic = (os.InformacoesAdicionais || {}) as Record<string, unknown>;
    const cancelada = info.cCancelada || cab.cCancelada;
    if (cancelada === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    let dtOS = parseDataBR(dataStr);
    // "Mês alterado" no OMIE: a OS conta na competência do data_ref (YYYY-MM-DD),
    // não na data de faturamento. Assim uma OS movida pra outro mês sai daqui (e
    // entra no mês certo), igual ao dashboard do OMIE.
    const dref = overrides.get(String(cab.cNumOS || ''))?.dataRef;
    if (dref) {
      const p = dref.split('-');
      if (p.length >= 2) dtOS = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) || 1);
    }
    if (dtOS < dtDe || dtOS > dtAte) return;
    if (cab.cEtapa == '60') {
      const valor = num(cab.nValorTotal);
      total += valor;
      faturadas.push({ nCodOS: num(cab.nCodOS), cNumOS: String(cab.cNumOS || ''), valor, mes: dtOS.getMonth() + 1, ano: dtOS.getFullYear(), contrato: String(adic.cNumContrato || ''), codigoCliente: num(cab.nCodCli) });
    }
  });
  const comNota = await classificarNfseOS(faturadas, conta);
  const lojaPropria = await lerCodigosLojaPropria();
  let nota = 0;
  let internoRetorno = 0;
  let internoPuro = 0;
  faturadas.forEach((f) => {
    if (comNota.has(f.nCodOS)) { nota += f.valor; return; }
    // Serviço na máquina da PRÓPRIA loja (cortesia comercial) não é receita — nem em
    // montagem/entrega (que o contrato sozinho jogaria em "com retorno"). Igual ao OMIE.
    if (lojaPropria.has(f.codigoCliente)) { internoPuro += f.valor; return; }
    if (baldeInterno(f.contrato) === 'puro') { internoPuro += f.valor; return; }
    // 'retorno': entrega técnica/montagem entra pela comissão (não pelo valor cheio da OS);
    // garantia/revisão/normal seguem pelo cheio.
    const fixo = valorFixoEntrega(f.contrato);
    if (fixo != null) {
      // Entrega: se o OMIE tem ajuste manual POR TÉCNICO nessa OS, usa a soma (o OMIE
      // conta o override na receita); senão o valor fixo por código.
      const porTecSum = overrides.get(f.cNumOS)?.porTecSum;
      internoRetorno += porTecSum != null ? porTecSum : fixo;
    } else {
      internoRetorno += f.valor;
    }
  });
  return { total, nota, interno: total - nota, internoRetorno, internoPuro, completo };
}

function agendarRefreshOSMesAtual(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':' + mes + '-' + ano;
  if (refreshOSInFlight[key] !== undefined) return;
  refreshOSInFlight[key] = (async () => {
    try {
      const hoje = fmtD(new Date());
      const de = fmtD(new Date(ano, mes - 1, 1));
      const t = await buscarOSPeriodo(de, hoje, conta);
      if (!t.completo) throw new Error('ListarOS truncado — os_mensal preservado');
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, valor_interno_retorno: t.internoRetorno, valor_interno_puro: t.internoPuro, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
      await sincronizarServicosItens(mes, ano, conta);
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
      if (!t.completo) throw new Error('ListarOS truncado — os_mensal preservado');
      await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, valor_interno_retorno: t.internoRetorno, valor_interno_puro: t.internoPuro, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
      await sincronizarServicosItens(mes, ano, conta);
      // Marca a data do re-sync — mês recém-fechado re-sincroniza só 1x/dia (ver obterTotaisOS).
      await salvarControleCache('os', mes, ano, fmtD(new Date()), conta);
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
  let internoRetorno: number | null = 0;
  let internoPuro: number | null = 0;
  for (const c of getContasOmie()) {
    const t = await obterTotaisOS(mes, ano, c.id);
    total += t.total;
    nota = nota != null && t.nota != null ? nota + t.nota : null;
    interno = interno != null && t.interno != null ? interno + t.interno : null;
    internoRetorno = internoRetorno != null && t.internoRetorno != null ? internoRetorno + t.internoRetorno : null;
    internoPuro = internoPuro != null && t.internoPuro != null ? internoPuro + t.internoPuro : null;
  }
  return { total, nota, interno, internoRetorno, internoPuro };
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

  const doRow = (data: { valor_total: unknown; valor_nota: unknown; valor_interno: unknown; valor_interno_retorno?: unknown; valor_interno_puro?: unknown }): TotaisOS => ({
    total: num(data.valor_total),
    nota: data.valor_nota == null ? null : num(data.valor_nota),
    interno: data.valor_interno == null ? null : num(data.valor_interno),
    internoRetorno: data.valor_interno_retorno == null ? null : num(data.valor_interno_retorno),
    internoPuro: data.valor_interno_puro == null ? null : num(data.valor_interno_puro),
  });
  // split(t): campos do sub-split a partir do resultado de buscarOSPeriodo.
  const split = (t: { internoRetorno: number; internoPuro: number }) => ({ internoRetorno: t.internoRetorno, internoPuro: t.internoPuro });

  if (ehMesAtual(mes, ano)) {
    const hoje = fmtD(new Date());
    const ultimaData = await obterControleCache('os', mes, ano, conta);
    const { data } = await supabase
      .from('os_mensal')
      .select('valor_total,valor_nota,valor_interno,valor_interno_retorno,valor_interno_puro')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('conta_omie', conta)
      .maybeSingle();
    if (data) {
      // Reprocessa também quando o sub-split (retorno/puro) ainda não foi gravado.
      if (ultimaData !== hoje || data.valor_nota == null || data.valor_interno_retorno == null) agendarRefreshOSMesAtual(mes, ano, conta);
      return doRow(data);
    }
    // Cold start: sem cache, busca síncrono (itens vão em BG pra não segurar a request)
    const de = fmtD(new Date(ano, mes - 1, 1));
    const t = await buscarOSPeriodo(de, hoje, conta);
    // Listagem truncada: serve o parcial nesta request, mas não persiste nada.
    if (!t.completo) return { total: t.total, nota: t.nota, interno: t.interno, ...split(t) };
    await supabase.from('os_mensal').upsert({ mes, ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, valor_interno_retorno: t.internoRetorno, valor_interno_puro: t.internoPuro, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
    void sincronizarServicosItens(mes, ano, conta).catch(() => {});
    await salvarControleCache('os', mes, ano, hoje, conta);
    return { total: t.total, nota: t.nota, interno: t.interno, ...split(t) };
  }

  // Meses passados: sempre serve cache
  const { data } = await supabase
    .from('os_mensal')
    .select('valor_total,valor_nota,valor_interno,valor_interno_retorno,valor_interno_puro')
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('conta_omie', conta)
    .maybeSingle();
  if (data) {
    const t = doRow(data);
    // Mês RECÉM-fechado (≤ 20 dias após o fim) ainda recebe OS faturadas com atraso —
    // re-sincroniza 1x/dia (como o mês corrente) até "assentar". Meses antigos ficam no
    // cache (só re-sincronizam se algum campo do split estiver faltando).
    const fimMes = new Date(ano, mes, 0);
    const diasDesdeFim = Math.floor((Date.now() - fimMes.getTime()) / 86_400_000);
    const recemFechado = diasDesdeFim >= 0 && diasDesdeFim <= 20;
    const precisaResync =
      t.total === 0 || t.nota == null || t.internoRetorno == null ||
      (recemFechado && (await obterControleCache('os', mes, ano, conta)) !== fmtD(new Date()));
    if (precisaResync) agendarRefreshOSPassado(mes, ano, conta);
    return t;
  }
  agendarRefreshOSPassado(mes, ano, conta);
  return { total: 0, nota: null, interno: null, internoRetorno: null, internoPuro: null };
}

/** Soma os meses já cacheados em os_mensal de um ano, para UMA conta. */
async function totaisOSAnoConta(ano: number, conta: Conta): Promise<TotaisOS> {
  const { data } = await supabase
    .from('os_mensal')
    .select('mes,valor_total,valor_nota,valor_interno,valor_interno_retorno,valor_interno_puro')
    .eq('ano', ano)
    .eq('conta_omie', conta);
  const porMes = new Map<number, TotaisOS>();
  (data || []).forEach((r) => porMes.set(num(r.mes), {
    total: num(r.valor_total),
    nota: r.valor_nota == null ? null : num(r.valor_nota),
    interno: r.valor_interno == null ? null : num(r.valor_interno),
    internoRetorno: r.valor_interno_retorno == null ? null : num(r.valor_interno_retorno),
    internoPuro: r.valor_interno_puro == null ? null : num(r.valor_interno_puro),
  }));
  // Só o mês corrente passa pelo caminho normal (cache + refresh BG). Meses
  // passados sem linha NÃO disparam sync: 12 refreshes concorrentes fariam 12
  // ListarOS completos (o cache de buscarTodasOS só ajuda depois do 1º).
  const now = new Date();
  if (ano === now.getFullYear()) {
    const mesAtual = now.getMonth() + 1;
    porMes.set(mesAtual, await obterTotaisOS(mesAtual, ano, conta));
  }
  let total = 0;
  let nota: number | null = 0;
  let interno: number | null = 0;
  let internoRetorno: number | null = 0;
  let internoPuro: number | null = 0;
  porMes.forEach((t) => {
    total += t.total;
    // Mês sem OS não tem split pra perder — se contasse, um mês zerado (ou um
    // mês futuro já com linha) anularia o "com nota" do ano inteiro.
    if (t.total === 0) return;
    nota = nota != null && t.nota != null ? nota + t.nota : null;
    interno = interno != null && t.interno != null ? interno + t.interno : null;
    internoRetorno = internoRetorno != null && t.internoRetorno != null ? internoRetorno + t.internoRetorno : null;
    internoPuro = internoPuro != null && t.internoPuro != null ? internoPuro + t.internoPuro : null;
  });
  return { total, nota, interno, internoRetorno, internoPuro };
}

/**
 * Totais de OS de um ANO inteiro (visão "Ano inteiro" do dashboard).
 * O split nota/interno só vem quando TODOS os meses cacheados têm o split —
 * meses antigos gravados antes do valor_nota zeram o split do ano (null),
 * e o card cai no total, como já acontece na visão mensal.
 */
export async function obterTotaisOSAno(ano: number, conta: ContaFiltro): Promise<TotaisOS> {
  const contas = conta === undefined ? getContasOmie().map((c) => c.id) : [conta];
  let total = 0;
  let nota: number | null = 0;
  let interno: number | null = 0;
  let internoRetorno: number | null = 0;
  let internoPuro: number | null = 0;
  for (const c of contas) {
    const t = await totaisOSAnoConta(ano, c);
    total += t.total;
    if (t.total === 0) continue; // conta sem OS no ano (ex.: CASTRO em 2026) não anula o split
    nota = nota != null && t.nota != null ? nota + t.nota : null;
    interno = interno != null && t.interno != null ? interno + t.interno : null;
    internoRetorno = internoRetorno != null && t.internoRetorno != null ? internoRetorno + t.internoRetorno : null;
    internoPuro = internoPuro != null && t.internoPuro != null ? internoPuro + t.internoPuro : null;
  }
  return { total, nota, interno, internoRetorno, internoPuro };
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
  /** Só quando sem nota: 'retorno' (garantia/entrega/revisão/normal) × 'puro' (cortesia/interno). */
  internoBalde?: 'retorno' | 'puro' | null;
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
  contrato: string; // InformacoesAdicionais.cNumContrato — classifica o balde interno
  /** NFS-e emitida na OS deste item (cache os_nfse). null = ainda não verificado. */
  tem_nota: boolean | null;
  /** Só quando sem nota: 'retorno' × 'puro' (derivado do contrato no popup). */
  internoBalde?: 'retorno' | 'puro' | null;
}

/**
 * Monta os itens de serviço das OS faturadas (etapa 60, não canceladas) do mês
 * a partir do ListarOS cru — usado SÓ pelo sync em background (a UI lê do Supabase).
 */
function montarServicosItensOmie(
  todas: Array<Record<string, unknown>>,
  categorias: Record<string, string>,
  mes: number,
  ano: number,
  conta: Conta,
  overridesData: Map<string, OverrideOS>,
): ServicoOSRow[] {
  const dtDe = new Date(ano, mes - 1, 1);
  const dtAte = new Date(ano, mes, 0, 23, 59, 59);
  const rows: ServicoOSRow[] = [];
  todas.forEach((os) => {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    if ((info.cCancelada || cab.cCancelada) === 'S') return;
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    let dtOS = parseDataBR(dataStr);
    // Respeita "mês alterado" do OMIE (data_ref) — mesma competência do os_mensal.
    const dref = overridesData.get(String(cab.cNumOS || ''))?.dataRef;
    if (dref) {
      const p = dref.split('-');
      if (p.length >= 2) dtOS = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) || 1);
    }
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
      contrato: String(adic.cNumContrato || ''),
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
  return rows;
}

/**
 * Regrava os itens de serviço do mês em os_servicos_itens (apaga e insere).
 * Roda junto dos refreshes de os_mensal — reusa o cache de buscarTodasOS, então
 * não custa chamadas extra à Omie além do ListarCategorias (cacheado 30 min).
 */
export async function sincronizarServicosItens(mes: number, ano: number, conta: Conta): Promise<void> {
  const { lista: todas, completo } = await buscarTodasOSDetalhado(conta);
  if (!completo) {
    console.log('os_servicos_itens [' + conta + '] ' + mes + '/' + ano + ': ListarOS truncado — itens preservados');
    return;
  }
  const categorias = await buscarCategoriasOmie(conta);
  const overridesData = await lerOverridesOS();
  const rows = montarServicosItensOmie(todas, categorias, mes, ano, conta, overridesData);
  const { error: delErr } = await supabase
    .from('os_servicos_itens')
    .delete()
    .eq('conta_omie', conta)
    .eq('mes', mes)
    .eq('ano', ano);
  if (delErr) {
    console.log('os_servicos_itens delete [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + delErr.message);
    return;
  }
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500).map((r) => ({
      conta_omie: r.conta,
      mes,
      ano,
      ncod_os: r.ncod_os,
      numero_os: r.numero_os,
      data: r.data,
      codigo_cliente: r.codigo_cliente,
      descricao: r.descricao,
      tipo: r.tipo,
      categoria: r.categoria,
      categoria_desc: r.categoria_desc,
      qtde: r.qtde,
      valor_unit: r.valor_unit,
      valor_total: r.valor_total,
      contrato: r.contrato,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await supabase.from('os_servicos_itens').insert(lote);
    if (error) {
      console.log('os_servicos_itens insert [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + error.message);
      return;
    }
  }
}

/**
 * Itens direto do Supabase (paginado — PostgREST corta em 1000 linhas).
 * `mes = null` lê o ano inteiro (visão "Ano inteiro" do dashboard).
 */
async function lerServicosItens(mes: number | null, ano: number, conta: Conta): Promise<ServicoOSRow[]> {
  const rows: ServicoOSRow[] = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from('os_servicos_itens')
      .select('ncod_os,numero_os,data,codigo_cliente,descricao,tipo,categoria,categoria_desc,qtde,valor_unit,valor_total,contrato')
      .eq('conta_omie', conta)
      .eq('ano', ano);
    if (mes != null) q = q.eq('mes', mes);
    const { data, error } = await q
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error('os_servicos_itens: ' + error.message + ' — a migration sql/os-servicos-itens.sql foi aplicada?');
    if (!data || data.length === 0) break;
    data.forEach((r) => rows.push({
      numero_os: String(r.numero_os || ''),
      data: String(r.data || ''),
      codigo_cliente: r.codigo_cliente == null ? null : num(r.codigo_cliente),
      cliente: '',
      descricao: String(r.descricao || ''),
      tipo: (r.tipo === 'HR' || r.tipo === 'KM' ? r.tipo : 'OUTRO') as TipoServico,
      categoria: String(r.categoria || ''),
      categoria_desc: String(r.categoria_desc || ''),
      qtde: num(r.qtde),
      valor_unit: num(r.valor_unit),
      valor_total: num(r.valor_total),
      conta,
      ncod_os: num(r.ncod_os),
      contrato: String(r.contrato || ''),
      tem_nota: null,
    }));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

export interface TiposComNota {
  hr: number;
  km: number;
  outros: number;
}

/**
 * Composição por tipo (HR/KM/Outros) do valor COM NOTA do período, para o card
 * Serviços do dashboard (`mes = null` → ano inteiro). Mesma regra do valor_nota
 * do os_mensal: só OS com tem_nota=true no os_nfse entram (não verificadas
 * contam como interno). Retorna null quando o período ainda não tem itens no
 * cache (card esconde a linha).
 */
export async function obterTiposComNotaMes(mes: number | null, ano: number, conta: ContaFiltro): Promise<TiposComNota | null> {
  const contas = conta === undefined ? getContasOmie().map((c) => c.id) : [conta];
  const soma: TiposComNota = { hr: 0, km: 0, outros: 0 };
  let temItens = false;
  for (const c of contas) {
    const itens = await lerServicosItens(mes, ano, c);
    if (itens.length === 0) continue;
    temItens = true;
    const notaMap = await buscarTemNotaMap([...new Set(itens.map((r) => r.ncod_os).filter(Boolean))], c);
    for (const it of itens) {
      if (!notaMap.get(it.ncod_os)) continue; // sem nota (ou não verificada) = interno
      if (it.tipo === 'HR') soma.hr += it.valor_total;
      else if (it.tipo === 'KM') soma.km += it.valor_total;
      else soma.outros += it.valor_total;
    }
  }
  return temItens ? soma : null;
}

export interface ServicosPopupResult {
  os: OSListaRow[];
  servicos: ServicoOSRow[];
  /** true = alguma conta ainda não tem os itens do mês no cache; refresh BG foi agendado. */
  pendente: boolean;
}

/**
 * Dados do popup "vendas" do card Serviços — TUDO do Supabase (os_servicos_itens
 * + os_nfse + cadastro de clientes), nada de Omie na hora do clique. Mês sem
 * itens no cache mas com valor em os_mensal (ou sem linha) dispara o refresh BG
 * e volta pendente=true. A lista por OS é agregada dos itens (soma bate com o
 * cabeçalho — inclusive a linha-fallback de OS sem itens detalhados).
 */
export async function obterServicosPopup(mes: number | null, ano: number, conta: ContaFiltro): Promise<ServicosPopupResult> {
  const contas = conta === undefined ? getContasOmie().map((c) => c.id) : [conta];
  const servicos: ServicoOSRow[] = [];
  let pendente = false;
  const lojaPropria = await lerCodigosLojaPropria();
  // Balde de uma OS sem nota: loja própria (cortesia comercial) → 'puro'; senão pelo contrato.
  const baldeDe = (temNota: boolean | null, codCli: number | null, contrato: string): 'retorno' | 'puro' | null =>
    temNota === true ? null : (codCli != null && lojaPropria.has(codCli) ? 'puro' : baldeInterno(contrato));
  for (const c of contas) {
    const itens = await lerServicosItens(mes, ano, c);
    if (mes == null) {
      // Ano inteiro: pendente se algum mês com valor em os_mensal ainda não tem
      // itens. Agenda no máximo UM mês por conta (12 refreshes concorrentes
      // fariam 12 ListarOS completos) — converge a cada reabertura do popup.
      const comItens = new Set(itens.map((r) => parseDataBR(r.data).getMonth() + 1));
      const { data } = await supabase
        .from('os_mensal')
        .select('mes,valor_total')
        .eq('ano', ano)
        .eq('conta_omie', c);
      const faltando = (data || [])
        .filter((r) => num(r.valor_total) > 0 && !comItens.has(num(r.mes)))
        .map((r) => num(r.mes))
        .sort((a, b) => a - b);
      if (faltando.length > 0) {
        pendente = true;
        const m = faltando[0];
        if (ehMesAtual(m, ano)) agendarRefreshOSMesAtual(m, ano, c);
        else agendarRefreshOSPassado(m, ano, c);
      }
      if (itens.length === 0) continue;
    } else if (itens.length === 0) {
      // Mês pode não ter OS mesmo (ex.: CASTRO em 2026) — só é "pendente" se o
      // os_mensal diz que há valor (ou nem tem linha ainda).
      const { data } = await supabase
        .from('os_mensal')
        .select('valor_total')
        .eq('mes', mes)
        .eq('ano', ano)
        .eq('conta_omie', c)
        .maybeSingle();
      if (!data || num(data.valor_total) > 0) {
        pendente = true;
        if (ehMesAtual(mes, ano)) agendarRefreshOSMesAtual(mes, ano, c);
        else agendarRefreshOSPassado(mes, ano, c);
      }
      continue;
    }
    const notaMap = await buscarTemNotaMap([...new Set(itens.map((r) => r.ncod_os).filter(Boolean))], c);
    itens.forEach((r) => {
      r.tem_nota = notaMap.has(r.ncod_os) ? notaMap.get(r.ncod_os)! : null;
      r.internoBalde = baldeDe(r.tem_nota, r.codigo_cliente, r.contrato);
    });
    servicos.push(...itens);
  }
  await resolverNomesClientes(servicos);
  servicos.sort((a, b) => b.valor_total - a.valor_total);

  const porOS = new Map<string, OSListaRow>();
  for (const s of servicos) {
    const k = s.conta + ':' + s.ncod_os;
    let os = porOS.get(k);
    if (!os) {
      os = { numero_os: s.numero_os, data: s.data, valor: 0, codigo_cliente: s.codigo_cliente, cliente: s.cliente, conta: s.conta, ncod_os: s.ncod_os, tem_nota: s.tem_nota, internoBalde: s.internoBalde ?? baldeDe(s.tem_nota, s.codigo_cliente, s.contrato) };
      porOS.set(k, os);
    }
    os.valor += s.valor_total;
  }
  const os = [...porOS.values()].sort((a, b) => b.valor - a.valor);
  return { os, servicos, pendente };
}
