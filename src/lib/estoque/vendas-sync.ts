// Sync de vendas (pedidos Omie → vendas_itens no Supabase) + leitura cacheada.
// Portado de server.js: buscarPedidosPeriodo, getProdutoCached,
// preCarregarCMCPorMes, resolverCMC, buscarItensDoBanco, buscarESalvarItensOmie,
// incremental do mês atual, agendamentos BG e obterItensProdutos.
//
// Threading EXPLÍCITO de conta (sem AsyncLocalStorage):
//   - escrita/Omie usam `conta: Conta` (concreta, default NOVA)
//   - leitura usa `conta: ContaFiltro` (undefined = "Todas")
// Caches em memória são singletons do processo (Railway `next start`, longevo),
// keyed por conta — best-effort, sempre com fallback para fetch fresco.

import { supabase, filtroConta } from './supabase';
import { omieRequest, listarCaractProduto, getTipoProduto } from './omie';
import { fmtD, sleep, ehMesAtual } from './utils';
import { getIgnorarFiltro } from './ignorar-clientes';
import { CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';
import type { ItemVenda } from './categorias';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// --- Caches em memória (keyed por conta) ---
interface ProdutoInfo {
  tipo: string | null;
  familia: string | null;
}
const produtoCache: Record<string, ProdutoInfo> = {}; // 'conta:codigo' => {tipo,familia}
const cmcCache: Record<string, number | null> = {}; // 'conta:codigo:DD/MM/YYYY' => cmc|null
const inFlightVendas: Record<string, Promise<Pedido[]> | Promise<ItemVenda[]>> = {};
const ultimoFetchVendas: Record<string, number> = {};
const TTL_INCREMENTAL_MS = 60_000;

export interface Pedido {
  codigo_produto: string;
  valor_total: number;
  quantidade: number;
  valor_unitario: number;
  data_pedido: string;
  numero_pedido: string;
  descricao: string;
  codigo_cliente: string;
  codigo_categoria: string;
  vendedor: string;
  nome_cliente: string;
  departamento: string;
}

// === Controle de cache (cache_controle) ===
export async function salvarControleCache(
  tipo: string,
  mes: number,
  ano: number,
  ultimaData: string,
  conta: Conta,
): Promise<void> {
  const { error } = await supabase
    .from('cache_controle')
    .upsert({ tipo, mes, ano, ultima_data: ultimaData, conta_omie: conta }, { onConflict: 'tipo,mes,ano,conta_omie' });
  if (error) {
    throw new Error('salvarControleCache ' + tipo + ' ' + mes + '/' + ano + ' [' + conta + ']: ' + error.message);
  }
}

export async function obterControleCache(tipo: string, mes: number, ano: number, conta: Conta): Promise<string | null> {
  const { data } = await supabase
    .from('cache_controle')
    .select('ultima_data')
    .eq('tipo', tipo)
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('conta_omie', conta)
    .maybeSingle();
  return data ? (data.ultima_data as string) : null;
}

export async function temItensCacheados(mes: number, ano: number, conta: Conta): Promise<boolean> {
  const { count } = await supabase
    .from('vendas_itens')
    .select('*', { count: 'exact', head: true })
    .eq('mes', mes)
    .eq('ano', ano)
    .eq('conta_omie', conta);
  return (count || 0) > 0;
}

// === Leitura do banco (respeita conta: undefined = Todas) ===
export async function buscarItensDoBanco(mes: number, ano: number, conta: ContaFiltro): Promise<ItemVenda[] | null> {
  let todos: ItemVenda[] = [];
  let offset = 0;
  const { codigos } = await getIgnorarFiltro(conta);
  while (true) {
    let q = filtroConta(
      supabase
        .from('vendas_itens')
        .select('tipo,familia,valor_total,quantidade,codigo_categoria,cmc_unitario')
        .eq('mes', mes)
        .eq('ano', ano),
      conta,
    );
    if (codigos.length > 0) q = (q as typeof q).not('codigo_cliente', 'in', '(' + codigos.join(',') + ')');
    const { data } = await q.range(offset, offset + 999);
    if (!data || data.length === 0) break;
    todos = todos.concat(data as ItemVenda[]);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (todos.length === 0) return null;
  return todos;
}

// === Pedidos da API Omie (ListarPedidos paginado) ===
export async function buscarPedidosPeriodo(de: string, ate: string, conta: Conta): Promise<Pedido[]> {
  const pedidos: Pedido[] = [];
  let pag = 1;
  let totalPaginas: number | null = null;
  while (true) {
    const r = await omieRequest<{
      faultstring?: string;
      total_de_paginas?: number;
      pedido_venda_produto?: Array<Record<string, unknown>>;
    }>(
      '/produtos/pedido/',
      'ListarPedidos',
      { pagina: pag, registros_por_pagina: 200, apenas_importado_api: 'N', filtrar_por_data_de: de, filtrar_por_data_ate: ate },
      { conta },
    );
    if (r.faultstring) {
      const fsNorm = r.faultstring.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (fsNorm.includes('nao existem registros')) break;
      throw new Error('buscarPedidosPeriodo ' + de + '-' + ate + ' pag ' + pag + ' faultstring: ' + r.faultstring);
    }
    if (!r.pedido_venda_produto || r.pedido_venda_produto.length === 0) {
      if (pag === 1) break;
      throw new Error(
        'buscarPedidosPeriodo ' + de + '-' + ate + ' parou na pag ' + pag + ' com 0 pedidos (resposta vazia inesperada)',
      );
    }
    if (r.total_de_paginas) totalPaginas = r.total_de_paginas;
    for (const p of r.pedido_venda_produto) {
      const info = (p.infoCadastro || {}) as Record<string, unknown>;
      const cab = (p.cabecalho || {}) as Record<string, unknown>;
      if (info.cancelado === 'S') continue;
      if (cab.etapa !== '60' && cab.etapa !== '70') continue;
      const dataPedido = String(cab.data_previsao || info.dInc || '');
      const numPedido = String(cab.numero_pedido || '');
      const infoAdic = (p.informacoes_adicionais || {}) as Record<string, unknown>;
      const codCategoria = String(infoAdic.codigo_categoria || '');
      const nomeVendedor =
        infoAdic.nome_vendedor || infoAdic.codigo_vendedor || cab.nome_vendedor || cab.codigo_vendedor || '';
      const nomeCliente = infoAdic.nome_cliente || cab.nome_cliente || '';
      const deptos = (p.departamentos || []) as Array<Record<string, unknown>>;
      const departamento = infoAdic.codigo_departamento || (deptos[0] && deptos[0].cDepartamento) || '';
      const dets = (p.det || []) as Array<Record<string, unknown>>;
      for (const item of dets) {
        const pr = (item.produto || {}) as Record<string, unknown>;
        pedidos.push({
          codigo_produto: String(pr.codigo_produto || ''),
          valor_total: num(pr.valor_total),
          quantidade: num(pr.quantidade),
          valor_unitario: num(pr.valor_unitario),
          data_pedido: dataPedido,
          numero_pedido: numPedido,
          descricao: String(pr.descricao || pr.descricao_produto || pr.codigo || ''),
          codigo_cliente: String(cab.codigo_cliente || ''),
          codigo_categoria: codCategoria,
          vendedor: String(nomeVendedor || ''),
          nome_cliente: String(nomeCliente || ''),
          departamento: String(departamento || ''),
        });
      }
    }
    if (totalPaginas) {
      if (pag >= totalPaginas) break;
    } else if (r.pedido_venda_produto.length < 200) {
      break;
    }
    pag++;
    await sleep(500);
  }
  return pedidos;
}

// === Tipo/família do produto (cache em-memória → produto_tipo → Omie) ===
export async function getProdutoCached(codProduto: string | number, conta: Conta): Promise<ProdutoInfo> {
  const cacheKey = conta + ':' + codProduto;
  if (produtoCache[cacheKey] !== undefined) return produtoCache[cacheKey];
  const { data } = await supabase
    .from('produto_tipo')
    .select('tipo,familia')
    .eq('codigo_produto', String(codProduto))
    .eq('conta_omie', conta)
    .maybeSingle();
  if (data) {
    produtoCache[cacheKey] = { tipo: (data.tipo as string) || null, familia: (data.familia as string) || null };
    return produtoCache[cacheKey];
  }
  const caracts = await listarCaractProduto(parseInt(String(codProduto)), conta);
  const tipo = getTipoProduto(caracts);
  let familia: string | null = null;
  try {
    const prod = await omieRequest<{ descricao_familia?: string }>(
      '/geral/produtos/',
      'ConsultarProduto',
      { codigo_produto: parseInt(String(codProduto)) },
      { conta },
    );
    familia = prod.descricao_familia || null;
  } catch {
    /* familia fica null */
  }
  produtoCache[cacheKey] = { tipo, familia };
  await supabase
    .from('produto_tipo')
    .upsert({ codigo_produto: String(codProduto), tipo, familia, conta_omie: conta }, { onConflict: 'codigo_produto,conta_omie' });
  return produtoCache[cacheKey];
}

// === CMC pré-carregado por mês (cmc_historico) ===
export async function preCarregarCMCPorMes(
  codigosProduto: string[],
  mes: number,
  ano: number,
  conta: Conta,
): Promise<Record<string, number>> {
  if (!codigosProduto || codigosProduto.length === 0) return {};
  const mapa: Record<string, number> = {};
  for (let i = 0; i < codigosProduto.length; i += 200) {
    const lote = codigosProduto.slice(i, i + 200).map(String);
    const { data } = await supabase
      .from('cmc_historico')
      .select('id_produto,cmc')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('conta_omie', conta)
      .in('id_produto', lote);
    if (data) data.forEach((d: { id_produto: unknown; cmc: unknown }) => { mapa[String(d.id_produto)] = num(d.cmc); });
  }
  return mapa;
}

/** CMC de um produto numa data: cache local → cmc_historico do mês. Não chama API no sync. */
export async function resolverCMC(
  codigoProduto: string,
  dataStr: string,
  cmcMesMap: Record<string, number>,
  conta: Conta,
): Promise<number | null> {
  if (!codigoProduto) return null;
  const cacheKey = conta + ':' + codigoProduto + ':' + dataStr;
  if (cmcCache[cacheKey] !== undefined) return cmcCache[cacheKey];
  if (cmcMesMap && cmcMesMap[String(codigoProduto)] > 0) {
    const val = cmcMesMap[String(codigoProduto)];
    cmcCache[cacheKey] = val;
    return val;
  }
  cmcCache[cacheKey] = null;
  return null;
}

// === Busca + salva o mês inteiro (sync) ===
function mapPedidoParaRow(p: Pedido, mes: number, ano: number, conta: Conta, cmc: number | null) {
  const info = produtoCache[conta + ':' + p.codigo_produto] || ({} as ProdutoInfo);
  return {
    mes,
    ano,
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
  };
}

/** Mapa (codigo_produto|data_pedido → cmc_unitario>0) das linhas já gravadas do mês. */
async function carregarCmcExistente(mes: number, ano: number, conta: Conta): Promise<Record<string, number>> {
  const mapa: Record<string, number> = {};
  const LOTE = 1000;
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('vendas_itens')
      .select('codigo_produto,data_pedido,cmc_unitario')
      .eq('mes', mes).eq('ano', ano).eq('conta_omie', conta)
      .not('cmc_unitario', 'is', null).gt('cmc_unitario', 0)
      .range(offset, offset + LOTE - 1);
    const lote = (data || []) as Array<{ codigo_produto: unknown; data_pedido: unknown; cmc_unitario: unknown }>;
    lote.forEach((r) => {
      if (r.codigo_produto && r.data_pedido) mapa[String(r.codigo_produto) + '|' + String(r.data_pedido)] = num(r.cmc_unitario);
    });
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return mapa;
}

/**
 * Mapa codigo_produto → cmc (>0) a partir do snapshot atual da tabela `produtos`.
 * Fonte de CMC sem chamar o Omie no sync. OBS: `produtos.conta_omie` é gravado em
 * MINÚSCULO (diferente de vendas_itens), por isso o filtro usa conta.toLowerCase().
 */
async function carregarCmcProdutos(conta: Conta): Promise<Record<string, number>> {
  const mapa: Record<string, number> = {};
  const LOTE = 1000;
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('produtos')
      .select('codigo_produto,cmc')
      .eq('conta_omie', String(conta).toLowerCase())
      .gt('cmc', 0)
      .range(offset, offset + LOTE - 1);
    const lote = (data || []) as Array<{ codigo_produto: unknown; cmc: unknown }>;
    lote.forEach((r) => { if (r.codigo_produto != null) mapa[String(r.codigo_produto)] = num(r.cmc); });
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  return mapa;
}

async function buscarESalvarItensOmieInner(mes: number, ano: number, conta: Conta): Promise<Pedido[]> {
  const de = fmtD(new Date(ano, mes - 1, 1));
  const ate = fmtD(new Date(ano, mes, 0));
  const pedidos = await buscarPedidosPeriodo(de, ate, conta);
  const codigosArr = [...new Set(pedidos.map((p) => p.codigo_produto).filter(Boolean))];
  for (let i = 0; i < codigosArr.length; i++) {
    await getProdutoCached(codigosArr[i], conta);
    if (i > 0 && i % 5 === 0) await sleep(500);
  }
  if (pedidos.length > 0) {
    const cmcMap = await preCarregarCMCPorMes(codigosArr, mes, ano, conta);
    // Preserva o cmc_unitario já enriquecido (backfill diário via Omie) antes do
    // delete+reinsert. Sem isto, o re-sync do mês corrente zera o custo, pois
    // resolverCMC só lê cmc_historico — que não tem o mês atual. (bug: dashboard
    // de vendas sem custos no mês corrente.)
    const cmcExistente = await carregarCmcExistente(mes, ano, conta);
    // Fallback final: CMC do snapshot atual de `produtos` (sem Omie).
    const cmcProdutos = await carregarCmcProdutos(conta);
    const rows = [];
    for (const p of pedidos) {
      let cmc = await resolverCMC(p.codigo_produto, p.data_pedido, cmcMap, conta);
      if ((cmc === null || cmc === 0) && p.codigo_produto && p.data_pedido) {
        const prev = cmcExistente[p.codigo_produto + '|' + p.data_pedido];
        if (prev > 0) cmc = prev;
      }
      if ((cmc === null || cmc === 0) && p.codigo_produto) {
        const snap = cmcProdutos[String(p.codigo_produto)];
        if (snap > 0) cmc = snap;
      }
      rows.push(mapPedidoParaRow(p, mes, ano, conta, cmc));
    }
    const delResp = await supabase.from('vendas_itens').delete().eq('mes', mes).eq('ano', ano).eq('conta_omie', conta);
    if (delResp.error) throw new Error('Delete vendas_itens falhou: ' + delResp.error.message);
    for (let i = 0; i < rows.length; i += 500) {
      const insResp = await supabase.from('vendas_itens').insert(rows.slice(i, i + 500));
      if (insResp.error) throw new Error('Insert vendas_itens falhou: ' + insResp.error.message);
    }
    const dataControle = ehMesAtual(mes, ano) ? fmtD(new Date()) : ate;
    await salvarControleCache('vendas', mes, ano, dataControle, conta);
  }
  return pedidos;
}

export async function buscarESalvarItensOmie(mes: number, ano: number, conta: Conta): Promise<Pedido[]> {
  const key = conta + ':' + mes + '-' + ano;
  if (inFlightVendas[key] !== undefined) {
    const r = await inFlightVendas[key];
    return Array.isArray(r) ? (r as Pedido[]) : [];
  }
  const promise = buscarESalvarItensOmieInner(mes, ano, conta);
  inFlightVendas[key] = promise;
  try {
    const r = await promise;
    ultimoFetchVendas[key] = Date.now();
    return r;
  } finally {
    delete inFlightVendas[key];
  }
}

// === Delta do mês atual ===
async function buscarIncrementalMesAtualInner(mes: number, ano: number, conta: Conta): Promise<ItemVenda[]> {
  const now = new Date();
  const hoje = fmtD(now);
  const ultimaData = await obterControleCache('vendas', mes, ano, conta);

  if (!ultimaData) {
    await buscarESalvarItensOmieInner(mes, ano, conta);
    return (await buscarItensDoBanco(mes, ano, conta)) || [];
  }

  const partes = ultimaData.split('/');
  const dtUltima = new Date(Number(partes[2]), Number(partes[1]) - 1, parseInt(partes[0]));
  if (dtUltima > now) {
    await buscarESalvarItensOmie(mes, ano, conta);
    return (await buscarItensDoBanco(mes, ano, conta)) || [];
  }
  const deDelta = ultimaData;

  const pedidosNovos = await buscarPedidosPeriodo(deDelta, hoje, conta);
  const codigosArr = [...new Set(pedidosNovos.map((p) => p.codigo_produto).filter(Boolean))];
  for (let i = 0; i < codigosArr.length; i++) {
    await getProdutoCached(codigosArr[i], conta);
    if (i > 0 && i % 5 === 0) await sleep(500);
  }

  if (pedidosNovos.length > 0) {
    const datasParaLimpar = new Set(pedidosNovos.map((p) => p.data_pedido).filter(Boolean));
    // Preserva o cmc_unitario já enriquecido das datas que serão re-inseridas.
    const cmcExistente = await carregarCmcExistente(mes, ano, conta);
    for (const dt of datasParaLimpar) {
      const delResp = await supabase
        .from('vendas_itens')
        .delete()
        .eq('mes', mes)
        .eq('ano', ano)
        .eq('data_pedido', dt)
        .eq('conta_omie', conta);
      if (delResp.error) throw new Error('Erro ao deletar itens delta ' + dt + ': ' + delResp.error.message);
    }
    const cmcMap = await preCarregarCMCPorMes(codigosArr, mes, ano, conta);
    const cmcProdutos = await carregarCmcProdutos(conta);
    const rows = [];
    for (const p of pedidosNovos) {
      let cmc = await resolverCMC(p.codigo_produto, p.data_pedido, cmcMap, conta);
      if ((cmc === null || cmc === 0) && p.codigo_produto && p.data_pedido) {
        const prev = cmcExistente[p.codigo_produto + '|' + p.data_pedido];
        if (prev > 0) cmc = prev;
      }
      if ((cmc === null || cmc === 0) && p.codigo_produto) {
        const snap = cmcProdutos[String(p.codigo_produto)];
        if (snap > 0) cmc = snap;
      }
      rows.push(mapPedidoParaRow(p, mes, ano, conta, cmc));
    }
    for (let i = 0; i < rows.length; i += 500) {
      const insResp = await supabase.from('vendas_itens').insert(rows.slice(i, i + 500));
      if (insResp.error) throw new Error('Erro ao inserir itens delta lote ' + i + ': ' + insResp.error.message);
    }
  }

  await salvarControleCache('vendas', mes, ano, hoje, conta);
  return (await buscarItensDoBanco(mes, ano, conta)) || [];
}

/** Dispara delta do mês atual em background (dedup in-flight + throttle TTL). */
export function agendarRefreshMesAtual(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':' + mes + '-' + ano;
  if (inFlightVendas[key] !== undefined) return;
  const ultimaVez = ultimoFetchVendas[key];
  if (ultimaVez && Date.now() - ultimaVez < TTL_INCREMENTAL_MS) return;
  const promise = buscarIncrementalMesAtualInner(mes, ano, conta);
  inFlightVendas[key] = promise;
  promise
    .then(() => { ultimoFetchVendas[key] = Date.now(); })
    .catch((e) => { console.log('Refresh BG vendas [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + e.message); })
    .finally(() => { delete inFlightVendas[key]; });
}

function agendarSyncVendasPassado(mes: number, ano: number, conta: Conta): void {
  const key = conta + ':' + mes + '-' + ano;
  if (inFlightVendas[key] !== undefined) return;
  buscarESalvarItensOmie(mes, ano, conta).catch((e) => {
    console.log('Sync BG vendas passado [' + conta + '] ' + mes + '/' + ano + ' falhou: ' + e.message);
  });
}

/**
 * Itens individuais (do banco ou disparando sync BG). UI nunca espera Omie.
 * `conta` filtra a leitura; o sync BG usa a conta concreta (default NOVA).
 * Portado de obterItensProdutos (server.js:1087).
 */
export async function obterItensProdutos(mes: number, ano: number, conta: ContaFiltro): Promise<ItemVenda[]> {
  const contaConcreta: Conta = conta ?? CONTA_DEFAULT;
  if (ehMesAtual(mes, ano)) {
    const cached = await buscarItensDoBanco(mes, ano, conta);
    agendarRefreshMesAtual(mes, ano, contaConcreta);
    return cached || [];
  }
  const cached = await buscarItensDoBanco(mes, ano, conta);
  if (cached) return cached;
  const controle = await obterControleCache('vendas', mes, ano, contaConcreta);
  if (controle) return [];
  agendarSyncVendasPassado(mes, ano, contaConcreta);
  return [];
}
