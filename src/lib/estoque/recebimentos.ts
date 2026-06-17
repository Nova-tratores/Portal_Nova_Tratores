// ============================================================================
// Recebimento de NF-e de Fornecedor (tela /estoque/recebimentos).
// Portado de server.js (monolito, região 7532-7815) + sync NOVO.
//
// A FONTE de leitura é a tabela `recebimentos_nfe` no mesmo Supabase. No
// monolito essa tabela era "mantida viva pelo Portal" — mas esse sync nunca
// existiu no monolito. AQUI ele passa a ser responsabilidade do Portal:
// `sincronizarRecebimentos` (ListarRecebimentos -> recebimentos_nfe), disparado
// pelo cron `/api/estoque/cron/sync-recebimentos`.
//
// IMPORTANTE: `conta_omie` em recebimentos_nfe / recebimento_meta /
// recebimento_usuarios é MINÚSCULO ('nova'/'castro'); a Conta do Portal é
// MAIÚSCULA ('NOVA'/'CASTRO'). Helpers contaLow/contaUp fazem a ponte. NÃO usar
// filtroConta() (que aplica .eq('conta_omie', 'NOVA')).
//
// PENDÊNCIAS (sinalizadas): (1) a migration recebimentos-migration.sql ainda não
// foi rodada no Supabase; (2) os nomes de campos da API Omie ListarRecebimentos
// são INCERTOS — o parsing é DEFENSIVO (helper pick() testa várias chaves);
// (3) Concluir/Reabrir ESCREVEM no Omie (ConcluirRecebimento / ReverterRecebimento).
// ============================================================================

import { supabase } from './supabase';
import { omieRequest } from './omie';
import { getContasOmie, type Conta, type ContaFiltro, CONTA_DEFAULT } from './conta';
import { sleep } from './utils';

export const URL_RECEBIMENTO = 'https://app.omie.com.br/api/v1/produtos/recebimentonfe/';
export const RECEB_TIPOS = ['almoxarifado', 'maquinas', 'pecas', 'pecas_garantia'] as const;
export type RecebTipo = (typeof RECEB_TIPOS)[number];

// conta_omie em recebimentos_nfe é MINÚSCULO; Conta do Portal é MAIÚSCULO.
function contaLow(c: string | null | undefined): string | null {
  return c ? String(c).toLowerCase() : null;
}
function contaUp(c: string | null | undefined): Conta {
  const u = String(c || '').toUpperCase();
  return u === 'CASTRO' ? 'CASTRO' : 'NOVA';
}
function soDigitos(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

// CFOPs típicos de garantia/remessa-conserto e palavras de almoxarifado/combustível
const RECEB_CFOP_GARANTIA = ['1949', '5949', '1916', '5916', '1411', '5411', '6411'];
const RECEB_KW_ALMOX = ['combust', 'almoxarif', 'lubrific', 'oleo', 'óleo', 'graxa', 'diesel', 'arla', 'uso e consumo', 'expediente'];

type Json = Record<string, unknown>;
type RecebRow = Json & {
  id_receb: number;
  conta_omie: string;
  chave_nfe?: string | null;
  numero_nfe?: string | null;
  serie_nfe?: string | null;
  emissao_nfe?: string | null;
  etapa?: string | null;
  status?: string | null;
  id_fornecedor?: number | string | null;
  fornecedor?: string | null;
  fornecedor_razao?: string | null;
  fornecedor_cnpj?: string | null;
  total_nfe?: number | null;
  maquinas?: unknown;
  qtd_maquinas?: number | null;
  produtos?: unknown;
  qtd_itens?: number | null;
};
interface RecebMeta {
  id_receb: number;
  conta_omie: string;
  tipo?: string | null;
  tipo_manual?: boolean | null;
  responsavel?: string | null;
  codigo_categoria?: string | null;
}

// pick() defensivo: retorna o primeiro valor não-nulo dentre várias chaves
// possíveis (a API ListarRecebimentos tem nomes incertos).
function pick<T = unknown>(obj: Json, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

// Itens de um recebimento (recebimentos_nfe separa maquinas e produtos)
export function itensReceb(row: RecebRow): Json[] {
  const m = Array.isArray(row.maquinas) ? (row.maquinas as Json[]) : [];
  const p = Array.isArray(row.produtos) ? (row.produtos as Json[]) : [];
  return m.concat(p);
}

// Classifica um recebimento em 1 dos 4 tipos. Heurística defensiva: na dúvida 'pecas'.
export function classificarReceb(row: RecebRow): RecebTipo {
  if ((row.qtd_maquinas || 0) > 0 || (Array.isArray(row.maquinas) && (row.maquinas as unknown[]).length > 0)) return 'maquinas';
  const itens = Array.isArray(row.produtos) ? (row.produtos as Json[]) : [];
  let garantia = false;
  let almox = false;
  for (const it of itens) {
    const cfop = soDigitos(pick(it, 'cCFOP', 'cfop'));
    const desc = String(pick(it, 'cDescricao') ?? '').toLowerCase();
    const fam = String(pick(it, 'familiaEstimada') ?? '').toLowerCase();
    if (RECEB_CFOP_GARANTIA.indexOf(cfop) >= 0 || desc.includes('garantia')) garantia = true;
    if (RECEB_KW_ALMOX.some((k) => desc.includes(k) || fam.includes(k))) almox = true;
  }
  if (garantia) return 'pecas_garantia';
  if (almox) return 'almoxarifado';
  return 'pecas';
}

// Ordena por data de emissão (emissao_nfe pode vir "aaaa-mm-dd" ou "dd/mm/aaaa")
function parseEmiss(s: unknown): number {
  if (!s) return 0;
  let str = String(s);
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes('-')) {
    const p = str.split('-');
    if (p[0].length === 4) return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
  }
  if (str.includes('/')) {
    const p = str.split('/');
    return new Date(+p[2], +p[1] - 1, +p[0]).getTime();
  }
  return 0;
}

export interface RecebItem {
  prod?: Json;
  [k: string]: unknown;
}
export interface RecebNormalizado {
  id: number;
  conta_omie: string;
  numero_nf: string;
  serie: string;
  ncod_nf: null;
  chave_nfe: string;
  data_emissao: string;
  nome_emitente: string;
  cnpj_emitente: string;
  valor_nf: number;
  etapa_nome: string;
  concluido: boolean;
  tipo: RecebTipo;
  responsavel: string | null;
  codigo_categoria: string | null;
  itens: Json[];
}

// Normaliza uma linha de recebimentos_nfe para o shape que o frontend espera.
export function normReceb(row: RecebRow, meta?: RecebMeta): RecebNormalizado {
  const tipoAuto = classificarReceb(row);
  const tipo: RecebTipo = meta && meta.tipo_manual && meta.tipo ? (meta.tipo as RecebTipo) : tipoAuto;
  return {
    id: row.id_receb,
    conta_omie: row.conta_omie,
    numero_nf: row.numero_nfe || '',
    serie: row.serie_nfe || '',
    ncod_nf: null,
    chave_nfe: row.chave_nfe || '',
    data_emissao: row.emissao_nfe || '',
    nome_emitente: row.fornecedor_razao || row.fornecedor || '',
    cnpj_emitente: row.fornecedor_cnpj || '',
    valor_nf: row.total_nfe || 0,
    etapa_nome: row.status || 'Etapa ' + (row.etapa || '?'),
    concluido: row.status === 'Recebida',
    tipo,
    responsavel: meta ? meta.responsavel || null : null,
    codigo_categoria: meta ? meta.codigo_categoria || null : null,
    itens: itensReceb(row),
  };
}

// Busca o meta (camada nossa) de um conjunto de id_receb. Retorna mapa "conta|id".
async function getMetaMap(ids: number[], low: string | null): Promise<Record<string, RecebMeta>> {
  const map: Record<string, RecebMeta> = {};
  if (!ids || ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += 300) {
    let mq = supabase
      .from('recebimento_meta')
      .select('id_receb,conta_omie,tipo,tipo_manual,responsavel,codigo_categoria')
      .in('id_receb', ids.slice(i, i + 300));
    if (low) mq = mq.eq('conta_omie', low);
    const { data } = await mq;
    (data || []).forEach((m) => {
      const meta = m as RecebMeta;
      map[meta.conta_omie + '|' + meta.id_receb] = meta;
    });
  }
  return map;
}

const RECEB_COLS =
  'id_receb,chave_nfe,numero_nfe,serie_nfe,emissao_nfe,etapa,status,id_fornecedor,fornecedor,fornecedor_razao,fornecedor_cnpj,total_nfe,maquinas,qtd_maquinas,produtos,qtd_itens,conta_omie';

// ===== Leitura: lista (lê de recebimentos_nfe, espelho do Omie) =====
// status: pendente = 'Faturada' (etapa 40); concluido = 'Recebida'. Cancelada oculta.
export interface ListarRecebFiltros {
  conta: ContaFiltro;
  status?: string;
  tipo?: string;
  responsavel?: string | null; // 'me' já resolvido para o nome/email no caller, ou '__nenhum__'
  pagina?: number;
  meu?: string; // identidade do usuário logado (nome/email) p/ filtro 'me'
}
export interface ListarRecebResult {
  recebimentos: RecebNormalizado[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  meuEmail: string;
  aviso: string | null;
  erro?: string;
}

export async function listarRecebimentos(f: ListarRecebFiltros): Promise<ListarRecebResult> {
  const low = contaLow(f.conta);
  const statusReq = f.status === 'concluido' ? 'concluido' : 'pendente';
  const tipoFiltro = f.tipo;
  const meu = f.meu || '';
  let responsavel = f.responsavel || undefined;
  if (responsavel === 'me') responsavel = meu;
  const pag = f.pagina && f.pagina > 0 ? f.pagina : 1;
  const porPagina = 50;

  let q = supabase.from('recebimentos_nfe').select(RECEB_COLS);
  if (low) q = q.eq('conta_omie', low);
  let aviso: string | null = null;
  if (statusReq === 'concluido') {
    q = q.eq('status', 'Recebida').order('id_receb', { ascending: false }).limit(1000);
    aviso = 'Mostrando ate 1000 concluidos mais recentes';
  } else {
    q = q.eq('status', 'Faturada').order('id_receb', { ascending: false }).limit(2000);
  }
  const { data: rows, error } = await q;
  if (error) return emptyResult(pag, porPagina, meu, { erro: error.message });

  const linhas = (rows || []) as RecebRow[];
  const ids = linhas.map((r) => r.id_receb);
  const metaMap = await getMetaMap(ids, low);

  let lista = linhas.map((r) => normReceb(r, metaMap[r.conta_omie + '|' + r.id_receb]));
  if (tipoFiltro && (RECEB_TIPOS as readonly string[]).indexOf(tipoFiltro) >= 0) lista = lista.filter((x) => x.tipo === tipoFiltro);
  if (responsavel === '__nenhum__') lista = lista.filter((x) => !x.responsavel);
  else if (responsavel) lista = lista.filter((x) => x.responsavel === responsavel);
  lista.sort((a, b) => parseEmiss(b.data_emissao) - parseEmiss(a.data_emissao));

  const total = lista.length;
  const slice = lista.slice((pag - 1) * porPagina, (pag - 1) * porPagina + porPagina);
  return { recebimentos: slice, total, pagina: pag, porPagina, totalPaginas: Math.ceil(total / porPagina), meuEmail: meu, aviso };
}

function emptyResult(pag: number, porPagina: number, meu: string, extra: Partial<ListarRecebResult>): ListarRecebResult {
  return { recebimentos: [], total: 0, pagina: pag, porPagina, totalPaginas: 0, meuEmail: meu, aviso: null, ...extra };
}

// ===== Contadores por tipo/status (pra badges das abas) =====
export interface ResumoReceb {
  pendentes: Record<string, number>;
  concluidos: Record<string, number>;
  total_pendentes: number;
  total_concluidos: number;
  minhas_pendentes: number;
  erro?: string;
}

export async function resumoRecebimentos(conta: ContaFiltro, meu: string): Promise<ResumoReceb> {
  const low = contaLow(conta);
  const resumo: ResumoReceb = { pendentes: {}, concluidos: {}, total_pendentes: 0, total_concluidos: 0, minhas_pendentes: 0 };
  RECEB_TIPOS.forEach((t) => {
    resumo.pendentes[t] = 0;
    resumo.concluidos[t] = 0;
  });

  let pq = supabase.from('recebimentos_nfe').select('id_receb,conta_omie,maquinas,qtd_maquinas,produtos').eq('status', 'Faturada').limit(3000);
  if (low) pq = pq.eq('conta_omie', low);
  const { data: pend } = await pq;
  const linhas = (pend || []) as RecebRow[];
  const ids = linhas.map((r) => r.id_receb);
  const metaMap = await getMetaMap(ids, low);
  linhas.forEach((r) => {
    const meta = metaMap[r.conta_omie + '|' + r.id_receb];
    const tipo = meta && meta.tipo_manual && meta.tipo ? meta.tipo : classificarReceb(r);
    resumo.pendentes[tipo] = (resumo.pendentes[tipo] || 0) + 1;
    resumo.total_pendentes++;
    if (meu && meta && meta.responsavel === meu) resumo.minhas_pendentes++;
  });

  let cq = supabase.from('recebimentos_nfe').select('id_receb', { count: 'exact', head: true }).eq('status', 'Recebida');
  if (low) cq = cq.eq('conta_omie', low);
  const { count } = await cq;
  resumo.total_concluidos = count || 0;
  return resumo;
}

// ===== Usuários (lista p/ transferência) =====
export interface RecebUsuario {
  id?: number;
  conta_omie: string;
  email: string | null;
  nome: string;
  ativo: boolean;
}

export async function listarUsuarios(conta: ContaFiltro): Promise<RecebUsuario[]> {
  const low = contaLow(conta);
  let q = supabase.from('recebimento_usuarios').select('*').eq('ativo', true).order('nome');
  if (low) q = q.eq('conta_omie', low);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as RecebUsuario[];
}

export async function upsertUsuario(conta: ContaFiltro, nome: string, email: string | null, ativo: boolean): Promise<void> {
  const low = contaLow(conta) || 'nova';
  const { error } = await supabase
    .from('recebimento_usuarios')
    .upsert({ conta_omie: low, nome, email: email || null, ativo }, { onConflict: 'conta_omie,nome' });
  if (error) throw new Error(error.message);
}

// ===== Escrita: tipo manual -> recebimento_meta =====
export async function setTipo(conta: ContaFiltro, idReceb: number, tipo: string): Promise<void> {
  if ((RECEB_TIPOS as readonly string[]).indexOf(tipo) < 0) throw new Error('tipo invalido');
  const low = contaLow(conta);
  if (!low) throw new Error('conta obrigatoria');
  const { error } = await supabase
    .from('recebimento_meta')
    .upsert({ conta_omie: low, id_receb: idReceb, tipo, tipo_manual: true }, { onConflict: 'conta_omie,id_receb' });
  if (error) throw new Error(error.message);
}

// ===== Escrita: responsável (transferência) -> recebimento_meta =====
export async function setResponsavel(conta: ContaFiltro, idReceb: number, responsavel: string | null | undefined): Promise<void> {
  const low = contaLow(conta);
  if (!low) throw new Error('conta obrigatoria');
  const resp = responsavel === '' || responsavel === undefined ? null : responsavel;
  const { error } = await supabase
    .from('recebimento_meta')
    .upsert({ conta_omie: low, id_receb: idReceb, responsavel: resp }, { onConflict: 'conta_omie,id_receb' });
  if (error) throw new Error(error.message);
}

// ===== Escrita: concluir (ESCREVE NO OMIE -> etapa 60) =====
// Opcionalmente aplica a categoria escolhida e depois ConcluirRecebimento.
// Só marca concluído (e atualiza recebimentos_nfe) se o Omie aceitar.
// A conta concreta para o Omie é DERIVADA DA LINHA (row.conta_omie), como no
// monolito (runComConta(contaUp(rec.conta_omie), ...)).
export async function concluirRecebimento(
  contaFiltro: ContaFiltro,
  idReceb: number,
  codigoCategoria?: string,
): Promise<{ ok?: boolean; jaConcluido?: boolean; erro?: string; naoEncontrado?: boolean }> {
  const low = contaLow(contaFiltro);
  let rq = supabase.from('recebimentos_nfe').select('id_receb,chave_nfe,status,conta_omie').eq('id_receb', idReceb);
  if (low) rq = rq.eq('conta_omie', low);
  const { data: rec, error: eRec } = await rq.maybeSingle();
  if (eRec) return { erro: eRec.message };
  if (!rec) return { naoEncontrado: true, erro: 'Recebimento nao encontrado' };
  const r = rec as RecebRow;
  if (r.status === 'Recebida') return { ok: true, jaConcluido: true };
  const contaConcreta = contaUp(r.conta_omie); // conta DA LINHA
  const baseParams: Record<string, unknown> = { nIdReceb: idReceb, cChaveNfe: r.chave_nfe || undefined };

  // 1. (Opcional) aplica categoria escolhida antes de concluir (best-effort).
  if (codigoCategoria) {
    try {
      const alt = await omieRequest(URL_RECEBIMENTO, 'AlterarRecebimento', { ...baseParams, cCodCateg: codigoCategoria }, { conta: contaConcreta });
      if (alt && alt.faultstring) console.log('AlterarRecebimento categoria [' + r.conta_omie + '] aviso: ' + alt.faultstring);
    } catch (e) {
      console.log('AlterarRecebimento categoria [' + r.conta_omie + '] erro (ignorado): ' + (e as Error).message);
    }
  }

  // 2. Conclui no Omie -> etapa 60 (Recebida)
  const concl = await omieRequest(URL_RECEBIMENTO, 'ConcluirRecebimento', { ...baseParams, cEtapa: '60' }, { conta: contaConcreta });
  if (concl && concl.faultstring) return { erro: 'Omie: ' + concl.faultstring };

  // 3. Atualiza o espelho local otimisticamente (o sync reconcilia depois)
  await supabase.from('recebimentos_nfe').update({ status: 'Recebida', etapa: '60' }).eq('id_receb', idReceb).eq('conta_omie', r.conta_omie);
  if (codigoCategoria) {
    await supabase
      .from('recebimento_meta')
      .upsert({ conta_omie: r.conta_omie, id_receb: idReceb, codigo_categoria: codigoCategoria }, { onConflict: 'conta_omie,id_receb' });
  }
  return { ok: true };
}

// ===== Escrita: reabrir (ReverterRecebimento no Omie) =====
export async function reabrirRecebimento(
  contaFiltro: ContaFiltro,
  idReceb: number,
): Promise<{ ok?: boolean; erro?: string; naoEncontrado?: boolean }> {
  const low = contaLow(contaFiltro);
  let rq = supabase.from('recebimentos_nfe').select('id_receb,chave_nfe,conta_omie').eq('id_receb', idReceb);
  if (low) rq = rq.eq('conta_omie', low);
  const { data: rec } = await rq.maybeSingle();
  if (!rec) return { naoEncontrado: true, erro: 'Recebimento nao encontrado' };
  const r = rec as RecebRow;
  const contaConcreta = contaUp(r.conta_omie); // conta DA LINHA
  const rev = await omieRequest(
    URL_RECEBIMENTO,
    'ReverterRecebimento',
    { nIdReceb: idReceb, cChaveNfe: r.chave_nfe || undefined },
    { conta: contaConcreta },
  );
  if (rev && rev.faultstring) return { erro: 'Omie: ' + rev.faultstring };
  await supabase.from('recebimentos_nfe').update({ status: 'Faturada', etapa: '40' }).eq('id_receb', idReceb).eq('conta_omie', r.conta_omie);
  return { ok: true };
}

// ============================================================================
// === SYNC: ListarRecebimentos (Omie) -> recebimentos_nfe (Supabase) =========
// NOVO no Portal (não existia no monolito). Parsing DEFENSIVO: os nomes dos
// campos da API ListarRecebimentos são incertos — pick() testa várias chaves.
// ============================================================================

export interface RecebSyncEstado {
  rodando: boolean;
  iniciadoEm?: string | null;
  finalizadoEm?: string | null;
  paginas?: number;
  upserts?: number;
  erro?: string | null;
}

// Estado de sync em memória (singleton module-level por conta). Espelha
// recebSyncState/lock do monolito (que aqui não existia) e o padrão de
// notas-entrada (backfillEnrStatus).
const recebSyncState: Record<string, RecebSyncEstado> = {};

export function getRecebSyncEstado(conta: Conta): RecebSyncEstado {
  if (!recebSyncState[conta]) recebSyncState[conta] = { rodando: false };
  return recebSyncState[conta];
}

// Normaliza uma data Omie (dd/mm/aaaa ou aaaa-mm-dd) para ISO "aaaa-mm-dd".
function dataParaIso(s: unknown): string | null {
  if (!s) return null;
  let str = String(s);
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes('/')) {
    const p = str.split('/');
    if (p.length === 3) return `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
  }
  return str;
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
}

// Constrói a linha de recebimentos_nfe a partir de um registro cru da Omie.
// PARSING DEFENSIVO — chaves incertas testadas via pick().
function recebOmieParaRow(reg: Json, contaLowStr: string): RecebRow | null {
  const cab = (pick<Json>(reg, 'cabecalho', 'cabec') as Json) || reg;
  const ide = (pick<Json>(reg, 'ide', 'identificacao') as Json) || {};
  const forn = (pick<Json>(reg, 'fornecedor', 'emitente') as Json) || {};

  const idReceb = num(pick(reg, 'nIdReceb', 'idReceb', 'nId') ?? pick(cab, 'nIdReceb', 'idReceb', 'nId'));
  if (!idReceb) return null;

  const chave = String(pick(reg, 'cChaveNfe', 'cChaveNFe', 'chave_nfe') ?? pick(cab, 'cChaveNfe', 'cChaveNFe') ?? pick(ide, 'cChaveNfe', 'cChaveNFe') ?? '');
  const numeroNfe = String(pick(reg, 'nNF', 'numero_nfe', 'cNumero') ?? pick(ide, 'nNF', 'numero') ?? pick(cab, 'nNF', 'numero') ?? '');
  const serieNfe = String(pick(reg, 'serie', 'serie_nfe', 'cSerie') ?? pick(ide, 'serie') ?? pick(cab, 'serie') ?? '');
  const emissao = dataParaIso(pick(reg, 'dEmi', 'data_emissao', 'dDtEmissao') ?? pick(ide, 'dEmi', 'dEmissao') ?? pick(cab, 'dEmi'));
  const etapa = String(pick(reg, 'cEtapa', 'etapa') ?? pick(cab, 'cEtapa', 'etapa') ?? '');
  const status = String(pick(reg, 'cDescEtapa', 'status', 'cEtapaDescr') ?? pick(cab, 'cDescEtapa', 'status') ?? '');

  // id_fornecedor é bigint na tabela real — mantém numérico (0 = desconhecido).
  const idFornecedor = num(pick(reg, 'nCodFor', 'id_fornecedor', 'codigo_cliente_fornecedor') ?? pick(forn, 'nCodFor', 'codigo_cliente_fornecedor'));
  const fornecedor = String(pick(reg, 'cNomeFor', 'fornecedor', 'cNome') ?? pick(forn, 'cNomeFor', 'cNome', 'nome_fantasia') ?? '');
  const fornecedorRazao = String(pick(reg, 'cRazaoFor', 'fornecedor_razao', 'cRazao') ?? pick(forn, 'cRazaoFor', 'cRazao', 'razao_social') ?? '');
  const fornecedorCnpj = String(pick(reg, 'cCnpjFor', 'fornecedor_cnpj', 'cnpj_cpf') ?? pick(forn, 'cCnpjFor', 'cnpj_cpf') ?? '');
  const totalNfe = num(pick(reg, 'nValorNF', 'total_nfe', 'nValor', 'nTotal') ?? pick(cab, 'nValorNF', 'nValor'));

  const produtosRaw = pick<unknown>(reg, 'produtos', 'det', 'itens', 'listaProdutos');
  const maquinasRaw = pick<unknown>(reg, 'maquinas', 'listaMaquinas');
  const produtos = Array.isArray(produtosRaw) ? (produtosRaw as Json[]) : [];
  const maquinas = Array.isArray(maquinasRaw) ? (maquinasRaw as Json[]) : [];

  return {
    id_receb: idReceb,
    conta_omie: contaLowStr,
    chave_nfe: chave || null,
    numero_nfe: numeroNfe || null,
    serie_nfe: serieNfe || null,
    emissao_nfe: emissao,
    etapa: etapa || null,
    status: status || null,
    id_fornecedor: idFornecedor || null,
    dados_raw: reg,
    fornecedor: fornecedor || null,
    fornecedor_razao: fornecedorRazao || null,
    fornecedor_cnpj: fornecedorCnpj || null,
    total_nfe: totalNfe,
    maquinas,
    qtd_maquinas: maquinas.length,
    produtos,
    qtd_itens: produtos.length,
  };
}

interface ListarRecebOmieResp {
  faultstring?: string;
  total_de_paginas?: number;
  nTotPaginas?: number;
  recebimento_cadastro?: Json[];
  recebimentos?: Json[];
  cadastros?: Json[];
}

// Sincroniza ListarRecebimentos -> recebimentos_nfe para UMA conta concreta.
export async function sincronizarRecebimentos(conta: Conta): Promise<RecebSyncEstado> {
  const estado = getRecebSyncEstado(conta);
  if (estado.rodando) return estado;
  estado.rodando = true;
  estado.iniciadoEm = new Date().toISOString();
  estado.finalizadoEm = null;
  estado.paginas = 0;
  estado.upserts = 0;
  estado.erro = null;

  const low = String(conta).toLowerCase();
  try {
    let pag = 1;
    const MAX_PAG = 200; // teto de segurança
    while (pag <= MAX_PAG) {
      const r = await omieRequest<ListarRecebOmieResp>(
        URL_RECEBIMENTO,
        'ListarRecebimentos',
        { pagina: pag, registros_por_pagina: 50, apenas_importado_api: 'N' },
        { conta, retries: 3, maxWaitMs: 120_000 },
      );
      if (r.faultstring) {
        // "Nao existem registros" / fim de paginação é normal.
        if (/n[aã]o existem registros|nenhum registro/i.test(r.faultstring)) break;
        estado.erro = r.faultstring;
        break;
      }
      const lista = (r.recebimento_cadastro || r.recebimentos || r.cadastros || []) as Json[];
      if (lista.length === 0) break;

      const rows: RecebRow[] = [];
      for (const reg of lista) {
        const row = recebOmieParaRow(reg, low);
        if (row) rows.push(row);
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('recebimentos_nfe').upsert(rows, { onConflict: 'conta_omie,id_receb' });
        if (error) {
          estado.erro = error.message;
          break;
        }
        estado.upserts = (estado.upserts || 0) + rows.length;
      }
      estado.paginas = pag;

      const totalPag = r.total_de_paginas || r.nTotPaginas || 0;
      if (totalPag && pag >= totalPag) break;
      if (lista.length < 50) break;
      pag++;
      await sleep(1000);
    }
  } catch (e) {
    estado.erro = (e as Error).message;
  } finally {
    estado.rodando = false;
    estado.finalizadoEm = new Date().toISOString();
  }
  return estado;
}

// Roda o sync para TODAS as contas configuradas (usado pelo cron).
export async function sincronizarRecebimentosTodasContas(): Promise<Record<string, RecebSyncEstado>> {
  const resultado: Record<string, RecebSyncEstado> = {};
  for (const c of getContasOmie()) {
    resultado[c.id] = await sincronizarRecebimentos(c.id);
  }
  return resultado;
}

// ===== Popup de produto: ConsultarProduto por id interno + AlterarProduto =====
const URL_PRODUTOS = 'https://app.omie.com.br/api/v1/geral/produtos/';

interface OmieProdutoResp {
  faultstring?: string;
  codigo_produto?: number;
  codigo?: string;
  descricao?: string;
  descricao_familia?: string;
  marca?: string;
  valor_unitario?: number;
}

export async function consultarProdutoPorId(
  idProd: number,
  conta: ContaFiltro,
): Promise<{ codigo_produto: number; codigo: string; descricao: string; familia: string; marca: string; valor_venda: number }> {
  const contaConcreta: Conta = conta ?? CONTA_DEFAULT;
  const p = await omieRequest<OmieProdutoResp>(URL_PRODUTOS, 'ConsultarProduto', { codigo_produto: idProd }, { conta: contaConcreta });
  if (!p || p.faultstring) throw new Error('Produto nao encontrado: ' + (p?.faultstring || ''));
  return {
    codigo_produto: p.codigo_produto || idProd,
    codigo: p.codigo || '',
    descricao: p.descricao || '',
    familia: p.descricao_familia || '',
    marca: p.marca || '',
    valor_venda: num(p.valor_unitario),
  };
}

export async function alterarPrecoVenda(
  idProd: number,
  valorVenda: number,
  conta: ContaFiltro,
): Promise<void> {
  const contaConcreta: Conta = conta ?? CONTA_DEFAULT;
  const alt = await omieRequest<OmieProdutoResp>(
    URL_PRODUTOS,
    'AlterarProduto',
    { codigo_produto: idProd, valor_unitario: valorVenda },
    { conta: contaConcreta },
  );
  if (alt && alt.faultstring) throw new Error('Omie: ' + alt.faultstring);
  // Espelha no Supabase (best-effort; ignora se a coluna/linha nao casar).
  try {
    await supabase.from('produtos').update({ valor_unitario: valorVenda }).eq('codigo_produto', String(idProd)).eq('conta_omie', String(contaConcreta).toLowerCase());
  } catch {
    /* coluna pode nao existir */
  }
}
