// Operações administrativas do módulo Estoque. Portado de server.js:
//   - estado de sync per-conta (syncStatePorConta/getSyncState/resetSyncState)
//   - agruparEmRunsContiguos, buscarESalvarItensOmieRange, detectarMesesSuspeitos
//   - popular-os / popular-cache / popular-compras (jobs em background)
//   - repopular-produto-tipo, categorias admin, meses-zerados,
//     familias-distintas, itens-orfaos, debug-listar-pedidos/os, forcar-resync
//
// Threading EXPLÍCITO de conta: jobs que iteram "todas as contas" recebem a
// lista de getContasOmie() e rodam por conta concreta. Estados em memória são
// singletons module-level keyed por conta (mesmo padrão dos caches de vendas-sync).

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { fmtD, parseDataBR, sleep, ehMesAtual } from './utils';
import {
  buscarPedidosPeriodo,
  getProdutoCached,
  preCarregarCMCPorMes,
  resolverCMC,
  buscarESalvarItensOmie,
  salvarControleCache,
  temItensCacheados,
  type Pedido,
} from './vendas-sync';
import { obterTotalOS, buscarTodasOS, buscarTodasOSDetalhado, buscarOSPeriodo } from './os';
import { carregarCategorias, getCategoriasConfig, tipoMatchCategoria, type CategoriaConfig } from './categorias';
import { gerarMesesEsperados, getContasOmie, type Conta } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const norm = (s: string): string => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface MesAno {
  mes: number;
  ano: number;
}

// ============================================================================
// Estado de sync per-conta. Cada conta tem seu próprio lock e progresso,
// permitindo NOVA e CASTRO sincronizarem em paralelo (rate limit Omie por chave).
// ============================================================================
export interface SyncState {
  rodando: boolean;
  etapa: string;
  atual: number;
  total: number;
  mesAtual: string;
  erro: string | null;
  finalizado: boolean;
  iniciado: string | null;
  finalizadoEm: string | null;
  runsComErro?: number;
}

const syncStatePorConta: Record<string, SyncState> = {};

export function getSyncState(conta: Conta): SyncState {
  if (!syncStatePorConta[conta]) {
    syncStatePorConta[conta] = {
      rodando: false, etapa: '', atual: 0, total: 0,
      mesAtual: '', erro: null, finalizado: false,
      iniciado: null, finalizadoEm: null,
    };
  }
  return syncStatePorConta[conta];
}

export function resetSyncState(conta: Conta): void {
  const s = getSyncState(conta);
  s.etapa = 'iniciando';
  s.atual = 0;
  s.total = 0;
  s.mesAtual = '';
  s.erro = null;
  s.finalizado = false;
  s.iniciado = new Date().toISOString();
  s.finalizadoEm = null;
}

export function getCacheStatus(): { populando: boolean; porConta: Record<string, SyncState> } {
  const porConta: Record<string, SyncState> = {};
  let algumRodando = false;
  for (const c of getContasOmie()) {
    const s = getSyncState(c.id);
    porConta[c.id] = { ...s };
    if (s.rodando) algumRodando = true;
  }
  return { populando: algumRodando, porConta };
}

// ============================================================================
// agruparEmRunsContiguos: agrupa meses pendentes em "runs" contíguos de até
// tamMax meses. Meses não-contíguos quebram o run.
// ============================================================================
export function agruparEmRunsContiguos(meses: MesAno[], tamMax: number): MesAno[][] {
  if (meses.length === 0) return [];
  const ordenado = meses.slice().sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  const runs: MesAno[][] = [];
  let atual: MesAno[] = [ordenado[0]];
  for (let i = 1; i < ordenado.length; i++) {
    const ult = atual[atual.length - 1];
    const proxMes = ult.mes === 12 ? 1 : ult.mes + 1;
    const proxAno = ult.mes === 12 ? ult.ano + 1 : ult.ano;
    const p = ordenado[i];
    if (p.mes === proxMes && p.ano === proxAno && atual.length < tamMax) {
      atual.push(p);
    } else {
      runs.push(atual);
      atual = [p];
    }
  }
  if (atual.length > 0) runs.push(atual);
  return runs;
}

// ============================================================================
// buscarESalvarItensOmieRange: busca vários meses contíguos em UMA chamada
// ListarPedidos e distribui os itens nos meses corretos por data_pedido.
// (No monolito havia dedup in-flight compartilhado; aqui basta a versão direta —
//  os jobs admin rodam sob lock per-conta, então não há corrida com a UI.)
// ============================================================================
export async function buscarESalvarItensOmieRange(meses: MesAno[], conta: Conta): Promise<void> {
  if (!meses || meses.length === 0) return;
  if (meses.length === 1) {
    await buscarESalvarItensOmie(meses[0].mes, meses[0].ano, conta);
    return;
  }
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];
  const de = fmtD(new Date(primeiro.ano, primeiro.mes - 1, 1));
  const ate = fmtD(new Date(ultimo.ano, ultimo.mes, 0));

  const pedidos = await buscarPedidosPeriodo(de, ate, conta);

  const codigosArr = [...new Set(pedidos.map((p) => p.codigo_produto).filter(Boolean))];
  // Cacheia tipo/familia de cada produto (getProdutoCached usa Supabase + Omie)
  for (let i = 0; i < codigosArr.length; i++) {
    await getProdutoCached(codigosArr[i], conta);
    if (i > 0 && i % 5 === 0) await sleep(500);
  }

  // Pré-carrega CMC histórico por mês para lookup rápido
  const cmcPorMes: Record<string, Record<string, number>> = {};
  for (const m of meses) {
    cmcPorMes[m.mes + '-' + m.ano] = await preCarregarCMCPorMes(codigosArr, m.mes, m.ano, conta);
  }

  // Distribui pedidos entre os meses do range por data_pedido
  const porMes: Record<string, Array<Record<string, unknown>>> = {};
  meses.forEach((m) => { porMes[m.mes + '-' + m.ano] = []; });
  for (const p of pedidos) {
    if (!p.data_pedido) continue;
    const dt = parseDataBR(p.data_pedido);
    const m = dt.getMonth() + 1;
    const a = dt.getFullYear();
    const k = m + '-' + a;
    if (!porMes[k]) continue;
    const info = await getProdutoCached(p.codigo_produto, conta);
    const cmcMap = cmcPorMes[k] || {};
    const cmc = await resolverCMC(p.codigo_produto, p.data_pedido, cmcMap, conta);
    porMes[k].push({
      mes: m, ano: a,
      codigo_produto: p.codigo_produto,
      valor_total: p.valor_total,
      quantidade: p.quantidade,
      valor_unitario: p.valor_unitario,
      tipo: info.tipo || null,
      familia: info.familia || null,
      data_pedido: p.data_pedido || null,
      numero_pedido: p.numero_pedido || null,
      descricao: p.descricao || null,
      codigo_cliente: p.codigo_cliente || null,
      codigo_categoria: p.codigo_categoria || null,
      cmc_unitario: cmc,
      vendedor: p.vendedor || null,
      nome_cliente: p.nome_cliente || null,
      departamento: p.departamento || null,
      conta_omie: conta,
    });
  }

  // Salva cada mês (mesmo com 0 itens, pra registrar o cache_controle)
  for (const m of meses) {
    const k = m.mes + '-' + m.ano;
    const rows = porMes[k] || [];
    const delResp = await supabase.from('vendas_itens').delete().eq('mes', m.mes).eq('ano', m.ano).eq('conta_omie', conta);
    if (delResp.error) throw new Error('Delete vendas_itens falhou: ' + delResp.error.message);
    for (let i = 0; i < rows.length; i += 500) {
      const insResp = await supabase.from('vendas_itens').insert(rows.slice(i, i + 500));
      if (insResp.error) throw new Error('Insert vendas_itens falhou: ' + insResp.error.message);
    }
    const dataControle = ehMesAtual(m.mes, m.ano) ? fmtD(new Date()) : ate;
    await salvarControleCache('vendas', m.mes, m.ano, dataControle, conta);
  }
}

// ============================================================================
// detectarMesesSuspeitos: meses zerados (count=0) E parciais (count baixo).
// Critério APENAS count (soma R$ é enganada por máquinas caras). Ver memória.
// ============================================================================
export interface MesSuspeito {
  mes: number;
  ano: number;
  count: number;
  soma: number;
}
export interface DeteccaoSuspeitos {
  total: number;
  pct: number;
  mediana: number;
  threshold: number;
  medianaSoma: number;
  thresholdSoma: number;
  medianaCount: number;
  thresholdCount: number;
  zerados: MesSuspeito[];
  parciais: MesSuspeito[];
  suspeitos: MesSuspeito[];
}

export async function detectarMesesSuspeitos(conta: Conta, pctThreshold?: number): Promise<DeteccaoSuspeitos> {
  const pct = typeof pctThreshold === 'number' && pctThreshold > 0 && pctThreshold <= 100 ? pctThreshold : 30;
  const mesesEsperados = gerarMesesEsperados(conta);
  const linhas: Array<{ mes: number; ano: number; valor_total: unknown }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('vendas_itens')
      .select('mes,ano,valor_total')
      .eq('conta_omie', conta)
      .range(from, from + 999);
    if (error) break;
    if (!data || data.length === 0) break;
    linhas.push(...(data as typeof linhas));
    if (data.length < 1000) break;
    from += 1000;
  }
  const agg: Record<string, MesSuspeito> = {};
  for (const r of linhas) {
    const k = r.mes + '-' + r.ano;
    if (!agg[k]) agg[k] = { mes: r.mes, ano: r.ano, count: 0, soma: 0 };
    agg[k].count++;
    agg[k].soma += num(r.valor_total);
  }
  const mesesComDados: MesSuspeito[] = mesesEsperados.map((m) => {
    const k = m.mes + '-' + m.ano;
    return agg[k] || { mes: m.mes, ano: m.ano, count: 0, soma: 0 };
  });
  const somasPositivas = mesesComDados.filter((m) => m.soma > 0).map((m) => m.soma).sort((a, b) => a - b);
  const medianaSoma = somasPositivas.length > 0 ? somasPositivas[Math.floor(somasPositivas.length / 2)] : 0;
  const thresholdSoma = Math.max(1000, medianaSoma * (pct / 100));
  const countsPositivos = mesesComDados.filter((m) => m.count > 0).map((m) => m.count).sort((a, b) => a - b);
  const medianaCount = countsPositivos.length > 0 ? countsPositivos[Math.floor(countsPositivos.length / 2)] : 0;
  const thresholdCount = Math.max(10, medianaCount * (pct / 100));
  const zerados = mesesComDados.filter((m) => m.count === 0);
  const parciais = mesesComDados.filter((m) => m.count > 0 && m.count < thresholdCount);
  return {
    total: mesesEsperados.length,
    pct,
    mediana: Math.round(medianaSoma),
    threshold: Math.round(thresholdSoma),
    medianaSoma: Math.round(medianaSoma),
    thresholdSoma: Math.round(thresholdSoma),
    medianaCount: Math.round(medianaCount),
    thresholdCount: Math.round(thresholdCount),
    zerados,
    parciais,
    suspeitos: zerados.concat(parciais),
  };
}

// ============================================================================
// popular-os: limpa e repopula os_mensal de cada conta (foreground).
// ============================================================================
export async function popularOS(contasAlvo: Conta[]): Promise<Array<{ conta: Conta; totalOS: number; mesesProcessados: number }>> {
  return Promise.all(
    contasAlvo.map(async (conta) => {
      const mesesParaCarregar = gerarMesesEsperados(conta);
      // Baixa a listagem ANTES de apagar: com a Omie truncando, o delete deixaria
      // o os_mensal vazio e os meses seriam repopulados com zeros.
      const { lista: todas, completo } = await buscarTodasOSDetalhado(conta);
      if (!completo) throw new Error('popularOS [' + conta + ']: ListarOS veio truncado — nada foi apagado, tente de novo');
      await supabase.from('os_mensal').delete().eq('conta_omie', conta);
      await supabase.from('cache_controle').delete().eq('tipo', 'os').eq('conta_omie', conta);
      for (const p of mesesParaCarregar) {
        const de = fmtD(new Date(p.ano, p.mes - 1, 1));
        const ate = fmtD(new Date(p.ano, p.mes, 0));
        const t = await buscarOSPeriodo(de, ate, conta);
        await supabase.from('os_mensal').upsert({ mes: p.mes, ano: p.ano, valor_total: t.total, valor_nota: t.nota, valor_interno: t.interno, conta_omie: conta }, { onConflict: 'mes,ano,conta_omie' });
        await salvarControleCache('os', p.mes, p.ano, ate, conta);
      }
      return { conta, totalOS: todas.length, mesesProcessados: mesesParaCarregar.length };
    }),
  );
}

// ============================================================================
// popular-cache: vendas (runs trimestrais) + OS, em background, lock per-conta.
// ============================================================================
function jobPopularCacheConta(conta: Conta, forcar: boolean): Promise<void> {
  const s = getSyncState(conta);
  return (async () => {
    const mesesParaCarregar = gerarMesesEsperados(conta);
    try {
      if (forcar) {
        await supabase.from('vendas_itens').delete().eq('conta_omie', conta);
        await supabase.from('os_mensal').delete().eq('conta_omie', conta);
        await supabase.from('produto_tipo').delete().eq('conta_omie', conta);
      }
      const pendentesVendas: MesAno[] = [];
      const pendentesOS: MesAno[] = [];
      for (const p of mesesParaCarregar) {
        const temVendas = await temItensCacheados(p.mes, p.ano, conta);
        if (!temVendas) pendentesVendas.push(p);
        const { data } = await supabase.from('os_mensal').select('mes').eq('mes', p.mes).eq('ano', p.ano).eq('conta_omie', conta).maybeSingle();
        if (!data) pendentesOS.push(p);
      }
      const runsVendas = agruparEmRunsContiguos(pendentesVendas, 3);
      s.etapa = 'vendas';
      s.atual = 0;
      s.total = pendentesVendas.length;
      let processados = 0;
      for (let r = 0; r < runsVendas.length; r++) {
        const run = runsVendas[r];
        const primeiro = run[0].mes + '/' + run[0].ano;
        const ultimo = run[run.length - 1].mes + '/' + run[run.length - 1].ano;
        s.mesAtual = run.length === 1 ? primeiro : primeiro + '..' + ultimo;
        try {
          await buscarESalvarItensOmieRange(run, conta);
          processados += run.length;
          s.atual = processados;
          await sleep(6000);
        } catch (e) {
          s.erro = 'Vendas run ' + s.mesAtual + ': ' + (e as Error).message;
          await sleep(10000);
        }
      }
      s.etapa = 'os';
      s.atual = 0;
      s.total = pendentesOS.length;
      s.erro = null;
      for (let i = 0; i < pendentesOS.length; i++) {
        const p = pendentesOS[i];
        s.atual = i + 1;
        s.mesAtual = p.mes + '/' + p.ano;
        try {
          await obterTotalOS(p.mes, p.ano, conta);
          await sleep(6000);
        } catch (e) {
          s.erro = 'OS ' + p.mes + '/' + p.ano + ': ' + (e as Error).message;
          await sleep(10000);
        }
      }
      s.etapa = 'finalizado';
      s.mesAtual = '';
      s.finalizado = true;
      s.finalizadoEm = new Date().toISOString();
    } catch (e) {
      s.erro = 'Fatal: ' + (e as Error).message;
    } finally {
      s.rodando = false;
    }
  })();
}

/** Dispara popular-cache em background. Retorna quais contas iniciaram/puladas. */
export function iniciarPopularCache(contasAlvo: Conta[], forcar: boolean): { contasIniciadas: Conta[]; contasPuladas: Conta[] } {
  const aIniciar = contasAlvo.filter((c) => !getSyncState(c).rodando);
  const puladas = contasAlvo.filter((c) => getSyncState(c).rodando);
  aIniciar.forEach((conta) => {
    resetSyncState(conta);
    getSyncState(conta).rodando = true;
  });
  // Fire-and-forget (background)
  Promise.all(aIniciar.map((conta) => jobPopularCacheConta(conta, forcar))).catch((e) => {
    console.log('popular-cache erro:', (e as Error).message);
  });
  return { contasIniciadas: aIniciar, contasPuladas: puladas };
}

// ============================================================================
// popular-compras: NÃO PORTADO. A pipeline de escrita de compras (NF-e de
// fornecedor + contas a pagar + enriquecimento de categoria/emitente) ainda não
// existe nas libs do Portal (notas-entrada.ts só tem leitura/listagem). Portar
// o pipeline de sync de compras é um trabalho separado, fora dos helpers
// listados para esta migração. A rota expõe um erro claro até lá.
// ============================================================================
export function popularComprasNaoImplementado(): { erro: string } {
  return { erro: 'popular-compras ainda nao foi portado para o Portal (pipeline de sync de compras pendente)' };
}

// ============================================================================
// repopular-produto-tipo: apaga produto_tipo da conta e re-busca da Omie.
// ============================================================================
export async function repopularProdutoTipo(conta: Conta): Promise<{ deletados: number; produtos: number; repopulados: number }> {
  const delResp = await supabase.from('produto_tipo').delete({ count: 'exact' }).eq('conta_omie', conta);
  const deletados = delResp.count || 0;
  const codigos = new Set<string>();
  let from = 0;
  while (true) {
    const resp2 = await supabase.from('vendas_itens').select('codigo_produto').eq('conta_omie', conta).range(from, from + 999);
    if (!resp2.data || resp2.data.length === 0) break;
    resp2.data.forEach((r: { codigo_produto: unknown }) => { if (r.codigo_produto) codigos.add(String(r.codigo_produto)); });
    if (resp2.data.length < 1000) break;
    from += 1000;
  }
  const codsArr = Array.from(codigos);
  let repopulados = 0;
  for (let i = 0; i < codsArr.length; i++) {
    await getProdutoCached(codsArr[i], conta);
    repopulados++;
    if (i > 0 && i % 5 === 0) await sleep(500);
  }
  return { deletados, produtos: codsArr.length, repopulados };
}

// ============================================================================
// Categorias admin (GET/POST).
// ============================================================================
export async function listarCategoriasAdmin(): Promise<CategoriaConfig[]> {
  await carregarCategorias();
  return getCategoriasConfig();
}

export async function salvarCategoriasAdmin(categorias: Array<{ nome?: string; palavras_chave?: string }>): Promise<{ ok: true; categorias: CategoriaConfig[] } | { erro: string }> {
  if (!Array.isArray(categorias) || categorias.length < 2 || categorias.length > 5) {
    return { erro: 'Envie entre 2 e 5 categorias' };
  }
  for (let i = 0; i < categorias.length; i++) {
    if (!categorias[i].nome || !categorias[i].palavras_chave) {
      return { erro: 'Categoria ' + (i + 1) + ' precisa de nome e palavras_chave' };
    }
  }
  const rows = categorias.map((c, i) => ({
    posicao: i + 1,
    nome: (c.nome || '').trim(),
    palavras_chave: (c.palavras_chave || '').trim(),
  }));
  await supabase.from('categorias_dashboard').delete().gte('posicao', 1);
  const { error } = await supabase.from('categorias_dashboard').insert(rows);
  if (error) return { erro: error.message };
  await carregarCategorias();
  return { ok: true, categorias: await getCategoriasConfig() };
}

// ============================================================================
// familias-distintas: auditoria das 'familia' distintas em vendas_itens.
// ============================================================================
export async function familiasDistintas(conta: Conta): Promise<{ totalLinhas: number; totalDistintas: number; familias: Array<{ familia: string | null; count: number; soma: number }> }> {
  const linhas: Array<{ familia: string | null; valor_total: unknown }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('vendas_itens').select('familia,valor_total').eq('conta_omie', conta).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    linhas.push(...(data as typeof linhas));
    if (data.length < 1000) break;
    from += 1000;
  }
  const agg: Record<string, { familia: string | null; count: number; soma: number }> = {};
  for (const r of linhas) {
    const k = r.familia === null ? '__null__' : r.familia;
    if (!agg[k]) agg[k] = { familia: r.familia, count: 0, soma: 0 };
    agg[k].count++;
    agg[k].soma += num(r.valor_total);
  }
  const familias = Object.values(agg)
    .map((f) => ({ familia: f.familia, count: f.count, soma: Math.round(f.soma) }))
    .sort((a, b) => b.count - a.count);
  return { totalLinhas: linhas.length, totalDistintas: familias.length, familias };
}

// ============================================================================
// itens-orfaos: itens que não caem em cat1/cat2 nem são "pecas" (limbo do agregarCards).
// ============================================================================
export interface OrfaosMes {
  mes: number;
  ano: number;
  count_total: number;
  soma_total: number;
  count_orfaos: number;
  soma_orfaos: number;
  pct_orfaos: number;
}
export async function itensOrfaos(conta: Conta): Promise<{
  cat1: string | null;
  cat2: string | null;
  totalLinhas: number;
  totalOrfaos: number;
  somaOrfaos: number;
  pctOrfaosGeral: number;
  porMes: OrfaosMes[];
}> {
  const cats = await getCategoriasConfig();
  const cat1Config = cats[0];
  const cat2Config = cats[1];
  const linhas: Array<{ mes: number; ano: number; tipo: string | null; familia: string | null; valor_total: unknown }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('vendas_itens').select('mes,ano,tipo,familia,valor_total').eq('conta_omie', conta).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    linhas.push(...(data as typeof linhas));
    if (data.length < 1000) break;
    from += 1000;
  }
  const porMesMap: Record<string, OrfaosMes> = {};
  let totalOrfaosGeral = 0;
  let somaOrfaosGeral = 0;
  for (const r of linhas) {
    const k = r.mes + '-' + r.ano;
    if (!porMesMap[k]) {
      porMesMap[k] = { mes: r.mes, ano: r.ano, count_total: 0, soma_total: 0, count_orfaos: 0, soma_orfaos: 0, pct_orfaos: 0 };
    }
    const bucket = porMesMap[k];
    const valor = num(r.valor_total);
    bucket.count_total++;
    bucket.soma_total += valor;
    const famNorm = norm(r.familia || '');
    const ehPecas = famNorm === '' || famNorm.includes('peca') || famNorm.includes('pecas');
    let categorizado = false;
    if (cat1Config && tipoMatchCategoria(r.tipo, cat1Config)) categorizado = true;
    else if (cat2Config && tipoMatchCategoria(r.tipo, cat2Config)) categorizado = true;
    else if (ehPecas) categorizado = true;
    if (!categorizado) {
      bucket.count_orfaos++;
      bucket.soma_orfaos += valor;
      totalOrfaosGeral++;
      somaOrfaosGeral += valor;
    }
  }
  const porMes = Object.values(porMesMap)
    .map((b) => ({
      mes: b.mes, ano: b.ano,
      count_total: b.count_total,
      soma_total: Math.round(b.soma_total),
      count_orfaos: b.count_orfaos,
      soma_orfaos: Math.round(b.soma_orfaos),
      pct_orfaos: b.count_total > 0 ? Math.round((b.count_orfaos / b.count_total) * 100) : 0,
    }))
    .sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  return {
    cat1: cat1Config ? cat1Config.nome : null,
    cat2: cat2Config ? cat2Config.nome : null,
    totalLinhas: linhas.length,
    totalOrfaos: totalOrfaosGeral,
    somaOrfaos: Math.round(somaOrfaosGeral),
    pctOrfaosGeral: linhas.length > 0 ? Math.round((totalOrfaosGeral / linhas.length) * 100) : 0,
    porMes,
  };
}

// ============================================================================
// debug-listar-pedidos: chamada bruta a ListarPedidos classificando tudo.
// ============================================================================
export async function debugListarPedidos(conta: Conta, de: string, ate: string, amostraN: number): Promise<Record<string, unknown>> {
  const pedidosBrutos: Array<Record<string, unknown>> = [];
  let pag = 1;
  let totalPaginas: number | null = null;
  while (true) {
    const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; pedido_venda_produto?: Array<Record<string, unknown>> }>(
      '/produtos/pedido/', 'ListarPedidos',
      { pagina: pag, registros_por_pagina: 200, apenas_importado_api: 'N', filtrar_por_data_de: de, filtrar_por_data_ate: ate },
      { conta },
    );
    if (r.faultstring) return { erro: 'Omie faultstring: ' + r.faultstring };
    if (!r.pedido_venda_produto || r.pedido_venda_produto.length === 0) break;
    if (r.total_de_paginas) totalPaginas = r.total_de_paginas;
    pedidosBrutos.push(...r.pedido_venda_produto);
    if (totalPaginas && pag >= totalPaginas) break;
    if (!totalPaginas && r.pedido_venda_produto.length < 200) break;
    pag++;
    await sleep(500);
  }

  const porEtapa: Record<string, number> = {};
  const porCancelado: Record<string, number> = { S: 0, N: 0 };
  let passariamCount = 0, passariamItens = 0, passariamSoma = 0;
  let descEtapaCount = 0, descEtapaItens = 0, descEtapaSoma = 0;
  let descCancCount = 0, descCancItens = 0, descCancSoma = 0;
  const amostra: Array<Record<string, unknown>> = [];

  for (const p of pedidosBrutos) {
    const cab = (p.cabecalho || {}) as Record<string, unknown>;
    const info = (p.infoCadastro || {}) as Record<string, unknown>;
    const etapa = String(cab.etapa || '?');
    const canc = info.cancelado === 'S' ? 'S' : 'N';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
    porCancelado[canc]++;
    const det = (p.det || []) as Array<Record<string, unknown>>;
    const somaItens = det.reduce((acc, it) => acc + num(((it.produto || {}) as Record<string, unknown>).valor_total), 0);
    const ehCancelado = canc === 'S';
    const ehEtapaOk = etapa === '60' || etapa === '70';
    if (ehCancelado) {
      descCancCount++; descCancItens += det.length; descCancSoma += somaItens;
    } else if (!ehEtapaOk) {
      descEtapaCount++; descEtapaItens += det.length; descEtapaSoma += somaItens;
    } else {
      passariamCount++; passariamItens += det.length; passariamSoma += somaItens;
    }
    if (amostra.length < amostraN) {
      const primeiro = ((det[0] && det[0].produto) || {}) as Record<string, unknown>;
      amostra.push({
        numero: cab.numero_pedido,
        etapa, cancelado: canc,
        data_previsao: cab.data_previsao || null,
        dInc: info.dInc || null,
        dAlt: info.dAlt || null,
        count_itens: det.length,
        soma_valor: Math.round(somaItens),
        primeiro_produto: { codigo: primeiro.codigo_produto || null, descricao: primeiro.descricao || null, valor: primeiro.valor_total || null },
      });
    }
  }

  return {
    conta, de, ate,
    total_paginas: totalPaginas || pag,
    total_pedidos_brutos: pedidosBrutos.length,
    por_etapa: porEtapa,
    por_cancelado: porCancelado,
    filtro_atual: 'cancelado!=S && etapa in (60,70)',
    passariam_filtro: { pedidos: passariamCount, itens: passariamItens, soma: Math.round(passariamSoma) },
    descartados_por_etapa: { pedidos: descEtapaCount, itens: descEtapaItens, soma: Math.round(descEtapaSoma) },
    descartados_por_cancelado: { pedidos: descCancCount, itens: descCancItens, soma: Math.round(descCancSoma) },
    amostra,
  };
}

// ============================================================================
// debug-listar-os: classifica OS de um período por etapa (count + soma R$).
// ============================================================================
export async function debugListarOS(conta: Conta, de: string, ate: string, amostraN: number): Promise<Record<string, unknown>> {
  const todas = await buscarTodasOS(conta);
  const dtDe = parseDataBR(de);
  const dtAte = parseDataBR(ate);
  const porEtapa: Record<string, { count: number; soma: number }> = {};
  const porCancelada: Record<string, number> = { S: 0, N: 0 };
  let totalNoPeriodo = 0;
  let somaTotal = 0;
  let somaEtapa60 = 0;
  let somaEtapa60ou70 = 0;
  const amostra: Array<Record<string, unknown>> = [];

  for (const os of todas) {
    const cab = (os.Cabecalho || {}) as Record<string, unknown>;
    const info = (os.InfoCadastro || os.infoCadastro || {}) as Record<string, unknown>;
    const cancelada = (info.cCancelada || cab.cCancelada) === 'S' ? 'S' : 'N';
    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) continue;
    totalNoPeriodo++;
    porCancelada[cancelada]++;
    if (cancelada === 'S') continue;
    const etapa = String(cab.cEtapa || '?');
    const valor = num(cab.nValorTotal);
    if (!porEtapa[etapa]) porEtapa[etapa] = { count: 0, soma: 0 };
    porEtapa[etapa].count++;
    porEtapa[etapa].soma += valor;
    somaTotal += valor;
    if (etapa === '60') somaEtapa60 += valor;
    if (etapa === '60' || etapa === '70') somaEtapa60ou70 += valor;
    if (amostra.length < amostraN) {
      amostra.push({
        numero: cab.cNumOS || cab.nCodOS || null,
        etapa, cancelada,
        dDtFat: info.dDtFat || null,
        dDtInc: info.dDtInc || null,
        dDtPrevisao: cab.dDtPrevisao || null,
        nValorTotal: valor,
      });
    }
  }

  const porEtapaOut: Record<string, { count: number; soma: number }> = {};
  for (const k of Object.keys(porEtapa)) {
    porEtapaOut[k] = { count: porEtapa[k].count, soma: Math.round(porEtapa[k].soma) };
  }

  return {
    conta, de, ate,
    total_os_carregadas_da_api: todas.length,
    os_no_periodo: totalNoPeriodo,
    por_cancelada: porCancelada,
    por_etapa: porEtapaOut,
    filtro_atual: 'cEtapa === 60 (somente)',
    soma_filtro_atual: Math.round(somaEtapa60),
    soma_se_60_ou_70: Math.round(somaEtapa60ou70),
    soma_todas_etapas_nao_canceladas: Math.round(somaTotal),
    amostra,
  };
}

// ============================================================================
// forcar-resync-meses: re-sync de uma lista de meses (background, lock per-conta).
// ============================================================================
function jobForcarResync(conta: Conta, meses: MesAno[]): Promise<void> {
  const s = getSyncState(conta);
  return (async () => {
    try {
      const runs = agruparEmRunsContiguos(meses, 3);
      let processados = 0;
      let runsComErro = 0;
      const errosDetalhe: string[] = [];
      for (let r = 0; r < runs.length; r++) {
        const run = runs[r];
        const primeiro = run[0].mes + '/' + run[0].ano;
        const ultimo = run[run.length - 1].mes + '/' + run[run.length - 1].ano;
        s.mesAtual = run.length === 1 ? primeiro : primeiro + '..' + ultimo;
        try {
          await buscarESalvarItensOmieRange(run, conta);
          processados += run.length;
          s.atual = processados;
          await sleep(6000);
        } catch (e) {
          runsComErro++;
          errosDetalhe.push(s.mesAtual + ': ' + (e as Error).message);
          s.erro = 'Run ' + s.mesAtual + ': ' + (e as Error).message;
          await sleep(10000);
        }
      }
      s.runsComErro = runsComErro;
      s.etapa = runsComErro > 0 ? 'finalizado (' + runsComErro + '/' + runs.length + ' runs com erro)' : 'finalizado';
      s.mesAtual = '';
      s.finalizado = true;
      s.finalizadoEm = new Date().toISOString();
    } catch (e) {
      s.erro = 'Fatal: ' + (e as Error).message;
    } finally {
      s.rodando = false;
    }
  })();
}

/** Dispara forcar-resync em background. Se meses vazio, auto-detecta suspeitos. */
export async function iniciarForcarResync(conta: Conta, mesesEntrada?: MesAno[]): Promise<{ ok?: boolean; erro?: string; mensagem?: string; mesesAlvo?: number; meses?: MesAno[] }> {
  let meses = mesesEntrada;
  if (!Array.isArray(meses) || meses.length === 0) {
    const detect = await detectarMesesSuspeitos(conta);
    meses = detect.suspeitos.map((s) => ({ mes: s.mes, ano: s.ano }));
  }
  if (meses.length === 0) {
    return { ok: true, mensagem: 'Nenhum mes zerado encontrado para ' + conta };
  }
  if (getSyncState(conta).rodando) {
    return { erro: 'Conta ' + conta + ' ja esta sincronizando, aguarde' };
  }
  resetSyncState(conta);
  const s = getSyncState(conta);
  s.rodando = true;
  s.etapa = 'forcar-resync';
  s.total = meses.length;
  const mesesFinal = meses;
  jobForcarResync(conta, mesesFinal).catch((e) => {
    console.log('forcar-resync-meses erro:', (e as Error).message);
    s.rodando = false;
  });
  return { ok: true, mensagem: 'Re-sync forcado iniciado em background', mesesAlvo: mesesFinal.length, meses: mesesFinal };
}

// Re-export para consumo conveniente nas rotas
export type { Conta, Pedido };
