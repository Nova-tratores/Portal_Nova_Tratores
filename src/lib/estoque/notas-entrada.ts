// Notas de entrada (NF-e fornecedor): listagem cacheada no Supabase, contas a
// pagar / DANFE via Omie, categorias Omie e backfill de enriquecimento (nome do
// emitente via chave NFe → CNPJ → Clientes_Omie; categoria via cCodCateg).
// Portado de /api/notas-entrada*, /contas-pagar-nf, /danfe, /omie-categorias.

import { supabase, filtroConta } from './supabase';
import { omieRequest } from './omie';
import { fmtD, fmtCnpjBR, sleep } from './utils';
import { getIgnorarFiltro } from './ignorar-clientes';
import { getCredentials, CONTA_DEFAULT, type Conta, type ContaFiltro } from './conta';

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

/**
 * Normaliza os itens de uma nota de entrada para o shape plano que a tela
 * renderiza. A sync grava `itens` no formato CRU do Omie (`det[].prod.*`), então
 * `it.descricao`/`it.codigo_produto`/etc. vinham sempre `undefined` (era o motivo
 * das descrições e valores não carregarem). Aceita também o formato plano legado.
 */
export function normalizarItensEntrada(itens: unknown): Array<{
  codigo_produto: string; descricao: string; quantidade: number; valor_unitario: number; valor_total: number;
}> {
  if (!Array.isArray(itens)) return [];
  return itens.map((raw) => {
    const it = (raw || {}) as Record<string, unknown>;
    const prod = (it.prod ?? null) as Record<string, unknown> | null;
    if (prod) {
      return {
        codigo_produto: String(prod.cProd ?? ''),
        descricao: String(prod.xProd ?? ''),
        quantidade: num(prod.qCom ?? prod.qTrib),
        valor_unitario: num(prod.vUnCom ?? prod.vUnTrib),
        valor_total: num(prod.vProd ?? prod.vTotItem),
      };
    }
    return {
      codigo_produto: String(it.codigo_produto ?? ''),
      descricao: String(it.descricao ?? ''),
      quantidade: num(it.quantidade),
      valor_unitario: num(it.valor_unitario),
      valor_total: num(it.valor_total),
    };
  });
}

// ===== Categorias Omie (código → descrição), cache 30 min por conta =====
const categoriasOmieCache: Record<string, { mapa: Record<string, string>; time: number }> = {};

export async function buscarCategoriasOmie(conta: Conta): Promise<Record<string, string>> {
  const cached = categoriasOmieCache[conta];
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.mapa;
  const mapa: Record<string, string> = {};
  let pag = 1;
  while (true) {
    try {
      const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; categoria_cadastro?: Array<{ codigo?: string; descricao?: string }> }>(
        '/geral/categorias/', 'ListarCategorias', { pagina: pag, registros_por_pagina: 500 }, { conta },
      );
      if (r.faultstring) break;
      const lista = r.categoria_cadastro || [];
      if (lista.length === 0) break;
      lista.forEach((c) => { if (c.codigo && c.descricao) mapa[c.codigo] = c.descricao; });
      const totalPag = r.total_de_paginas || 0;
      if (totalPag && pag >= totalPag) break;
      if (lista.length < 500) break;
      pag++;
      await sleep(1000);
    } catch {
      break;
    }
  }
  categoriasOmieCache[conta] = { mapa, time: Date.now() };
  return mapa;
}

export async function listarCategoriasOmie(conta: ContaFiltro): Promise<Array<{ codigo: string; descricao: string }>> {
  const mapa = await buscarCategoriasOmie(conta ?? CONTA_DEFAULT);
  return Object.entries(mapa)
    .map(([codigo, descricao]) => ({ codigo, descricao }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// ===== Listagem de notas de entrada =====
export interface NotasEntradaResult {
  notas: Array<Record<string, unknown>>;
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

// Colunas retornadas para a listagem da tela.
const NOTA_COLS =
  'id,ncod_nf,numero_nf,serie,data_emissao,hora_emissao,emitente,nome_emitente,categoria,contas_pagar,valor_produtos,valor_nf,valor_icms,valor_ipi,valor_frete,valor_desconto,valor_total_tributos,parcelas,itens,complemento,cancelada,mes,ano,conta_omie';

/** Normaliza uma linha do banco p/ o shape da tela: resolve ncod_nf via
 *  complemento.nIdNF (sync antiga não populava; faz o DANFE abrir sem rebuild) e
 *  achata os itens (formato cru do Omie). */
function normalizarNotaRow(n: unknown): Record<string, unknown> {
  const row = (n || {}) as Record<string, unknown>;
  const compl = (row.complemento || {}) as Record<string, unknown>;
  return { ...row, ncod_nf: row.ncod_nf ?? compl.nIdNF ?? null, itens: normalizarItensEntrada(row.itens) };
}

const lc = (s: unknown) => String(s ?? '').toLowerCase();

/**
 * Busca por DESCRIÇÃO do produto: varre o `itens` (jsonb cru do Omie) no servidor,
 * aplicando também nf/fornecedor/ignorar em memória, e devolve as notas que casam
 * ordenadas por emissão desc. A paginação é feita em memória (evita listas gigantes
 * de id na URL do PostgREST). Sem índice/RPC.
 */
async function buscarNotasPorDescricao(
  filtros: { nf?: string; fornecedor?: string; descricao?: string },
  conta: ContaFiltro,
  nomesIgnorar: string[],
): Promise<Array<{ id: number; data_emissao: string }>> {
  const termo = lc(filtros.descricao).trim();
  const nf = lc(filtros.nf).trim();
  const forn = lc(filtros.fornecedor).trim();
  const ignorar = new Set(nomesIgnorar.map((x) => String(x)));
  const LOTE = 1000;
  const matched: Array<{ id: number; data_emissao: string }> = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from('notas_entrada').select('id,numero_nf,nome_emitente,data_emissao,itens').order('id', { ascending: true }).range(offset, offset + LOTE - 1);
    q = filtroConta(q, conta);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<Record<string, unknown>>;
    for (const row of lote) {
      const nome = String(row.nome_emitente ?? '');
      if (ignorar.has(nome)) continue;
      if (nf && !lc(row.numero_nf).includes(nf)) continue;
      if (forn && !lc(nome).includes(forn)) continue;
      const itens = Array.isArray(row.itens) ? row.itens : [];
      const bate = itens.some((raw) => {
        const it = (raw || {}) as Record<string, unknown>;
        const prod = (it.prod ?? null) as Record<string, unknown> | null;
        return lc(prod?.xProd ?? it.descricao).includes(termo);
      });
      if (bate) matched.push({ id: row.id as number, data_emissao: String(row.data_emissao ?? '') });
    }
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  // Ordena por emissão desc. data_emissao pode ser ISO (YYYY-MM-DD) ou DD/MM/YYYY.
  const toISO = (d: string) => { const p = d.split('/'); return p.length === 3 ? `${p[2]}${p[1]}${p[0]}` : d; };
  matched.sort((a, b) => (toISO(b.data_emissao) < toISO(a.data_emissao) ? -1 : 1));
  return matched;
}

export async function listarNotasEntrada(
  filtros: { mes?: number; ano?: number; nf?: string; fornecedor?: string; descricao?: string; pagina?: number },
  conta: ContaFiltro,
): Promise<NotasEntradaResult> {
  const pag = filtros.pagina || 1;
  const porPagina = 50;
  const offset = (pag - 1) * porPagina;
  const { nomes } = await getIgnorarFiltro(conta);

  // Busca por descrição do produto: varre os itens e pagina em memória.
  if (filtros.descricao && filtros.descricao.trim()) {
    const matched = await buscarNotasPorDescricao(filtros, conta, nomes);
    const total = matched.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const pageIds = matched.slice(offset, offset + porPagina).map((m) => m.id);
    if (pageIds.length === 0) return { notas: [], total, pagina: pag, porPagina, totalPaginas };
    const { data, error } = await supabase.from('notas_entrada').select(NOTA_COLS).in('id', pageIds);
    if (error) throw new Error(error.message);
    const byId = new Map((data || []).map((r) => [(r as Record<string, unknown>).id as number, r]));
    const notasNorm = pageIds.map((id) => byId.get(id)).filter(Boolean).map(normalizarNotaRow);
    return { notas: notasNorm, total, pagina: pag, porPagina, totalPaginas };
  }

  let query = supabase.from('notas_entrada').select(NOTA_COLS, { count: 'exact' });
  // NF e/ou fornecedor são busca textual e ignoram o filtro de mês/ano.
  const temTexto = !!(filtros.nf || filtros.fornecedor);
  if (filtros.nf) query = query.ilike('numero_nf', '%' + filtros.nf + '%');
  if (filtros.fornecedor) query = query.ilike('nome_emitente', '%' + filtros.fornecedor + '%');
  if (!temTexto) {
    if (filtros.mes) query = query.eq('mes', filtros.mes);
    if (filtros.ano) query = query.eq('ano', filtros.ano);
  }
  query = filtroConta(query, conta);
  if (nomes.length > 0) {
    const escaped = nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',');
    query = query.not('nome_emitente', 'in', '(' + escaped + ')');
  }
  query = query.order('data_emissao', { ascending: false }).range(offset, offset + porPagina - 1);
  const { data: notas, count, error } = await query;
  if (error) throw new Error(error.message);
  const notasNorm = (notas || []).map(normalizarNotaRow);
  return { notas: notasNorm, total: count || 0, pagina: pag, porPagina, totalPaginas: Math.ceil((count || 0) / porPagina) };
}

// ===== Todas as notas de um período (campos mínimos, sem paginação) =====
// Usado pelo "selecionar todas do período" da tela de Notas de Entrada.
export interface NotaResumo { id: number; numero_nf: string | null; valor_nf: number }

export async function listarNotasEntradaTodas(
  filtros: { mes?: number; ano?: number; nf?: string; fornecedor?: string; descricao?: string },
  conta: ContaFiltro,
): Promise<{ notas: NotaResumo[]; total: number; somaValor: number }> {
  const { nomes } = await getIgnorarFiltro(conta);
  const escaped = nomes.length > 0 ? '(' + nomes.map((n) => '"' + String(n).replace(/"/g, '') + '"').join(',') + ')' : null;

  // Busca por descrição: reusa a varredura de itens e busca os valores por id.
  if (filtros.descricao && filtros.descricao.trim()) {
    const matched = await buscarNotasPorDescricao(filtros, conta, nomes);
    if (matched.length === 0) return { notas: [], total: 0, somaValor: 0 };
    const ids = matched.map((m) => m.id);
    const notas: NotaResumo[] = [];
    const CH = 500;
    for (let i = 0; i < ids.length; i += CH) {
      const { data, error } = await supabase.from('notas_entrada').select('id,numero_nf,valor_nf').in('id', ids.slice(i, i + CH));
      if (error) throw new Error(error.message);
      (data || []).forEach((r) => notas.push({ id: (r as { id: number }).id, numero_nf: (r as { numero_nf: string | null }).numero_nf, valor_nf: num((r as { valor_nf: unknown }).valor_nf) }));
    }
    const somaValor = notas.reduce((s, n) => s + n.valor_nf, 0);
    return { notas, total: notas.length, somaValor };
  }

  const temTexto = !!(filtros.nf || filtros.fornecedor);
  const LOTE = 1000;
  const notas: NotaResumo[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from('notas_entrada').select('id,numero_nf,valor_nf');
    if (filtros.nf) query = query.ilike('numero_nf', '%' + filtros.nf + '%');
    if (filtros.fornecedor) query = query.ilike('nome_emitente', '%' + filtros.fornecedor + '%');
    if (!temTexto) {
      if (filtros.mes) query = query.eq('mes', filtros.mes);
      if (filtros.ano) query = query.eq('ano', filtros.ano);
    }
    query = filtroConta(query, conta);
    if (escaped) query = query.not('nome_emitente', 'in', escaped);
    query = query.order('data_emissao', { ascending: false }).range(offset, offset + LOTE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const lote = (data || []) as Array<{ id: number; numero_nf: string | null; valor_nf: unknown }>;
    lote.forEach((r) => notas.push({ id: r.id, numero_nf: r.numero_nf, valor_nf: num(r.valor_nf) }));
    if (lote.length < LOTE) break;
    offset += LOTE;
  }
  const somaValor = notas.reduce((s, n) => s + n.valor_nf, 0);
  return { notas, total: notas.length, somaValor };
}

// ===== Contas a pagar de uma NF (Omie) =====
export interface TituloContaPagar {
  numero_documento: string;
  data_vencimento: string;
  data_emissao: string;
  data_previsao: string;
  valor_documento: number;
  status_titulo: string;
  categorias: unknown[];
  observacao: string;
  codigo_categoria: string;
  numero_parcela: string;
  numero_documento_fiscal: string;
  data_pagamento: string;
  valor_pago: number;
}

export async function buscarContasPagarNF(
  numeroNf: string,
  cnpj: string | null,
  dataEmissao: string | null,
  conta: Conta,
): Promise<TituloContaPagar[]> {
  const titulos: TituloContaPagar[] = [];
  const params: Record<string, unknown> = { pagina: 1, registros_por_pagina: 100, filtrar_apenas_titulos_em_aberto: 'N' };
  if (cnpj) params.filtrar_por_cpf_cnpj = cnpj;
  if (dataEmissao) {
    const p = dataEmissao.split('/');
    if (p.length === 3) {
      const dt = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
      const de = new Date(dt); de.setMonth(de.getMonth() - 1);
      const ate = new Date(dt); ate.setMonth(ate.getMonth() + 2);
      params.filtrar_por_emissao_de = fmtD(de);
      params.filtrar_por_emissao_ate = fmtD(ate);
    }
  }
  let pag = 1;
  const nfBusca = String(numeroNf).trim();
  while (true) {
    params.pagina = pag;
    const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; conta_pagar_cadastro?: Array<Record<string, unknown>> }>(
      '/financas/contapagar/', 'ListarContasPagar', params, { conta },
    );
    if (r.faultstring) break;
    const lista = r.conta_pagar_cadastro || [];
    if (lista.length === 0) break;
    lista.forEach((t) => {
      const numDoc = String(t.numero_documento || '').trim();
      const numDocFiscal = String(t.numero_documento_fiscal || '').trim();
      if (numDoc === nfBusca || numDocFiscal === nfBusca || numDoc.includes(nfBusca) || numDocFiscal.includes(nfBusca)) {
        titulos.push({
          numero_documento: String(t.numero_documento || ''),
          data_vencimento: String(t.data_vencimento || ''),
          data_emissao: String(t.data_emissao || ''),
          data_previsao: String(t.data_previsao || ''),
          valor_documento: num(t.valor_documento),
          status_titulo: String(t.status_titulo || ''),
          categorias: (t.categorias as unknown[]) || [],
          observacao: String(t.observacao || ''),
          codigo_categoria: String(t.codigo_categoria || ''),
          numero_parcela: String(t.numero_parcela || ''),
          numero_documento_fiscal: String(t.numero_documento_fiscal || ''),
          data_pagamento: String(t.data_pagamento || ''),
          valor_pago: num(t.valor_pago),
        });
      }
    });
    const totalPag = r.total_de_paginas || 0;
    if (totalPag && pag >= totalPag) break;
    if (lista.length < 100) break;
    pag++;
    await sleep(1000);
  }
  return titulos;
}

// ===== URL do DANFE =====
export async function getUrlDanfe(
  args: { ncod_nf?: string; numero_nf?: string; serie?: string; chave?: string },
  conta: Conta,
): Promise<string> {
  let nCodNF = args.ncod_nf ? parseInt(args.ncod_nf) : null;
  if (!nCodNF && (args.numero_nf || args.chave)) {
    // O código interno da NF de entrada vem no `compl.nIdNF` do ConsultarNF (não
    // num `nCodNF` de topo). Consulta por chave quando disponível (é única).
    const param = args.chave
      ? { cChaveNFe: args.chave }
      : { nNF: args.numero_nf, serie: args.serie || '1', tpNF: '0', tpAmb: '1' };
    const consulta = await omieRequest<{ nCodNF?: number; compl?: { nIdNF?: number }; nfCadastro?: { nCodNF?: number } }>(
      '/produtos/nfconsultar/', 'ConsultarNF', param, { conta },
    );
    nCodNF = consulta?.nCodNF || consulta?.compl?.nIdNF || consulta?.nfCadastro?.nCodNF || null;
  }
  if (!nCodNF) throw new Error('Nao foi possivel encontrar o codigo interno da NF');
  const r = await omieRequest<{ faultstring?: string; cUrlDanfe?: string }>(
    '/produtos/notafiscalutil/', 'GetUrlDanfe', { nCodNF }, { conta },
  );
  if (r.faultstring) throw new Error(r.faultstring);
  if (!r.cUrlDanfe) throw new Error('URL do DANFE nao disponivel');
  return r.cUrlDanfe;
}

// ===== Backfill de enriquecimento (background) =====
export interface BackfillStatus {
  rodando: boolean;
  etapa?: string;
  total?: number;
  processadas?: number;
  total_no_periodo?: number;
  candidatos?: number;
  emitentes_preenchidos?: number;
  categorias_preenchidas?: number;
  consultarClientes_calls?: number;
  ainda_null?: number;
  updates_ok?: number;
  updates_erro?: number;
  ultimo_erro?: string | null;
  erro?: string | null;
  finalizadoEm?: string | null;
  mes?: number;
  ano?: number;
}

const backfillEnrStatus: Record<string, BackfillStatus> = {};

export function getBackfillStatus(conta: ContaFiltro): BackfillStatus {
  const k = conta || '__TODAS__';
  if (!backfillEnrStatus[k]) backfillEnrStatus[k] = { rodando: false };
  return backfillEnrStatus[k];
}

export function resetBackfillStatus(conta: ContaFiltro): void {
  const k = conta || '__TODAS__';
  backfillEnrStatus[k] = { rodando: false };
}

/** CNPJ (14 díg.) da chave de acesso NF-e (44 díg.). */
function cnpjFromChaveNFe(chave: unknown): string | null {
  if (!chave || typeof chave !== 'string') return null;
  const d = chave.replace(/\D/g, '');
  if (d.length !== 44) return null;
  return d.substring(6, 20);
}

/**
 * Busca um cliente/fornecedor pelo CNPJ (timeout via AbortController, sem o wrapper
 * que dorme ate 10 min).
 *
 * GOTCHA: o `ConsultarCliente` do Omie NAO aceita `cnpj_cpf` — so aceita
 * `codigo_cliente_omie` / `codigo_cliente_integracao`. Passar CNPJ devolve
 * "ERROR: Tag [CNPJ_CPF] nao faz parte da estrutura do tipo complexo
 * [clientes_cadastro_chave]". Por CNPJ o caminho correto e' `ListarClientes` com
 * `clientesFiltro`. (Testado em runtime 21/07/2026 — antes disso esta funcao
 * falhava SEMPRE e o enriquecimento do nome do emitente nunca acontecia.)
 */
async function buscarClientePorCnpj(cnpjFmt: string, conta: Conta, timeoutMs = 10000): Promise<Record<string, unknown> | null> {
  const { appKey, appSecret } = getCredentials(conta);
  const body = {
    app_key: appKey,
    app_secret: appSecret,
    call: 'ListarClientes',
    param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N', clientesFiltro: { cnpj_cpf: cnpjFmt } }],
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('https://app.omie.com.br/api/v1/geral/clientes/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal,
    });
    const json = (await res.json()) as { faultstring?: string; clientes_cadastro?: Array<Record<string, unknown>> };
    if (json.faultstring) return null;
    return json.clientes_cadastro?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispara o backfill de enriquecimento em background (fire-and-forget).
 * Retorna imediatamente; o progresso é acompanhado por getBackfillStatus.
 */
/**
 * Enriquece as notas de um mês/conta (nome_emitente + categoria) e AGUARDA a
 * conclusão. Reusada pelo wrapper fire-and-forget (`iniciarBackfillEnriquecimento`,
 * botão "Enriquecer") e pelo cron de compras (auto-heal pós-sync). Atualiza o
 * status em memória (backfillEnrStatus) p/ a rota de status.
 */
export async function enriquecerNotasMes(mes: number, ano: number, conta: ContaFiltro): Promise<BackfillStatus> {
  const k = conta || '__TODAS__';
  const s: BackfillStatus = {
    rodando: true, etapa: 'iniciando', total: 0, processadas: 0, total_no_periodo: 0, candidatos: 0,
    emitentes_preenchidos: 0, categorias_preenchidas: 0, consultarClientes_calls: 0, ainda_null: 0,
    updates_ok: 0, updates_erro: 0, ultimo_erro: null, erro: null, finalizadoEm: null, mes, ano,
  };
  backfillEnrStatus[k] = s;
  const contaConcreta: Conta = conta ?? CONTA_DEFAULT;

  try {
    s.etapa = 'buscando linhas do periodo';
    const { data: todasRows, error } = await filtroConta(
      supabase.from('notas_entrada').select('id,ncod_nf,numero_nf,serie,nome_emitente,categoria,emitente,complemento,parcelas,contas_pagar').eq('mes', mes).eq('ano', ano),
      conta,
    );
    if (error) throw new Error(error.message);
    const rowsAll = (todasRows || []) as Array<Record<string, unknown>>;
    s.total_no_periodo = rowsAll.length;
    const rows = rowsAll.filter((r) => {
      const semNome = !r.nome_emitente || String(r.nome_emitente).trim() === '';
      const semCat = !r.categoria || String(r.categoria).trim() === '';
      return semNome || semCat;
    });
    s.total = rows.length;
    s.candidatos = rows.length;
    if (rows.length === 0) { s.etapa = 'finalizado (nada pra processar)'; s.rodando = false; s.finalizadoEm = new Date().toISOString(); return s; }

    s.etapa = 'buscando categorias Omie';
    const categoriasMap = await buscarCategoriasOmie(contaConcreta);

    // CNPJs únicos via chave NFe
    const cnpjsUnicos = new Set<string>();
    rows.forEach((r) => {
      const compl = (r.complemento || {}) as Record<string, unknown>;
      const cnpj = cnpjFromChaveNFe(compl.cChaveNFe);
      if (cnpj) cnpjsUnicos.add(cnpj);
    });

    const cnpjNomeMap: Record<string, string> = {};
    const cnpjArr = [...cnpjsUnicos];
    s.etapa = 'buscando fornecedores em Clientes_Omie';
    for (const cnpj of cnpjArr) {
      if (backfillEnrStatus[k] !== s) return s;
      const fmt = fmtCnpjBR(cnpj);
      try {
        const { data } = await supabase.from('Clientes_Omie').select('id,nome').filter('cpf/cnpj', 'eq', fmt).limit(1);
        if (data && data[0] && data[0].nome) cnpjNomeMap[cnpj] = String(data[0].nome);
      } catch { /* segue */ }
    }

    s.etapa = 'consultando fornecedores no Omie via CNPJ';
    const cnpjFaltantes = cnpjArr.filter((c) => !cnpjNomeMap[c]);
    for (const cnpj of cnpjFaltantes) {
      if (backfillEnrStatus[k] !== s) return s;
      try {
        const r = await buscarClientePorCnpj(fmtCnpjBR(cnpj), contaConcreta, 10000);
        s.consultarClientes_calls = (s.consultarClientes_calls || 0) + 1;
        if (r) {
          const nome = (r.razao_social || r.nome_fantasia) as string | undefined;
          if (nome) cnpjNomeMap[cnpj] = nome;
        }
        await sleep(500);
      } catch {
        s.consultarClientes_calls = (s.consultarClientes_calls || 0) + 1;
        await sleep(500);
      }
    }

    s.etapa = 'atualizando linhas';
    for (const r of rows) {
      if (backfillEnrStatus[k] !== s) return s;
      const updates: Record<string, unknown> = {};
      const compl = (r.complemento || {}) as Record<string, unknown>;
      const parcelas = (r.parcelas as Array<Record<string, unknown>>) || [];
      const parc0 = parcelas[0] || {};
      const codCat = (compl.cCodCateg || parc0.cCodCateg) as string | undefined;
      const chave = (compl.cChaveNFe as string) || null;
      const cnpj = cnpjFromChaveNFe(chave);
      const semCategoria = !r.categoria || String(r.categoria).trim() === '';
      const semNome = !r.nome_emitente || String(r.nome_emitente).trim() === '';

      if (semCategoria && codCat && categoriasMap[codCat]) updates.categoria = categoriasMap[codCat];

      if (semNome && cnpj && cnpjNomeMap[cnpj]) {
        updates.nome_emitente = cnpjNomeMap[cnpj];
        updates.emitente = Object.assign({}, (r.emitente as object) || {}, { cnpj_cpf: fmtCnpjBR(cnpj), xNome: cnpjNomeMap[cnpj], cChaveNFe: chave });
      } else if (cnpj) {
        const emitExistente = (r.emitente || {}) as Record<string, unknown>;
        if (!emitExistente.cnpj_cpf) updates.emitente = Object.assign({}, emitExistente, { cnpj_cpf: fmtCnpjBR(cnpj), cChaveNFe: chave });
      }

      if (updates.categoria) s.categorias_preenchidas = (s.categorias_preenchidas || 0) + 1;
      if (updates.nome_emitente) s.emitentes_preenchidos = (s.emitentes_preenchidos || 0) + 1;
      if (!updates.categoria && !updates.nome_emitente && !updates.emitente) s.ainda_null = (s.ainda_null || 0) + 1;

      if (Object.keys(updates).length > 0) {
        const { error: upErr, data: upData } = await supabase.from('notas_entrada').update(updates).eq('id', r.id as number).select('id');
        if (upErr) { s.updates_erro = (s.updates_erro || 0) + 1; s.ultimo_erro = upErr.message; }
        else if (!upData || upData.length === 0) { s.updates_erro = (s.updates_erro || 0) + 1; s.ultimo_erro = 'update 0 rows (RLS?) id=' + r.id; }
        else s.updates_ok = (s.updates_ok || 0) + 1;
      }
      s.processadas = (s.processadas || 0) + 1;
    }

    s.etapa = 'finalizado';
    s.rodando = false;
    s.finalizadoEm = new Date().toISOString();
    return s;
  } catch (e) {
    s.erro = (e as Error).message;
    s.rodando = false;
    s.finalizadoEm = new Date().toISOString();
    return s;
  }
}

/**
 * Dispara o enriquecimento em background (fire-and-forget). Retorna imediatamente;
 * o progresso é acompanhado por getBackfillStatus.
 */
export function iniciarBackfillEnriquecimento(mes: number, ano: number, conta: ContaFiltro): { ok: boolean; erro?: string } {
  const k = conta || '__TODAS__';
  const prev = backfillEnrStatus[k];
  if (prev && prev.rodando) return { ok: false, erro: 'Backfill ja rodando para esta conta' };
  void enriquecerNotasMes(mes, ano, conta).catch(() => {});
  return { ok: true };
}
