/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Movimentação de estoque de UM produto no período (tela /ajustes/movimentacao-produto).
//
// Fonte: MovimentoEstoque da Omie via obterMovimentosProduto (omie.ts) — traz
// data, origem, NF, operação, entrada/saída e saldos, mas NÃO traz o
// cliente/fornecedor. O nome é resolvido por CRUZAMENTO best-effort com as
// tabelas locais: vendas_itens (nº do pedido -> cliente), compras_itens/
// notas_entrada (NF -> fornecedor) e remessas (NF -> destinatário). Movimento
// sem par (ajustes internos etc.) fica sem nome.
// ============================================================================

import { randomBytes } from 'crypto';
import type { Conta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { obterMovimentosProduto } from './omie';
import { buscarVendasLista } from '../estoque/produtos';

// ---- Autocomplete de produto (tabela produtos; conta_omie MINÚSCULA) ----

export interface ProdutoSugestao {
  codigoProduto: number;      // id Omie (id_prod do MovimentoEstoque)
  codigo: string;             // SKU
  descricao: string;
  estoque: number | null;
}

export async function buscarProdutosAutocomplete(conta: Conta, termo: string): Promise<ProdutoSugestao[]> {
  const t = (termo || '').trim();
  if (t.length < 2) return [];
  // % e vírgula quebram o filtro .or() do PostgREST — remove.
  const seguro = t.replace(/[%,()]/g, ' ').trim();
  if (!seguro) return [];

  const consulta = async (padrao: string) => {
    const { data, error } = await supabase
      .from('produtos')
      .select('codigo_produto,codigo,descricao,estoque')
      .eq('conta_omie', conta.toLowerCase())
      .or(`codigo.ilike.%${padrao}%,descricao.ilike.%${padrao}%`)
      .order('descricao')
      .limit(20);
    if (error) throw new Error('busca de produto: ' + error.message);
    return data || [];
  };

  let lista = await consulta(seguro);

  // Fallback p/ caracteres visualmente ambíguos nos códigos (1↔I↔l, 0↔O):
  // "RP-100012285P04" não acha "RP-I00012285P04". Sem resultado exato, refaz
  // com `_` (curinga de 1 char do ilike) nessas posições.
  if (lista.length === 0) {
    const fuzzy = seguro.replace(/[10IlLoO]/g, '_');
    if (fuzzy !== seguro && fuzzy.replace(/_/g, '').length >= 2) {
      lista = await consulta(fuzzy);
    }
  }

  return lista.map((p: any) => ({
    codigoProduto: Number(p.codigo_produto),
    codigo: String(p.codigo || ''),
    descricao: String(p.descricao || ''),
    estoque: p.estoque != null ? Number(p.estoque) : null,
  }));
}

// ---- Movimentação com cruzamento ----

export interface MovimentoProduto {
  data: string | null;            // DD/MM/YYYY
  codOrigem: string;              // VEN, COM, AJU, REM...
  origem: string | null;          // "Venda de Produto", "Compra de Produto"...
  clienteFornecedor: string | null;
  numDoc: string | null;          // NF
  idDoc: number | null;           // nCodNF do documento (p/ DANFE)
  operacao: string | null;        // numPedido ("Operação nº ...")
  qtdeEntrada: number | null;
  entradaCMC: number | null;
  qtdeSaida: number | null;
  valorVendaUnit: number | null;  // preço unitário do pedido de venda (só vendas)
  valorVendaTotal: number | null; // total vendido no movimento (só vendas)
  cancelado: boolean;
  devolucao: boolean;
  qtdeAnterior: number | null;
  qtdeAtual: number | null;       // saldo após o movimento (kardex)
  cmcAnterior: number | null;
  cmcAtual: number | null;
}

export interface ResumoMovimentacao {
  saldoAnterior: number | null;
  custoInicial: number | null;    // CMC unitário no início do período
  totalEntradas: number;
  totalSaidas: number;
  saldoFinal: number | null;
  custoFinal: number | null;      // CMC unitário no fim do período
  movimentos: number;             // não-cancelados
  cancelados: number;
}

export interface MovimentacaoPayload {
  conta: Conta;
  produto: { codigoProduto: number; codigo: string | null; descricao: string | null };
  dataDeBR: string;
  dataAteBR: string;
  movimentos: MovimentoProduto[];
  resumo: ResumoMovimentacao;
  geradoEm: string;
  duracaoMs: number;
  fonte?: 'cache' | 'live';
}

// "000051072" / "Operação nº 000000000006428" -> "51072" / "6428" (só dígitos, sem zeros à esquerda)
function chaveNum(v: unknown): string {
  const dig = String(v ?? '').replace(/\D+/g, '').replace(/^0+/, '');
  return dig;
}

// Strings da Omie chegam com UTF-8 duplo-encodado ("OperaÃ§Ã£o nÂº") — decodifica.
function fixUtf8(s: string | null): string | null {
  if (!s || !/[ÃÂ]/.test(s)) return s;
  try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; }
}

// Fornecedor por NF de entrada: notas_entrada.emitente às vezes só tem
// nCodEmp/cnpj_cpf (sem nome) — resolve o nome via Clientes_Omie pelo CNPJ.
async function resolverFornecedoresPorNF(conta: Conta, nfs: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (nfs.length === 0) return map;
  const { data } = await supabase
    .from('notas_entrada').select('numero_nf,emitente')
    .eq('conta_omie', conta).in('numero_nf', nfs);
  const semNome: { nf: string; cnpj: string }[] = [];
  for (const row of (data || []) as any[]) {
    const e = row.emitente || {};
    const nome = e.nome_fantasia || e.razao_social || '';
    const k = chaveNum(row.numero_nf);
    if (!k) continue;
    if (nome) map[k] = nome;
    else if (e.cnpj_cpf) semNome.push({ nf: k, cnpj: String(e.cnpj_cpf) });
  }
  if (semNome.length > 0) {
    const cnpjs = [...new Set(semNome.map((x) => x.cnpj))];
    const { data: clientes } = await supabase
      .from('Clientes_Omie').select('nome,"cpf/cnpj"').in('"cpf/cnpj"', cnpjs);
    const porCnpj: Record<string, string> = {};
    for (const c of (clientes || []) as any[]) {
      const doc = c['cpf/cnpj'];
      if (doc && c.nome) porCnpj[String(doc)] = c.nome;
    }
    for (const x of semNome) {
      if (porCnpj[x.cnpj]) map[x.nf] = porCnpj[x.cnpj];
    }
  }
  return map;
}

// Origens de venda / compra-recebimento / remessa (prefixos observados na Omie).
const ORIG_VENDA = new Set(['VEN', 'NFV', 'NFS', 'VND', 'RSD']);
const ORIG_COMPRA = new Set(['COM', 'NFC', 'RRE', 'RDE', 'RDV']);
const ORIG_REMESSA = new Set(['REM']);

export async function obterMovimentacaoProduto(
  conta: Conta,
  idProd: number,
  dataDeBR: string,
  dataAteBR: string,
  force = false,
): Promise<MovimentacaoPayload> {
  const chave = `movprod:${conta}:${idProd}:${dataDeBR}:${dataAteBR}`;
  if (!force) {
    const hit = cache.get<MovimentacaoPayload>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache' };
  }
  const t0 = Date.now();

  const [movs, vendas, prodRow, remessasRows] = await Promise.all([
    obterMovimentosProduto(conta, idProd, dataDeBR, dataAteBR),
    buscarVendasLista(idProd, conta, 200).catch(() => []),
    supabase.from('produtos').select('codigo,descricao')
      .eq('conta_omie', conta.toLowerCase()).eq('codigo_produto', String(idProd))
      .limit(1).then((r) => (r.data || [])[0] || null),
    supabase.from('remessas').select('numero_nfe,destinatario')
      .eq('conta_omie', conta.toLowerCase())
      .range(0, 4999)
      .then((r) => r.data || []),
  ]);

  // Fornecedores: só das NFs de compra que aparecem nos movimentos (query dirigida).
  const nfsCompra = [...new Set(
    movs.filter((m: any) => ORIG_COMPRA.has(String(m.codOrigem || ''))).map((m: any) => String(m.numDoc || '')).filter(Boolean),
  )] as string[];
  const fornecedorPorNF = await resolverFornecedoresPorNF(conta, nfsCompra).catch(() => ({} as Record<string, string>));

  // Índices de cruzamento (chave numérica normalizada -> venda/nome)
  interface VendaRef { cliente: string | null; vu: number; vt: number }
  const vendaPorPedido: Record<string, VendaRef> = {};
  const vendaPorDataQtde: Record<string, VendaRef> = {};
  for (const v of vendas) {
    const ref: VendaRef = { cliente: v.cliente || null, vu: v.vu, vt: v.vt };
    const k = chaveNum(v.numero);
    if (k) vendaPorPedido[k] = ref;
    if (v.data) vendaPorDataQtde[`${v.data}|${Math.abs(v.qtd)}`] = ref; // fallback qdo nº não casa
  }
  const destinatarioPorNF: Record<string, string> = {};
  for (const r of remessasRows as any[]) {
    const k = chaveNum(r.numero_nfe);
    if (k && r.destinatario) destinatarioPorNF[k] = r.destinatario;
  }

  const movimentos: MovimentoProduto[] = movs.map((m: any) => {
    const cod = String(m.codOrigem || '');
    let nome: string | null = null;
    let venda: VendaRef | null = null;
    if (ORIG_VENDA.has(cod)) {
      venda = vendaPorPedido[chaveNum(m.numPedido)]
        || vendaPorPedido[chaveNum(m.numDoc)]
        || vendaPorDataQtde[`${m.data}|${Math.abs(m.qtdeSaida || m.qtdeEntrada || 0)}`]
        || null;
      nome = venda?.cliente || null;
    } else if (ORIG_COMPRA.has(cod)) {
      nome = fornecedorPorNF[chaveNum(m.numDoc)] || null;
    } else if (ORIG_REMESSA.has(cod)) {
      nome = destinatarioPorNF[chaveNum(m.numDoc)] || null;
    }
    const qtdeMov = Math.abs(m.qtdeSaida || m.qtdeEntrada || 0);
    return {
      data: m.data,
      codOrigem: cod,
      origem: fixUtf8(m.desOrigem || null),
      clienteFornecedor: nome,
      numDoc: m.numDoc || null,
      idDoc: m.idDoc != null ? Number(m.idDoc) : null,
      operacao: fixUtf8(m.numPedido || null),
      qtdeEntrada: m.qtdeEntrada ?? null,
      entradaCMC: m.entradaCMC ?? null,
      qtdeSaida: m.qtdeSaida ?? null,
      valorVendaUnit: venda ? venda.vu : null,
      valorVendaTotal: venda ? (venda.vt || (venda.vu ? venda.vu * qtdeMov : 0)) || null : null,
      cancelado: !!m.cancelado,
      devolucao: !!m.devolucao,
      qtdeAnterior: m.qtdeAnterior ?? null,
      qtdeAtual: m.qtdeAtual ?? null,
      cmcAnterior: m.cmcAnterior ?? null,
      cmcAtual: m.cmcAtual ?? null,
    };
  });

  // Resumo sobre os NÃO-cancelados (cancelado não movimenta estoque).
  const validos = movimentos.filter((m) => !m.cancelado);
  const primeiro = validos[0] || null;
  const ultimo = validos[validos.length - 1] || null;
  const resumo: ResumoMovimentacao = {
    saldoAnterior: primeiro ? (primeiro.qtdeAnterior ?? null) : null,
    custoInicial: primeiro ? (primeiro.cmcAnterior ?? null) : null,
    totalEntradas: validos.reduce((s, m) => s + Math.abs(m.qtdeEntrada || 0), 0),
    totalSaidas: validos.reduce((s, m) => s + Math.abs(m.qtdeSaida || 0), 0),
    saldoFinal: ultimo ? (ultimo.qtdeAtual ?? null) : null,
    custoFinal: ultimo ? (ultimo.cmcAtual ?? null) : null,
    movimentos: validos.length,
    cancelados: movimentos.length - validos.length,
  };

  const payload: MovimentacaoPayload = {
    conta,
    produto: {
      codigoProduto: idProd,
      codigo: (prodRow as any)?.codigo ?? null,
      descricao: (prodRow as any)?.descricao ?? null,
    },
    dataDeBR, dataAteBR,
    movimentos, resumo,
    geradoEm: new Date().toISOString(),
    duracaoMs: Date.now() - t0,
  };
  cache.set(chave, payload, 120); // 2min: alivia F5 sem esconder movimento novo por muito tempo
  return { ...payload, fonte: 'live' };
}

// ============================================================================
// Snapshots compartilháveis (tabela movimentacao_snapshots — sql/movimentacao-
// snapshots.sql). Congela o payload da consulta sob um hash não-adivinhável;
// quem abre o link lê 1 linha em vez de repetir a varredura no Omie.
// ============================================================================

const SNAPSHOT_DIAS = 30;

export interface SnapshotInfo {
  hash: string;
  criadoPor: string | null;
  criadoEm: string;
  expiraEm: string;
  payload: MovimentacaoPayload;
}

export async function criarSnapshotMovimentacao(
  conta: Conta,
  idProd: number,
  dataDeBR: string,
  dataAteBR: string,
  criadoPor?: string | null,
): Promise<{ hash: string; expiraEm: string }> {
  const payload = await obterMovimentacaoProduto(conta, idProd, dataDeBR, dataAteBR);
  const hash = randomBytes(9).toString('base64url'); // 12 chars

  // limpeza lazy dos expirados (dispensa cron)
  try { await supabase.from('movimentacao_snapshots').delete().lt('expira_em', new Date().toISOString()); } catch { /* best-effort */ }

  const expiraEm = new Date(Date.now() + SNAPSHOT_DIAS * 86400000).toISOString();
  const { error } = await supabase.from('movimentacao_snapshots').insert({
    hash,
    conta_omie: conta,
    id_prod: idProd,
    payload,
    criado_por: criadoPor || null,
    expira_em: expiraEm,
  });
  if (error) {
    throw new Error(`falha ao gravar snapshot (tabela movimentacao_snapshots existe? rodar sql/movimentacao-snapshots.sql): ${error.message}`);
  }
  return { hash, expiraEm };
}

export async function lerSnapshotMovimentacao(hash: string): Promise<SnapshotInfo | { expirado: true } | null> {
  const h = (hash || '').trim();
  if (!h || h.length > 40) return null;
  const { data, error } = await supabase
    .from('movimentacao_snapshots')
    .select('hash,payload,criado_por,criado_em,expira_em')
    .eq('hash', h)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expira_em).getTime() < Date.now()) return { expirado: true };
  return {
    hash: data.hash,
    criadoPor: data.criado_por || null,
    criadoEm: data.criado_em,
    expiraEm: data.expira_em,
    payload: data.payload as MovimentacaoPayload,
  };
}
