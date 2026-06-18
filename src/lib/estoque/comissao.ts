// Sistema de Comissão. Portado do monolito server.js (7862-9034).
// Motor de cálculo VERBATIM + funções de dados, todas recebendo `conta: Conta`
// concreta (comissão é SEMPRE por conta — não há modo "Todas" aqui).
//
// Tabelas: comissao_config, comissao_pessoas, comissao_regras,
// comissao_ajustes_servicos, comissao_ajustes_vendas, comissao_bonus_historico,
// comissao_custos_vendedor.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { parseDataBR, sleep } from './utils';
import type { Conta } from './conta';

const norm = (s: string): string =>
  (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ============================================================================
// Motor de cálculo (VERBATIM de server.js)
// ============================================================================

export function round2(n: number | null | undefined): number | null {
  if (n === null || n === undefined || isNaN(n)) return null;
  return Math.round(Number(n) * 100) / 100;
}

export interface CalcComissaoArgs {
  valor_liquido: number;
  vendedor_1?: string | null;
  vendedor_2?: string | null;
  divisao_fundo_pct: number;
  divisao_v1_pct: number;
  divisao_v2_pct: number;
  override_pct?: number | string | null;
  pessoas_bonus_map: Record<string, number>;
  base_pct: number;
}

export interface CalcComissaoResult {
  comissao_final_pct: number | null;
  valor_total: number | null;
  valor_fundo: number | null;
  valor_v1: number | null;
  valor_v2: number | null;
}

// Formula servicos: base% * (1 + max_bonus/100), capped em bonus 100.
// override manual sobrepoe. Divide em Fundo/V1/V2 (soma deve = 100).
export function calcularComissaoServico(args: CalcComissaoArgs): CalcComissaoResult {
  const {
    valor_liquido, vendedor_1, vendedor_2,
    divisao_fundo_pct, divisao_v1_pct, divisao_v2_pct,
    override_pct, pessoas_bonus_map, base_pct,
  } = args;

  let comissao_final_pct: number;
  if (override_pct !== null && override_pct !== undefined && override_pct !== '' && !isNaN(Number(override_pct))) {
    comissao_final_pct = Number(override_pct);
  } else {
    const b1 = Number(pessoas_bonus_map[vendedor_1 || ''] || 0);
    const b2 = Number(pessoas_bonus_map[vendedor_2 || ''] || 0);
    const max_bonus = Math.min(Math.max(b1, b2, 0), 100);
    comissao_final_pct = Number(base_pct || 15) * (1 + max_bonus / 100);
  }
  const vl = Number(valor_liquido || 0);
  const valor_total = vl * comissao_final_pct / 100;
  const df = Number(divisao_fundo_pct || 0);
  const dv1 = Number(divisao_v1_pct || 0);
  const dv2 = Number(divisao_v2_pct || 0);
  return {
    comissao_final_pct: round2(comissao_final_pct),
    valor_total:        round2(valor_total),
    valor_fundo:        round2(valor_total * df / 100),
    valor_v1:           round2(valor_total * dv1 / 100),
    valor_v2:           round2(valor_total * dv2 / 100),
  };
}

export interface Regra {
  id: number;
  dominio: string;
  categoria_match?: string | null;
  familia_match?: string | null;
  departamento_match?: string | null;
  comissao_pct: number;
  prioridade?: number;
  ativo?: boolean;
}

export interface RegraCtx {
  categoria?: string | null;
  familia?: string | null;
  departamento?: string | null;
}

// Resolve a regra mais especifica aplicavel a uma venda/servico.
// Ordem: familia_match > categoria_match > departamento_match > default.
// Em empate, prioridade DESC manda.
export function resolverRegraComissao(regras: Regra[], ctx: RegraCtx): { pct: number; regra: Regra | null } {
  const candidatas = regras.filter((r) => {
    if (r.familia_match     && r.familia_match     !== ctx.familia)     return false;
    if (r.categoria_match   && r.categoria_match   !== ctx.categoria)   return false;
    if (r.departamento_match && r.departamento_match !== ctx.departamento) return false;
    return true;
  });
  if (candidatas.length === 0) return { pct: 0, regra: null };

  candidatas.sort((a, b) => {
    const sa = (a.familia_match ? 1 : 0) + (a.categoria_match ? 1 : 0) + (a.departamento_match ? 1 : 0);
    const sb = (b.familia_match ? 1 : 0) + (b.categoria_match ? 1 : 0) + (b.departamento_match ? 1 : 0);
    if (sa !== sb) return sb - sa;
    return (b.prioridade || 0) - (a.prioridade || 0);
  });
  const vencedora = candidatas[0];
  return { pct: Number(vencedora.comissao_pct || 0), regra: vencedora };
}

export async function carregarPessoasBonusMap(conta: Conta): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('comissao_pessoas')
    .select('nome,bonificacao_pct')
    .eq('conta_omie', conta)
    .eq('ativo', true);
  if (error) { console.log('carregarPessoasBonusMap erro:', error.message); return {}; }
  const map: Record<string, number> = {};
  (data || []).forEach((p: { nome: string; bonificacao_pct: unknown }) => { map[p.nome] = Number(p.bonificacao_pct || 0); });
  return map;
}

export async function carregarComissaoBase(conta: Conta): Promise<number> {
  const { data, error } = await supabase
    .from('comissao_config')
    .select('comissao_base_pct_servicos')
    .eq('conta_omie', conta)
    .maybeSingle();
  if (error || !data) return 15;
  return Number(data.comissao_base_pct_servicos || 15);
}

// ============================================================================
// Config
// ============================================================================

export async function getConfig(conta: Conta): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('comissao_config')
    .select('*')
    .eq('conta_omie', conta)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || { conta_omie: conta, comissao_base_pct_servicos: 15 };
}

export async function setConfig(conta: Conta, comissao_base_pct_servicos: unknown): Promise<void> {
  const row: Record<string, unknown> = { conta_omie: conta };
  if (comissao_base_pct_servicos !== undefined) row.comissao_base_pct_servicos = Number(comissao_base_pct_servicos);
  const { error } = await supabase
    .from('comissao_config')
    .upsert(row, { onConflict: 'conta_omie' });
  if (error) throw new Error(error.message);
}

// ============================================================================
// Pessoas
// ============================================================================

export async function listarPessoas(conta: Conta, tipo?: string | null): Promise<unknown[]> {
  let q = supabase.from('comissao_pessoas').select('*').eq('conta_omie', conta);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q.order('tipo').order('nome');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function criarPessoa(
  conta: Conta,
  b: { nome?: string; tipo?: string; bonificacao_pct?: unknown; ativo?: boolean },
): Promise<{ id: number; pessoa: Record<string, unknown> }> {
  if (!b.nome || !b.tipo) throw new Error('nome e tipo obrigatorios');
  const row = {
    nome: b.nome,
    tipo: b.tipo,
    bonificacao_pct: Number(b.bonificacao_pct || 0),
    ativo: b.ativo !== false,
    conta_omie: conta,
  };
  const { data, error } = await supabase
    .from('comissao_pessoas')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as number, pessoa: data };
}

export async function atualizarPessoa(
  conta: Conta,
  id: number,
  body: Record<string, unknown>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  (['nome', 'tipo', 'ativo'] as const).forEach((k) => { if (body[k] !== undefined) update[k] = body[k]; });
  if (body.bonificacao_pct !== undefined) update.bonificacao_pct = Number(body.bonificacao_pct);

  // Se mudou bonificacao, grava snapshot historico
  if (body.bonificacao_pct !== undefined) {
    const { data: atual } = await supabase
      .from('comissao_pessoas')
      .select('nome,bonificacao_pct')
      .eq('id', id)
      .eq('conta_omie', conta)
      .maybeSingle();
    if (atual && Number(atual.bonificacao_pct) !== Number(body.bonificacao_pct)) {
      const hoje = new Date();
      await supabase.from('comissao_bonus_historico').upsert({
        nome: atual.nome,
        mes: hoje.getMonth() + 1,
        ano: hoje.getFullYear(),
        bonificacao_pct: Number(body.bonificacao_pct),
        conta_omie: conta,
      }, { onConflict: 'nome,mes,ano,conta_omie' });
    }
  }

  const { error } = await supabase
    .from('comissao_pessoas')
    .update(update)
    .eq('id', id)
    .eq('conta_omie', conta);
  if (error) throw new Error(error.message);
}

export async function excluirPessoa(conta: Conta, id: number): Promise<void> {
  const { error } = await supabase
    .from('comissao_pessoas')
    .delete()
    .eq('id', id)
    .eq('conta_omie', conta);
  if (error) throw new Error(error.message);
}

// ============================================================================
// Regras
// ============================================================================

export async function listarRegras(conta: Conta, dominio?: string | null): Promise<unknown[]> {
  let q = supabase.from('comissao_regras').select('*').eq('conta_omie', conta);
  if (dominio) q = q.eq('dominio', dominio);
  const { data, error } = await q.order('prioridade', { ascending: false }).order('id');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function criarRegra(
  conta: Conta,
  b: Record<string, unknown>,
): Promise<{ id: number; regra: Record<string, unknown> }> {
  if (!b.dominio || b.comissao_pct === undefined) throw new Error('dominio e comissao_pct obrigatorios');
  const row = {
    dominio: b.dominio,
    categoria_match:    b.categoria_match    || null,
    familia_match:      b.familia_match      || null,
    departamento_match: b.departamento_match || null,
    comissao_pct: Number(b.comissao_pct),
    prioridade:   Number(b.prioridade || 0),
    ativo:        b.ativo !== false,
    conta_omie:   conta,
  };
  const { data, error } = await supabase
    .from('comissao_regras')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as number, regra: data };
}

export async function atualizarRegra(conta: Conta, id: number, b: Record<string, unknown>): Promise<void> {
  const update: Record<string, unknown> = {};
  (['dominio', 'categoria_match', 'familia_match', 'departamento_match', 'ativo'] as const).forEach((k) => {
    if (b[k] !== undefined) update[k] = b[k] || null;
  });
  if (b.comissao_pct !== undefined) update.comissao_pct = Number(b.comissao_pct);
  if (b.prioridade   !== undefined) update.prioridade   = Number(b.prioridade);
  const { error } = await supabase
    .from('comissao_regras')
    .update(update)
    .eq('id', id)
    .eq('conta_omie', conta);
  if (error) throw new Error(error.message);
}

export async function excluirRegra(conta: Conta, id: number): Promise<void> {
  const { error } = await supabase
    .from('comissao_regras')
    .delete()
    .eq('id', id)
    .eq('conta_omie', conta);
  if (error) throw new Error(error.message);
}

// ============================================================================
// Serviços (comissão sobre OS)
// ============================================================================

interface AjusteServico {
  id: number;
  status?: string;
  valor_liquido?: number;
  valor_total?: number;
  valor_fundo?: number;
  [k: string]: unknown;
}

export async function listarServicos(
  conta: Conta,
  mes: number | null,
  ano: number | null,
  status: string,
): Promise<{ items: AjusteServico[]; totais: Record<string, number> }> {
  let q = supabase.from('comissao_ajustes_servicos').select('*').eq('conta_omie', conta);
  if (mes) q = q.eq('mes', mes);
  if (ano) q = q.eq('ano', ano);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q
    .order('data_emissao', { ascending: false })
    .order('os_numero')
    .order('os_item_seq');
  if (error) throw new Error(error.message);

  const items = (data || []) as AjusteServico[];
  const totais = {
    count: items.length,
    pendentes: items.filter((i) => i.status === 'pendente').length,
    ajustadas: items.filter((i) => i.status === 'ajustado').length,
    valor_liquido_total: items.reduce((s, i) => s + Number(i.valor_liquido || 0), 0),
    comissao_total:      items.reduce((s, i) => s + Number(i.valor_total  || 0), 0),
    fundo_total:         items.reduce((s, i) => s + Number(i.valor_fundo  || 0), 0),
  };
  return { items, totais };
}

export async function detalheServico(conta: Conta, numero: string): Promise<{ os_numero: string; itens: unknown[] }> {
  const { data, error } = await supabase
    .from('comissao_ajustes_servicos')
    .select('*')
    .eq('conta_omie', conta)
    .eq('os_numero', numero)
    .order('os_item_seq');
  if (error) throw new Error(error.message);
  return { os_numero: numero, itens: data || [] };
}

export async function ajustarServico(conta: Conta, b: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!b.os_numero) throw new Error('os_numero obrigatorio');
  const item_seq = Number(b.os_item_seq || 1);

  const { data: linha, error: errL } = await supabase
    .from('comissao_ajustes_servicos')
    .select('*')
    .eq('conta_omie', conta)
    .eq('os_numero', b.os_numero)
    .eq('os_item_seq', item_seq)
    .maybeSingle();
  if (errL) throw new Error(errL.message);
  if (!linha) throw new Error('OS nao encontrada. Rode sincronizar primeiro.');

  const df = Number(b.divisao_fundo_pct || 0);
  const dv1 = Number(b.divisao_v1_pct || 0);
  const dv2 = Number(b.divisao_v2_pct || 0);
  const soma = df + dv1 + dv2;
  if (Math.abs(soma - 100) > 0.01) {
    throw new Error('Soma das divisoes deve ser 100% (atual: ' + soma.toFixed(2) + '%)');
  }

  const pessoas_bonus_map = await carregarPessoasBonusMap(conta);
  const base_pct = await carregarComissaoBase(conta);
  const calc = calcularComissaoServico({
    valor_liquido: Number(linha.valor_liquido),
    vendedor_1: b.vendedor_1 as string | null,
    vendedor_2: b.vendedor_2 as string | null,
    divisao_fundo_pct: df,
    divisao_v1_pct: dv1,
    divisao_v2_pct: dv2,
    override_pct: b.comissao_override_pct as number | string | null,
    pessoas_bonus_map,
    base_pct,
  });

  const update = {
    vendedor_1: b.vendedor_1 || null,
    vendedor_2: b.vendedor_2 || null,
    divisao_fundo_pct: df,
    divisao_v1_pct: dv1,
    divisao_v2_pct: dv2,
    comissao_override_pct: (b.comissao_override_pct === '' || b.comissao_override_pct === null || b.comissao_override_pct === undefined) ? null : Number(b.comissao_override_pct),
    justificativa: b.justificativa || null,
    usuario: b.usuario || null,
    status: 'ajustado',
    comissao_final_pct: calc.comissao_final_pct,
    valor_total: calc.valor_total,
    valor_fundo: calc.valor_fundo,
    valor_v1: calc.valor_v1,
    valor_v2: calc.valor_v2,
  };
  const { data: atualizado, error } = await supabase
    .from('comissao_ajustes_servicos')
    .update(update)
    .eq('id', linha.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return atualizado;
}

interface OmieOS {
  Cabecalho?: Record<string, unknown>;
  InfoCadastro?: Record<string, unknown>;
  infoCadastro?: Record<string, unknown>;
  ServicosPrestados?: unknown;
  servicosPrestados?: unknown;
  servico_prestado?: unknown;
  [k: string]: unknown;
}

// Busca TODAS as OS da Omie (ListarOS paginado).
async function buscarTodasOS(conta: Conta): Promise<OmieOS[]> {
  const todas: OmieOS[] = [];
  let pag = 1;
  let totalPaginas = 1;
  while (pag <= totalPaginas) {
    const r = await omieRequest<{ faultstring?: string; total_de_paginas?: number; osCadastro?: OmieOS[] }>(
      '/servicos/os/',
      'ListarOS',
      { pagina: pag, registros_por_pagina: 500 },
      { conta },
    );
    if (r.faultstring) {
      console.log('buscarTodasOS FAULT pag ' + pag + ': ' + r.faultstring);
      break;
    }
    if (pag === 1) totalPaginas = r.total_de_paginas || 1;
    if (!r.osCadastro || r.osCadastro.length === 0) break;
    todas.push(...r.osCadastro);
    pag++;
    await sleep(500);
  }
  return todas;
}

// Sync OS do Omie para comissao_ajustes_servicos.
// NAO sobrescreve linhas com status='ajustado'.
export async function syncServicos(
  conta: Conta,
  mes: number,
  ano: number,
): Promise<{ ok: boolean; mes: number; ano: number; conta: Conta; inserted: number; skipped_ajustados: number; skipped_sem_itens: number }> {
  const todas = await buscarTodasOS(conta);
  const dtDe = new Date(ano, mes - 1, 1);
  const dtAte = new Date(ano, mes, 0, 23, 59, 59);

  let inserted = 0;
  let skipped_ajustados = 0;
  const skipped_sem_itens = 0;

  for (const os of todas) {
    const cab = os.Cabecalho || {};
    const info = os.InfoCadastro || os.infoCadastro || {};
    const cancelada = info.cCancelada || cab.cCancelada;
    if (cancelada === 'S') continue;

    const dataStr = String(info.dDtFat || info.dDtInc || cab.dDtPrevisao || '');
    const dtOS = parseDataBR(dataStr);
    if (dtOS < dtDe || dtOS > dtAte) continue;

    // Apenas etapa 60 (faturada) entra na comissao
    if (String(cab.cEtapa) !== '60') continue;

    const numero = String(cab.cNumOS || cab.cNumOs || ('OS_' + (cab.nCodOS || cab.nCodOs || info.nCodOS || '?')));
    const os_label = 'Ordem de Servico n ' + numero;

    // Extrai array de itens de servico (tenta varios nomes conhecidos)
    let itensRaw = os.ServicosPrestados || os.servicosPrestados || os.servico_prestado;
    if (itensRaw && !Array.isArray(itensRaw)) {
      const obj = itensRaw as Record<string, unknown>;
      if (obj.Servico) itensRaw = Array.isArray(obj.Servico) ? obj.Servico : [obj.Servico];
    }
    let itens = (Array.isArray(itensRaw) ? itensRaw : []) as Array<Record<string, unknown>>;
    if (itens.length === 0) {
      itens = [{ _fallback_header: true, nValTotal: cab.nValorTotal || 0 }];
    }

    for (let seq = 0; seq < itens.length; seq++) {
      const it = itens[seq] || {};
      const seqNum = seq + 1;

      const { data: existente } = await supabase
        .from('comissao_ajustes_servicos')
        .select('id,status')
        .eq('conta_omie', conta)
        .eq('os_numero', os_label)
        .eq('os_item_seq', seqNum)
        .maybeSingle();
      if (existente && existente.status === 'ajustado') {
        skipped_ajustados++;
        continue;
      }

      const quantidade = Number(it.nQtde || it.quantidade || 1);
      const valor_unit = Number(it.nValUnit || it.nValorUnitario || 0);
      const valor_total_item = Number(it.nValTotal || it.nValorServico || cab.nValorTotal || 0);
      const descricao = String(it.cDescServ || it.cDescricao || cab.cDescricaoServico || '');
      const codigo_serv = String(it.cCodServ || it.cCodigoServico || '');

      const dataISO = dtOS.toISOString().slice(0, 10);
      const row = {
        conta_omie: conta,
        os_numero: os_label,
        os_item_seq: seqNum,
        nfse_numero: info.cNumNFSE || info.cNumeroNFSE || null,
        data_emissao: dataISO,
        mes,
        ano,
        cliente: info.cRazao || info.cNome || cab.cNomeCliente || null,
        cnpj: info.cCNPJCPF || info.cCNPJ || null,
        projeto: info.cProjeto || null,
        departamento: info.cDepartamento || null,
        categoria: codigo_serv ? (codigo_serv + (descricao ? ' - ' + descricao.substring(0, 40) : '')) : null,
        descricao_servico: descricao,
        quantidade,
        valor_unitario: valor_unit,
        valor_liquido: valor_total_item,
        vendedor_original: info.cIncluidoPor || info.cUsuarioInclusao || null,
      };

      if (existente) {
        await supabase
          .from('comissao_ajustes_servicos')
          .update({
            nfse_numero: row.nfse_numero,
            data_emissao: row.data_emissao,
            mes: row.mes, ano: row.ano,
            cliente: row.cliente, cnpj: row.cnpj,
            projeto: row.projeto,
            departamento: row.departamento,
            categoria: row.categoria,
            descricao_servico: row.descricao_servico,
            quantidade: row.quantidade,
            valor_unitario: row.valor_unitario,
            valor_liquido: row.valor_liquido,
            vendedor_original: row.vendedor_original,
          })
          .eq('id', existente.id);
      } else {
        const { error: errIns } = await supabase
          .from('comissao_ajustes_servicos')
          .insert(row);
        if (errIns) {
          console.log('comissao sync insert erro OS=' + os_label + ': ' + errIns.message);
          continue;
        }
        inserted++;
      }
    }
  }

  return { ok: true, mes, ano, conta, inserted, skipped_ajustados, skipped_sem_itens };
}

// ============================================================================
// Vendas de Máquinas
// ============================================================================

interface VendaRow {
  id?: number;
  mes?: number;
  ano?: number;
  codigo_produto?: string;
  valor_total?: number;
  quantidade?: number;
  valor_unitario?: number;
  tipo?: string;
  familia?: string;
  data_pedido?: string;
  numero_pedido?: string;
  descricao?: string;
  codigo_cliente?: string;
  codigo_categoria?: string;
  cmc_unitario?: number;
  vendedor?: string;
  nome_cliente?: string;
  departamento?: string;
}

interface AjusteVenda {
  id: number;
  venda_id: string;
  comissao_override_pct?: number | null;
  custos_extras?: number;
  desconto?: number;
  status?: string;
  justificativa?: string | null;
}

function classificarGrupo(familia: unknown): string {
  if (!familia) return 'outros';
  const f = norm(String(familia));
  if (f.indexOf('peca') !== -1) return 'pecas';
  return 'maquinas';
}

export interface VendaComissaoItem {
  venda_id: string;
  vendas_itens_id: number | undefined;
  data_pedido: string | undefined;
  numero_pedido: string | undefined;
  vendedor: string | null;
  cliente: string | null;
  produto_descricao: string | undefined;
  familia: string | undefined;
  categoria: string | undefined;
  departamento: string | undefined;
  quantidade: number | undefined;
  valor_venda: number | null;
  cmc_total: number | null;
  margem_bruta_pct: number | null;
  comissao_pct: number | null;
  comissao_fonte: string;
  regra_id: number | null;
  custos_extras: number | null;
  desconto: number | null;
  valor_comissao: number | null;
  custo_total: number | null;
  venda_liquida: number | null;
  margem_loja: number | null;
  margem_loja_pct: number | null;
  status: string;
  ajuste_id: number | null;
  justificativa: string | null;
  grupo?: string;
}

export interface VendasResult {
  items: VendaComissaoItem[];
  totais: Record<string, number | null>;
  familias: string[];
}

export async function listarVendas(
  conta: Conta,
  mes: number,
  ano: number,
  filtros: { vendedor?: string | null; familia?: string | null; grupo?: string | null; comComissaoOnly?: boolean },
): Promise<VendasResult> {
  const { vendedor: vendedorFiltro, familia: familiaFiltro, grupo: grupoFiltro, comComissaoOnly } = filtros;

  // 1. Regras vigentes do dominio vendas_maquinas
  const { data: regrasData } = await supabase
    .from('comissao_regras')
    .select('*')
    .eq('conta_omie', conta)
    .eq('dominio', 'vendas_maquinas')
    .eq('ativo', true);
  const regras = (regrasData || []) as Regra[];

  // 2. Vendas do mes (paginado)
  let vendas: VendaRow[] = [];
  let offset = 0;
  while (true) {
    let qv = supabase
      .from('vendas_itens')
      .select('id,mes,ano,codigo_produto,valor_total,quantidade,valor_unitario,tipo,familia,data_pedido,numero_pedido,descricao,codigo_cliente,codigo_categoria,cmc_unitario,vendedor,nome_cliente,departamento,conta_omie')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('conta_omie', conta);
    if (vendedorFiltro) qv = qv.eq('vendedor', vendedorFiltro);
    if (familiaFiltro)  qv = qv.eq('familia', familiaFiltro);
    const { data: chunk, error: errV } = await qv.range(offset, offset + 999);
    if (errV) throw new Error(errV.message);
    if (!chunk || chunk.length === 0) break;
    vendas = vendas.concat(chunk as VendaRow[]);
    if (chunk.length < 1000) break;
    offset += 1000;
  }

  // 2b. Enriquece nome_cliente faltante via Clientes_Omie
  const codsClienteFaltando = Array.from(new Set(
    vendas.filter((v) => !v.nome_cliente && v.codigo_cliente).map((v) => String(v.codigo_cliente)),
  ));
  const nomeClienteMap: Record<string, string | null> = {};
  for (let i = 0; i < codsClienteFaltando.length; i += 200) {
    const lote = codsClienteFaltando.slice(i, i + 200);
    const { data: cls } = await supabase.from('Clientes_Omie').select('id,nome').in('id', lote);
    if (cls) (cls as Array<{ id: unknown; nome?: string }>).forEach((cl) => { nomeClienteMap[String(cl.id)] = cl.nome || null; });
  }

  // 2c. Enriquece CMC faltante via cmc_historico do mes
  const codsProdSemCMC = Array.from(new Set(
    vendas.filter((v) => (!v.cmc_unitario || Number(v.cmc_unitario) === 0) && v.codigo_produto).map((v) => String(v.codigo_produto)),
  ));
  const cmcMap: Record<string, number> = {};
  for (let i = 0; i < codsProdSemCMC.length; i += 200) {
    const lote = codsProdSemCMC.slice(i, i + 200);
    const { data: cmcRows } = await supabase
      .from('cmc_historico')
      .select('id_produto,cmc')
      .eq('mes', mes).eq('ano', ano).eq('conta_omie', conta)
      .in('id_produto', lote);
    if (cmcRows) (cmcRows as Array<{ id_produto: unknown; cmc: unknown }>).forEach((r) => { cmcMap[String(r.id_produto)] = parseFloat(String(r.cmc)) || 0; });
  }

  // 3. Ajustes existentes pro mes (overlay)
  const { data: ajustesData } = await supabase
    .from('comissao_ajustes_vendas')
    .select('*')
    .eq('conta_omie', conta)
    .eq('mes', mes)
    .eq('ano', ano);
  const ajustesMap: Record<string, AjusteVenda> = {};
  (ajustesData || []).forEach((a: AjusteVenda) => { ajustesMap[a.venda_id] = a; });

  // 4. Monta resposta
  let itens: VendaComissaoItem[] = vendas.map((v) => {
    const venda_id = (v.numero_pedido || '') + '|' + (v.codigo_produto || '') + '|' + (v.id || '');
    const ctx: RegraCtx = {
      categoria: v.codigo_categoria || null,
      familia: v.familia || null,
      departamento: v.departamento || null,
    };
    const { pct: regra_pct, regra } = resolverRegraComissao(regras, ctx);
    const ajuste = ajustesMap[venda_id];

    const cmc_unit_efetivo = Number(v.cmc_unitario || 0) > 0
      ? Number(v.cmc_unitario)
      : Number(cmcMap[String(v.codigo_produto)] || 0);
    const cmc_total = cmc_unit_efetivo * Number(v.quantidade || 0);

    const valor_venda = Number(v.valor_total || 0);
    const custos_extras = ajuste ? Number(ajuste.custos_extras || 0) : 0;
    const desconto = ajuste ? Number(ajuste.desconto || 0) : 0;

    const comissao_pct = ajuste && ajuste.comissao_override_pct != null
      ? Number(ajuste.comissao_override_pct)
      : regra_pct;

    const valor_comissao = valor_venda * comissao_pct / 100;
    const custo_total = cmc_total + custos_extras + desconto;
    const venda_liquida = valor_venda - valor_comissao;
    const margem_loja = venda_liquida - custo_total;
    const margem_loja_pct = venda_liquida > 0 ? (cmc_total / venda_liquida) : 0;
    const margem_bruta_pct = valor_venda > 0 ? ((valor_venda - cmc_total) / valor_venda) : 0;

    const cliente_nome = v.nome_cliente
      || nomeClienteMap[String(v.codigo_cliente || '')]
      || v.codigo_cliente
      || null;

    return {
      venda_id,
      vendas_itens_id: v.id,
      data_pedido: v.data_pedido,
      numero_pedido: v.numero_pedido,
      vendedor: v.vendedor || null,
      cliente: cliente_nome,
      produto_descricao: v.descricao,
      familia: v.familia,
      categoria: v.codigo_categoria,
      departamento: v.departamento,
      quantidade: v.quantidade,
      valor_venda: round2(valor_venda),
      cmc_total: round2(cmc_total),
      margem_bruta_pct: round2(margem_bruta_pct * 100),
      comissao_pct: round2(comissao_pct),
      comissao_fonte: ajuste && ajuste.comissao_override_pct != null ? 'override' : (regra ? 'regra' : 'sem_regra'),
      regra_id: regra ? regra.id : null,
      custos_extras: round2(custos_extras),
      desconto: round2(desconto),
      valor_comissao: round2(valor_comissao),
      custo_total: round2(custo_total),
      venda_liquida: round2(venda_liquida),
      margem_loja: round2(margem_loja),
      margem_loja_pct: round2(margem_loja_pct * 100),
      status: ajuste ? (ajuste.status || 'pendente') : 'pendente',
      ajuste_id: ajuste ? ajuste.id : null,
      justificativa: ajuste ? ajuste.justificativa ?? null : null,
    };
  });

  // 5. Classifica grupo e calcula familias distintas (antes dos filtros)
  itens.forEach((i) => { i.grupo = classificarGrupo(i.familia); });

  const familiasDistintas = Array.from(new Set(
    itens.map((i) => i.familia || '(sem familia)'),
  )).sort();

  if (grupoFiltro === 'maquinas' || grupoFiltro === 'pecas') {
    itens = itens.filter((i) => i.grupo === grupoFiltro);
  }
  if (comComissaoOnly) {
    itens = itens.filter((i) => i.comissao_pct && i.comissao_pct > 0);
  }

  const totais = {
    count: itens.length,
    valor_venda_total: round2(itens.reduce((s, i) => s + (i.valor_venda || 0), 0)),
    comissao_total:    round2(itens.reduce((s, i) => s + (i.valor_comissao || 0), 0)),
    margem_loja_total: round2(itens.reduce((s, i) => s + (i.margem_loja || 0), 0)),
    cmc_total:         round2(itens.reduce((s, i) => s + (i.cmc_total || 0), 0)),
  };

  return { items: itens, totais, familias: familiasDistintas };
}

export async function ajustarVenda(conta: Conta, b: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!b.venda_id) throw new Error('venda_id obrigatorio');
  const vendas_itens_id = b.vendas_itens_id ? Number(b.vendas_itens_id) : null;
  if (!vendas_itens_id) throw new Error('vendas_itens_id obrigatorio');

  const { data: v, error: errV } = await supabase
    .from('vendas_itens')
    .select('*')
    .eq('id', vendas_itens_id)
    .eq('conta_omie', conta)
    .maybeSingle();
  if (errV) throw new Error(errV.message);
  if (!v) throw new Error('Venda nao encontrada');

  const { data: regrasData } = await supabase
    .from('comissao_regras')
    .select('*')
    .eq('conta_omie', conta)
    .eq('dominio', 'vendas_maquinas')
    .eq('ativo', true);
  const { pct: regra_pct } = resolverRegraComissao((regrasData || []) as Regra[], {
    categoria: v.codigo_categoria,
    familia: v.familia,
    departamento: v.departamento,
  });

  const override = (b.comissao_override_pct === '' || b.comissao_override_pct === null || b.comissao_override_pct === undefined)
    ? null
    : Number(b.comissao_override_pct);
  const comissao_pct = override != null ? override : regra_pct;

  const cmc_total = Number(v.cmc_unitario || 0) * Number(v.quantidade || 0);
  const valor_venda = Number(v.valor_total || 0);
  const custos_extras = Number(b.custos_extras || 0);
  const desconto = Number(b.desconto || 0);

  const valor_comissao = valor_venda * comissao_pct / 100;
  const custo_total = cmc_total + custos_extras + desconto;
  const venda_liquida = valor_venda - valor_comissao;
  const margem_loja = venda_liquida - custo_total;
  const margem_loja_pct = venda_liquida > 0 ? (cmc_total / venda_liquida) : 0;
  const margem_bruta_pct = valor_venda > 0 ? ((valor_venda - cmc_total) / valor_venda) : 0;

  const dataVenda = v.data_pedido && String(v.data_pedido).length >= 10
    ? (() => {
        const p = String(v.data_pedido).split('/');
        return p.length === 3 ? (p[2] + '-' + p[1] + '-' + p[0]) : null;
      })()
    : null;

  const row = {
    conta_omie: conta,
    venda_id: b.venda_id,
    data_venda: dataVenda,
    mes: v.mes,
    ano: v.ano,
    cliente: v.nome_cliente || v.codigo_cliente || null,
    vendedor: v.vendedor || null,
    familia: v.familia || null,
    categoria: v.codigo_categoria || null,
    departamento: v.departamento || null,
    produto_descricao: v.descricao || null,
    cmc_total: round2(cmc_total),
    valor_venda: round2(valor_venda),
    margem_bruta_pct: round2(margem_bruta_pct * 100),
    custos_extras: round2(custos_extras),
    custos_extras_desc: b.custos_extras_desc || null,
    desconto: round2(desconto),
    desconto_desc: b.desconto_desc || null,
    comissao_override_pct: override,
    justificativa: b.justificativa || null,
    comissao_pct: round2(comissao_pct),
    valor_comissao: round2(valor_comissao),
    custo_total: round2(custo_total),
    venda_liquida: round2(venda_liquida),
    margem_loja: round2(margem_loja),
    margem_loja_pct: round2(margem_loja_pct * 100),
    status: 'ajustado',
    usuario: b.usuario || null,
  };

  const { data: saved, error } = await supabase
    .from('comissao_ajustes_vendas')
    .upsert(row, { onConflict: 'conta_omie,venda_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return saved;
}

// ============================================================================
// Custos mensais por vendedor
// ============================================================================

interface CustoRow {
  nome: string;
  salario?: number;
  encargos?: number;
  custos_extras?: number;
  carro_aluguel?: number;
  combustivel?: number;
  manutencao?: number;
}

export async function listarCustosVendedor(
  conta: Conta,
  mes: number,
  ano: number,
): Promise<{ items: Record<string, unknown>[]; totais: Record<string, number | null> }> {
  const { data: custos, error: errC } = await supabase
    .from('comissao_custos_vendedor')
    .select('*')
    .eq('conta_omie', conta).eq('mes', mes).eq('ano', ano);
  if (errC) throw new Error(errC.message);

  const { data: pessoas } = await supabase
    .from('comissao_pessoas')
    .select('nome,tipo,ativo')
    .eq('conta_omie', conta)
    .eq('ativo', true)
    .in('tipo', ['vendedor', 'motorista', 'tecnico', 'todos'])
    .order('tipo').order('nome');

  const custosMap: Record<string, CustoRow> = {};
  (custos || []).forEach((x: CustoRow) => { custosMap[x.nome] = x; });

  const items = ((pessoas || []) as Array<{ nome: string; tipo: string }>).map((p) => {
    const c0 = custosMap[p.nome] || ({} as CustoRow);
    const sal  = Number(c0.salario || 0);
    const enc  = Number(c0.encargos || 0);
    const ext  = Number(c0.custos_extras || 0);
    const car  = Number(c0.carro_aluguel || 0);
    const comb = Number(c0.combustivel || 0);
    const man  = Number(c0.manutencao || 0);
    const total_carro = car + comb + man;
    const total_custo = sal + enc + ext + total_carro;
    return {
      nome: p.nome,
      tipo: p.tipo,
      salario: sal,
      encargos: enc,
      custos_extras: ext,
      carro_aluguel: car,
      combustivel: comb,
      manutencao: man,
      total_carro: round2(total_carro),
      total_custo: round2(total_custo),
      existe: !!custosMap[p.nome],
    };
  });

  const totais = {
    salario:       round2(items.reduce((s, i) => s + i.salario, 0)),
    encargos:      round2(items.reduce((s, i) => s + i.encargos, 0)),
    custos_extras: round2(items.reduce((s, i) => s + i.custos_extras, 0)),
    carro_aluguel: round2(items.reduce((s, i) => s + i.carro_aluguel, 0)),
    combustivel:   round2(items.reduce((s, i) => s + i.combustivel, 0)),
    manutencao:    round2(items.reduce((s, i) => s + i.manutencao, 0)),
    total_carro:   round2(items.reduce((s, i) => s + (i.total_carro || 0), 0)),
    total_custo:   round2(items.reduce((s, i) => s + (i.total_custo || 0), 0)),
  };

  return { items, totais };
}

export async function salvarCustoVendedor(conta: Conta, b: Record<string, unknown>): Promise<void> {
  if (!b.nome || !b.mes || !b.ano) throw new Error('nome, mes e ano obrigatorios');
  const row = {
    nome: b.nome,
    mes: Number(b.mes),
    ano: Number(b.ano),
    conta_omie: conta,
    salario:       Number(b.salario       || 0),
    encargos:      Number(b.encargos      || 0),
    custos_extras: Number(b.custos_extras || 0),
    carro_aluguel: Number(b.carro_aluguel || 0),
    combustivel:   Number(b.combustivel   || 0),
    manutencao:    Number(b.manutencao    || 0),
  };
  const { error } = await supabase
    .from('comissao_custos_vendedor')
    .upsert(row, { onConflict: 'nome,mes,ano,conta_omie' });
  if (error) throw new Error(error.message);
}

export async function copiarCustosMesAnterior(
  conta: Conta,
  mes: number,
  ano: number,
): Promise<{ ok: boolean; copiadas: number; info?: string }> {
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const { data: srcRows } = await supabase
    .from('comissao_custos_vendedor')
    .select('*')
    .eq('conta_omie', conta).eq('mes', mesAnt).eq('ano', anoAnt);
  if (!srcRows || srcRows.length === 0) {
    return { ok: true, copiadas: 0, info: 'Mes anterior sem registros' };
  }
  const novos = (srcRows as CustoRow[]).map((r) => ({
    nome: r.nome, mes, ano, conta_omie: conta,
    salario: r.salario, encargos: r.encargos, custos_extras: r.custos_extras,
    carro_aluguel: r.carro_aluguel, combustivel: r.combustivel, manutencao: r.manutencao,
  }));
  const { error } = await supabase
    .from('comissao_custos_vendedor')
    .upsert(novos, { onConflict: 'nome,mes,ano,conta_omie' });
  if (error) throw new Error(error.message);
  return { ok: true, copiadas: novos.length };
}

// ============================================================================
// Relatório agregador
// ============================================================================

interface PorPessoa {
  vendedor: string;
  num_os: number;
  num_vendas: number;
  valor_total: number;
  comissao_total: number;
  dominios: string[];
}

export interface RelatorioResult {
  mes: number;
  ano: number;
  dominio: string;
  por_vendedor: Array<Record<string, unknown>>;
  totais: { comissao_total: number | null; valor_total: number | null; fundo_total: number | null; num_pessoas: number };
  itens: Array<Record<string, unknown>>;
}

export async function relatorio(
  conta: Conta,
  mes: number,
  ano: number,
  dominio: string,
  pessoa: string | null,
): Promise<RelatorioResult> {
  const por_pessoa: Record<string, PorPessoa> = {};
  function addPessoa(nome: string | null | undefined, n_os: number, valor: number, comissao: number, tipoDominio: string) {
    const nm = nome || '(sem vendedor)';
    if (!por_pessoa[nm]) por_pessoa[nm] = { vendedor: nm, num_os: 0, num_vendas: 0, valor_total: 0, comissao_total: 0, dominios: [] };
    const p = por_pessoa[nm];
    if (tipoDominio === 'servicos') p.num_os += n_os; else p.num_vendas += n_os;
    p.valor_total += valor;
    p.comissao_total += comissao;
    if (p.dominios.indexOf(tipoDominio) === -1) p.dominios.push(tipoDominio);
  }

  let total_fundo = 0;
  const itens_detalhe: Array<Record<string, unknown>> = [];

  // Servicos
  if (dominio === 'ambos' || dominio === 'servicos') {
    const { data } = await supabase.from('comissao_ajustes_servicos')
      .select('*')
      .eq('conta_omie', conta)
      .eq('mes', mes).eq('ano', ano)
      .eq('status', 'ajustado');
    (data || []).forEach((a: Record<string, unknown>) => {
      const vl = Number(a.valor_liquido || 0);
      if (a.vendedor_1) {
        const v1pct = Number(a.divisao_v1_pct || 0);
        const v1val = Number(a.valor_v1 || (vl * Number(a.comissao_final_pct || 0) / 100 * v1pct / 100));
        addPessoa(a.vendedor_1 as string, 1, vl * v1pct / 100, v1val, 'servicos');
      }
      if (a.vendedor_2) {
        const v2pct = Number(a.divisao_v2_pct || 0);
        const v2val = Number(a.valor_v2 || 0);
        addPessoa(a.vendedor_2 as string, 1, vl * v2pct / 100, v2val, 'servicos');
      }
      total_fundo += Number(a.valor_fundo || 0);
      if (!pessoa || a.vendedor_1 === pessoa || a.vendedor_2 === pessoa) {
        itens_detalhe.push({ dominio: 'servicos', ...a });
      }
    });
  }

  // Vendas
  if (dominio === 'ambos' || dominio === 'vendas') {
    const { data: regrasData } = await supabase
      .from('comissao_regras').select('*')
      .eq('conta_omie', conta).eq('dominio', 'vendas_maquinas').eq('ativo', true);
    const regras = (regrasData || []) as Regra[];

    const { data: vendas } = await supabase
      .from('vendas_itens')
      .select('id,valor_total,quantidade,cmc_unitario,familia,codigo_categoria,departamento,vendedor,nome_cliente,codigo_cliente,numero_pedido,codigo_produto,descricao,data_pedido')
      .eq('conta_omie', conta).eq('mes', mes).eq('ano', ano);

    const { data: ajustesData } = await supabase
      .from('comissao_ajustes_vendas').select('*')
      .eq('conta_omie', conta).eq('mes', mes).eq('ano', ano);
    const ajustesMap: Record<string, AjusteVenda> = {};
    (ajustesData || []).forEach((a: AjusteVenda) => { ajustesMap[a.venda_id] = a; });

    (vendas || []).forEach((v: VendaRow) => {
      const venda_id = (v.numero_pedido || '') + '|' + (v.codigo_produto || '') + '|' + (v.id || '');
      const { pct: regra_pct } = resolverRegraComissao(regras, {
        categoria: v.codigo_categoria, familia: v.familia, departamento: v.departamento,
      });
      const ajuste = ajustesMap[venda_id];
      const comissao_pct = ajuste && ajuste.comissao_override_pct != null ? Number(ajuste.comissao_override_pct) : regra_pct;
      const valor_venda = Number(v.valor_total || 0);
      const valor_comissao = valor_venda * comissao_pct / 100;
      if (comissao_pct > 0 && v.vendedor) {
        addPessoa(v.vendedor, 1, valor_venda, valor_comissao, 'vendas');
      }
      if (!pessoa || v.vendedor === pessoa) {
        itens_detalhe.push({
          dominio: 'vendas',
          data_pedido: v.data_pedido,
          numero_pedido: v.numero_pedido,
          vendedor: v.vendedor,
          cliente: v.nome_cliente || v.codigo_cliente,
          produto: v.descricao,
          familia: v.familia,
          valor_venda: round2(valor_venda),
          comissao_pct: round2(comissao_pct),
          valor_comissao: round2(valor_comissao),
        });
      }
    });
  }

  const por_vendedor = Object.values(por_pessoa)
    .map((p) => ({ ...p, valor_total: round2(p.valor_total), comissao_total: round2(p.comissao_total) }))
    .sort((a, b) => (b.comissao_total || 0) - (a.comissao_total || 0));

  const total_comissao = por_vendedor.reduce((s, p) => s + (p.comissao_total || 0), 0);
  const total_valor = por_vendedor.reduce((s, p) => s + (p.valor_total || 0), 0);

  return {
    mes, ano, dominio,
    por_vendedor,
    totais: {
      comissao_total: round2(total_comissao),
      valor_total: round2(total_valor),
      fundo_total: round2(total_fundo),
      num_pessoas: por_vendedor.length,
    },
    itens: pessoa ? itens_detalhe : [],
  };
}
