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
import { invalidarResumoVendas } from './resumo-cache';
import { planejarGravacao, dataReferencia, lerDataBR, mesReferencia, chaveMes, type MesAnoRef } from './vendas-referencia';

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
  data_faturamento: string; // infoCadastro.dFat (DD/MM/AAAA) — decide o mês (ver vendas-referencia)
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
/**
 * Itens de vendas do mês. `diaCorte` (period-to-date): quando informado, mantém
 * só os itens cujo dia de `data_pedido` é ≤ diaCorte (clampado ao último dia do
 * mês). Usado para comparar o mês corrente parcial contra o mesmo recorte de
 * dias dos períodos anteriores.
 */
export async function buscarItensDoBanco(mes: number, ano: number, conta: ContaFiltro, diaCorte: number | null = null): Promise<ItemVenda[] | null> {
  let todos: ItemVenda[] = [];
  let offset = 0;
  const { codigos } = await getIgnorarFiltro(conta);
  const BASE = 'tipo,familia,valor_total,quantidade,codigo_categoria,cmc_unitario';
  // O corte por dia usa o FATURAMENTO quando gravado (data_faturamento), senão a
  // data do pedido. Sem a coluna (migration sql/vendas-itens-data-faturamento.sql
  // ainda não aplicada) a consulta é refeita só com data_pedido.
  let selecao = diaCorte != null ? BASE + ',data_pedido,data_faturamento' : BASE;
  while (true) {
    const consulta = (sel: string) => {
      let q = filtroConta(
        supabase
          .from('vendas_itens')
          .select(sel)
          .eq('mes', mes)
          .eq('ano', ano),
        conta,
      );
      if (codigos.length > 0) q = (q as typeof q).not('codigo_cliente', 'in', '(' + codigos.join(',') + ')');
      return q.range(offset, offset + 999);
    };
    let { data, error } = await consulta(selecao);
    if (error && /data_faturamento/.test(error.message)) {
      selecao = BASE + ',data_pedido';
      ({ data, error } = await consulta(selecao));
    }
    if (!data || data.length === 0) break;
    todos = todos.concat(data as ItemVenda[]);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (diaCorte != null) {
    const limite = Math.min(diaCorte, new Date(ano, mes, 0).getDate());
    todos = todos.filter((r) => {
      const linha = r as { data_pedido?: string; data_faturamento?: string | null };
      const d = lerDataBR(dataReferencia({ data_pedido: linha.data_pedido ?? '', data_faturamento: linha.data_faturamento }))?.dia ?? 0;
      return d > 0 && d <= limite;
    });
  }
  if (todos.length === 0) return null;
  return todos;
}

// === Pedidos da API Omie (ListarPedidos paginado) ===
// A Omie devolve o pedido incluído OU alterado na janela (não filtra por
// faturamento). `descartados`, quando passado, recebe o número dos pedidos que
// vieram cancelados ou fora das etapas faturadas (60/70) — quem grava usa isso
// para tirar do espelho um pedido que foi cancelado depois de faturado.
export async function buscarPedidosPeriodo(de: string, ate: string, conta: Conta, descartados?: Set<string>): Promise<Pedido[]> {
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
      const numPedido = String(cab.numero_pedido || '');
      if (info.cancelado === 'S' || (cab.etapa !== '60' && cab.etapa !== '70')) {
        if (descartados && numPedido) descartados.add(numPedido);
        continue;
      }
      const dataPedido = String(cab.data_previsao || info.dInc || '');
      const dataFaturamento = String(info.dFat || '');
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
          data_faturamento: dataFaturamento,
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
  const familiaCache = data ? (data.familia as string) || null : null;
  // Só confia no cache quando a família ESTÁ preenchida. Com família nula, o
  // produto pode ter sido cadastrado no Omie antes da família ser definida
  // (ex.: veículos criados e vendidos no mesmo dia) — re-consultamos o Omie para
  // não congelar um `null` stale e evitar que máquina sem família vire "peça".
  if (data && familiaCache) {
    produtoCache[cacheKey] = { tipo: (data.tipo as string) || null, familia: familiaCache };
    return produtoCache[cacheKey];
  }
  // Linha nova OU família nula → (re)consulta o Omie. Preserva o `tipo` já
  // gravado quando a linha existe (não refaz características nem sobrescreve).
  let tipo: string | null;
  if (data) {
    tipo = (data.tipo as string) || null;
  } else {
    const caracts = await listarCaractProduto(parseInt(String(codProduto)), conta);
    tipo = getTipoProduto(caracts);
  }
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
    data_faturamento: p.data_faturamento || null,
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

/**
 * Mapa (numero_pedido|codigo_produto → cmc_unitario>0) das linhas já gravadas
 * dos pedidos que vão ser regravados — em QUALQUER mês, porque o pedido pode
 * estar trocando de mês. Preserva o CMC enriquecido (backfill diário via Omie)
 * antes do delete+reinsert; sem isto o re-sync do mês corrente zera o custo.
 */
async function carregarCmcPorPedidos(numeros: string[], conta: Conta): Promise<Record<string, number>> {
  const mapa: Record<string, number> = {};
  for (let i = 0; i < numeros.length; i += 200) {
    const lote = numeros.slice(i, i + 200);
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('vendas_itens')
        .select('id,numero_pedido,codigo_produto,cmc_unitario')
        .eq('conta_omie', conta)
        .in('numero_pedido', lote)
        .gt('cmc_unitario', 0)
        .order('id')
        .range(offset, offset + 999);
      if (error) throw new Error('carregarCmcPorPedidos [' + conta + ']: ' + error.message);
      const linhas = (data || []) as Array<{ numero_pedido: unknown; codigo_produto: unknown; cmc_unitario: unknown }>;
      linhas.forEach((r) => {
        if (r.numero_pedido && r.codigo_produto) mapa[String(r.numero_pedido) + '|' + String(r.codigo_produto)] = num(r.cmc_unitario);
      });
      if (linhas.length < 1000) break;
      offset += 1000;
    }
  }
  return mapa;
}

/** Apaga do espelho os pedidos (por número, em qualquer mês) da conta. */
async function apagarPedidos(numeros: string[], conta: Conta): Promise<void> {
  for (let i = 0; i < numeros.length; i += 200) {
    const lote = numeros.slice(i, i + 200);
    const { error } = await supabase.from('vendas_itens').delete().eq('conta_omie', conta).in('numero_pedido', lote);
    if (error) throw new Error('Delete vendas_itens por pedido falhou: ' + error.message);
  }
}

const semDataFaturamento = (r: Record<string, unknown>) => {
  const c = { ...r };
  delete c.data_faturamento;
  return c;
};

// Sem a migration sql/vendas-itens-data-faturamento.sql o insert é refeito sem
// a coluna. Rearmado a cada gravação (aplicar a migration vale sem redeploy).
async function inserirLinhas(rows: Array<Record<string, unknown>>): Promise<void> {
  let semColuna = false;
  for (let i = 0; i < rows.length; i += 500) {
    let lote = rows.slice(i, i + 500);
    if (semColuna) lote = lote.map(semDataFaturamento);
    let { error } = await supabase.from('vendas_itens').insert(lote);
    if (error && !semColuna && /data_faturamento/.test(error.message)) {
      semColuna = true;
      ({ error } = await supabase.from('vendas_itens').insert(lote.map(semDataFaturamento)));
    }
    if (error) throw new Error('Insert vendas_itens falhou (lote ' + i + '): ' + error.message);
  }
}

/**
 * Grava um lote de pedidos vindo da Omie no espelho. Cada pedido vai para o mês
 * do faturamento (ver vendas-referencia). Apaga antes:
 *   - os meses do `escopo` INTEIROS (tira a cópia errada que o sync antigo
 *     deixou lá — pedido de outro mês gravado pela janela de alteração);
 *   - os pedidos regravados e os descartados (cancelados / fora de 60-70) em
 *     QUALQUER mês da conta.
 * `escopo` null = delta: só mexe nos pedidos que vieram.
 * Quem chama garante que a janela da Omie cobre do início do escopo até hoje
 * (pedido faturado no mês e alterado depois só volta numa janela que alcance a
 * alteração) — senão limpar o mês inteiro perderia pedido.
 */
export async function gravarPedidos(
  pedidos: Pedido[],
  descartados: Iterable<string>,
  escopo: MesAnoRef[] | null,
  conta: Conta,
): Promise<{ gravados: number; foraDoEscopo: number; apagados: number }> {
  const plano = planejarGravacao(pedidos, descartados, escopo);
  const grupos = [...plano.porMes.values()];
  const codigosArr = [...new Set(grupos.flatMap((g) => g.itens.map((p) => p.codigo_produto)).filter(Boolean))];
  for (let i = 0; i < codigosArr.length; i++) {
    await getProdutoCached(codigosArr[i], conta);
    if (i > 0 && i % 5 === 0) await sleep(500);
  }
  const numeros = [...plano.numerosApagar];
  const cmcPedidos = await carregarCmcPorPedidos(numeros, conta);
  // Fallback final: CMC do snapshot atual de `produtos` (sem Omie).
  const cmcProdutos = codigosArr.length > 0 ? await carregarCmcProdutos(conta) : {};
  const rows: Array<Record<string, unknown>> = [];
  for (const g of grupos) {
    const codigosMes = [...new Set(g.itens.map((p) => p.codigo_produto).filter(Boolean))];
    const cmcMap = await preCarregarCMCPorMes(codigosMes, g.mes, g.ano, conta);
    for (const p of g.itens) {
      let cmc = await resolverCMC(p.codigo_produto, p.data_pedido, cmcMap, conta);
      if ((cmc === null || cmc === 0) && p.codigo_produto) {
        const prev = cmcPedidos[p.numero_pedido + '|' + p.codigo_produto];
        if (prev > 0) cmc = prev;
      }
      if ((cmc === null || cmc === 0) && p.codigo_produto) {
        const snap = cmcProdutos[String(p.codigo_produto)];
        if (snap > 0) cmc = snap;
      }
      rows.push(mapPedidoParaRow(p, g.mes, g.ano, conta, cmc));
    }
  }
  if (escopo) {
    for (const m of escopo) {
      const { error } = await supabase.from('vendas_itens').delete().eq('mes', m.mes).eq('ano', m.ano).eq('conta_omie', conta);
      if (error) throw new Error('Delete vendas_itens ' + m.mes + '/' + m.ano + ' falhou: ' + error.message);
    }
  }
  await apagarPedidos(numeros, conta);
  await inserirLinhas(rows);
  invalidarResumoVendas();
  return { gravados: rows.length, foraDoEscopo: plano.foraDoEscopo, apagados: numeros.length };
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

/**
 * Sincroniza um ou mais meses CONTÍGUOS numa chamada ListarPedidos. A janela vai
 * do 1º dia do primeiro mês até HOJE: a Omie filtra por inclusão/alteração, e
 * pedido faturado no mês e alterado depois só volta numa janela que alcance a
 * alteração. O que vier de outro mês é ignorado aqui (fica onde está).
 * `cache_controle` é gravado mesmo para mês sem venda (0 legítimo, não re-sincroniza).
 * Devolve os pedidos que caíram nos meses pedidos.
 */
export async function sincronizarMesesVendas(meses: MesAnoRef[], conta: Conta): Promise<Pedido[]> {
  if (meses.length === 0) return [];
  const ordenados = [...meses].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const primeiro = ordenados[0];
  const hoje = new Date();
  const de = fmtD(new Date(primeiro.ano, primeiro.mes - 1, 1));
  const descartados = new Set<string>();
  const pedidos = await buscarPedidosPeriodo(de, fmtD(hoje), conta, descartados);
  if (pedidos.length === 0 && descartados.size === 0) {
    // Janela inteira vazia: não apaga nada (pode ser falha silenciosa); só
    // marca como sincronizado o mês que já está vazio no espelho.
    for (const m of ordenados) {
      if (!(await temItensCacheados(m.mes, m.ano, conta))) {
        await salvarControleCache('vendas', m.mes, m.ano, ehMesAtual(m.mes, m.ano) ? fmtD(hoje) : fmtD(new Date(m.ano, m.mes, 0)), conta);
      }
    }
    return [];
  }
  await gravarPedidos(pedidos, descartados, ordenados, conta);
  for (const m of ordenados) {
    const dataControle = ehMesAtual(m.mes, m.ano) ? fmtD(hoje) : fmtD(new Date(m.ano, m.mes, 0));
    await salvarControleCache('vendas', m.mes, m.ano, dataControle, conta);
  }
  const chaves = new Set(ordenados.map(chaveMes));
  return pedidos.filter((p) => {
    const ref = mesReferencia(p);
    return ref != null && chaves.has(chaveMes(ref));
  });
}

async function buscarESalvarItensOmieInner(mes: number, ano: number, conta: Conta): Promise<Pedido[]> {
  return sincronizarMesesVendas([{ mes, ano }], conta);
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

  // Delta: regrava só os pedidos que vieram (cada um no mês do faturamento,
  // inclusive mês passado) e tira os cancelados/estornados de onde estiverem.
  const descartados = new Set<string>();
  const pedidosNovos = await buscarPedidosPeriodo(deDelta, hoje, conta, descartados);
  if (pedidosNovos.length > 0 || descartados.size > 0) {
    await gravarPedidos(pedidosNovos, descartados, null, conta);
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
export async function obterItensProdutos(mes: number, ano: number, conta: ContaFiltro, diaCorte: number | null = null): Promise<ItemVenda[]> {
  const contaConcreta: Conta = conta ?? CONTA_DEFAULT;
  if (ehMesAtual(mes, ano)) {
    const cached = await buscarItensDoBanco(mes, ano, conta, diaCorte);
    agendarRefreshMesAtual(mes, ano, contaConcreta);
    return cached || [];
  }
  const cached = await buscarItensDoBanco(mes, ano, conta, diaCorte);
  if (cached) return cached;
  const controle = await obterControleCache('vendas', mes, ano, contaConcreta);
  if (controle) return [];
  agendarSyncVendasPassado(mes, ano, contaConcreta);
  return [];
}
