/* eslint-disable @typescript-eslint/no-explicit-any */
// Demanda de ALOCAÇÃO de peça recebida — lado SERVIDOR (banco + notificação).
// Regras puras em ./alocacao.ts. Molde: src/lib/frota/pendencias-sync.ts
// (abre sozinha com chave de origem; fecha sozinha quando a causa some).
//
// Fonte: espelho `recebimentos_nfe` (sync a cada 15 min) — cobre a entrada dada
// pelo portal E a dada direto na Omie. Depois de RECEBIDA, cada item traz o
// produto interno (nCodProduto) e a quantidade, inclusive de produto criado na
// própria entrada.
//
// Tolerante à migration ausente (sql/pecas-alocacao-pendencias.sql): sem a
// tabela, o motor devolve { pulado } e as leituras devolvem vazio.
//
// ⚠️ Este arquivo é importado por src/lib/ajustes/caracteristicas.ts (gancho de
// fechamento). NÃO importar daqui caracteristicas.ts, localizacao.ts nem
// robo-recebidos.ts — vira import circular.
import { supabase } from '@/lib/ajustes/supabase';
import { filtrarDestinatarios } from '@/lib/notif/prefs';
import {
  agruparPorProduto, chaveProduto, dataBrParaIso, inicioAlocacao, locacaoCompleta, locacaoCurta, planejar,
  type EspelhoCaract, type ItemRecebido, type NotaRecebida, type NovaPendencia, type PendenciaAlocacao,
  type Plano, type ProdutoCadastro, type StatusAlocacao,
} from './alocacao';

const TABELA = 'pecas_alocacao_pendencias';
const LINK_TELA = '/ajustes/caracteristicas?alocar=1';
const LOTE = 200;

export interface AutorAlocacao { userId?: string | null; userName: string }

/** Erro de "tabela/coluna não existe" (migration ainda não aplicada). */
function ehAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === '42703' || err.code === 'PGRST205' || err.code === 'PGRST204'
    || /does not exist|could not find the table|schema cache/i.test(String(err.message || ''));
}

function lotes<T>(arr: T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ---------------------------------------------------------------------------
// Responsável (fixo por empresa). Mesmo cadastro do robô de classificação:
// recebimento_classificacao_responsavel; fallback = responsável de peças.
// ---------------------------------------------------------------------------
export async function responsavelClassificacao(conta: string): Promise<string | null> {
  const low = String(conta).toLowerCase();
  const { data } = await supabase
    .from('recebimento_classificacao_responsavel')
    .select('responsavel_user_id')
    .eq('conta_omie', low)
    .maybeSingle();
  if ((data as any)?.responsavel_user_id) return (data as any).responsavel_user_id;
  const { data: fb } = await supabase
    .from('recebimento_tipo_responsavel')
    .select('responsavel_user_id')
    .eq('conta_omie', low)
    .eq('tipo', 'pecas')
    .maybeSingle();
  return (fb as any)?.responsavel_user_id || null;
}

async function nomeUsuario(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle();
  return (data as any)?.nome || null;
}

// respeita o silenciamento de notificações (regra do portal: todo remetente de
// portal_notificacoes filtra por prefs). Peças = módulo 'ppv'.
async function notificar(userId: string, titulo: string, descricao: string): Promise<boolean> {
  try {
    const { data: pref } = await supabase
      .from('portal_permissoes')
      .select('user_id, categoria, notif_silenciado')
      .eq('user_id', userId)
      .maybeSingle();
    if (pref && filtrarDestinatarios('ppv', [pref as any]).length === 0) return false;
    const { error } = await supabase.from('portal_notificacoes').insert({ user_id: userId, tipo: 'ppv', titulo, descricao, link: LINK_TELA });
    return !error;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------
async function lerNotasRecebidas(desde: string): Promise<NotaRecebida[]> {
  const out: NotaRecebida[] = [];
  const paraNota = (r: any, recebidoEm: string | null): NotaRecebida => ({
    conta: String(r.conta_omie || '').toUpperCase(),
    id_receb: Number(r.id_receb),
    numero_nfe: r.numero_nfe ?? null,
    fornecedor: r.fornecedor ?? null,
    recebido_em: recebidoEm,
    itens: (Array.isArray(r.produtos) ? r.produtos : []) as ItemRecebido[],
  });

  // caminho normal: coluna recebido_em (migration aplicada)
  let semColuna = false;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('recebimentos_nfe')
      .select('conta_omie,id_receb,numero_nfe,fornecedor,produtos,recebido_em')
      .eq('status', 'Recebida')
      .gte('recebido_em', desde)
      .order('id_receb')
      .range(from, from + 999);
    if (error) {
      if (ehAusente(error)) { semColuna = true; break; }
      throw new Error(`recebimentos_nfe: ${error.message}`);
    }
    for (const r of data || []) out.push(paraNota(r, dataBrParaIso((r as any).recebido_em)));
    if (!data || data.length < 1000) break;
  }
  if (!semColuna) return out;

  // fallback (sem a coluna): a data só existe no JSON, em DD/MM/AAAA → recorta por
  // emissão (90 dias antes do início, folga p/ nota recebida tarde) e filtra em código.
  out.length = 0;
  const d = new Date(`${desde}T12:00:00`);
  d.setDate(d.getDate() - 90);
  const emissaoMin = d.toISOString().slice(0, 10);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('recebimentos_nfe')
      .select('conta_omie,id_receb,numero_nfe,fornecedor,produtos,dRec:dados_raw->infoCadastro->>dRec')
      .eq('status', 'Recebida')
      .gte('emissao_nfe', emissaoMin)
      .order('id_receb')
      .range(from, from + 999);
    if (error) throw new Error(`recebimentos_nfe: ${error.message}`);
    for (const r of data || []) {
      const rec = dataBrParaIso((r as any).dRec);
      if (rec && rec >= desde) out.push(paraNota(r, rec));
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function lerEspelho(ids: number[]): Promise<Map<string, EspelhoCaract>> {
  const m = new Map<string, EspelhoCaract>();
  for (const lote of lotes(ids)) {
    const { data, error } = await supabase
      .from('produtos_caracteristicas')
      .select('conta_omie,codigo_produto,codigo,descricao,caracteristicas')
      .in('codigo_produto', lote);
    if (error) throw new Error(`produtos_caracteristicas: ${error.message}`);
    for (const r of data || []) m.set(chaveProduto((r as any).conta_omie, (r as any).codigo_produto), r as any);
  }
  return m;
}

async function lerCadastro(ids: number[]): Promise<Map<string, ProdutoCadastro>> {
  const m = new Map<string, ProdutoCadastro>();
  for (const lote of lotes(ids)) {
    const { data, error } = await supabase
      .from('produtos')
      .select('conta_omie,codigo_produto,codigo,descricao,familia_nome,inativo')
      .in('codigo_produto', lote);
    if (error) throw new Error(`produtos: ${error.message}`);
    // `produtos.conta_omie` é minúscula — chaveProduto normaliza
    for (const r of data || []) m.set(chaveProduto((r as any).conta_omie, (r as any).codigo_produto), r as any);
  }
  return m;
}

const COLS = 'id,conta_omie,codigo_produto,codigo,descricao,id_receb,numero_nfe,fornecedor,recebido_em,qtde,status,responsavel_user_id,responsavel_nome,aberta_em,resolvida_em,resolvida_por,resolucao,locacao';

/** null = tabela ainda não existe. */
async function lerPendencias(filtro: (q: any) => any): Promise<PendenciaAlocacao[] | null> {
  const out: PendenciaAlocacao[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(supabase.from(TABELA).select(COLS)).order('id').range(from, from + 999);
    if (error) {
      if (ehAusente(error)) return null;
      throw new Error(`${TABELA}: ${error.message}`);
    }
    for (const r of data || []) out.push({ ...(r as any), codigo_produto: Number((r as any).codigo_produto), id_receb: Number((r as any).id_receb), qtde: Number((r as any).qtde) || 0 });
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------
export interface ResultadoAlocacao {
  pulado?: string;
  desde: string;
  notas: number;
  abertas: number;          // demandas novas (linhas)
  pecasNovas: number;       // peças distintas nas demandas novas
  fechadas: number;
  notificados: number;
  ignorados: Plano['ignorados'];
  /** só na simulação (gravar:false) */
  previa?: { abrir: NovaPendencia[]; fechar: Plano['fechar'] };
}

/**
 * Abre demanda para peça recebida sem locação e fecha as que já foram alocadas.
 * `gravar:false` = simulação (nada é escrito; devolve a prévia).
 */
export async function sincronizarAlocacao(opts: { gravar?: boolean; desde?: string } = {}): Promise<ResultadoAlocacao> {
  const gravar = opts.gravar !== false;
  const desde = opts.desde || inicioAlocacao(process.env.ALOCACAO_DESDE);
  const vazio: ResultadoAlocacao = {
    desde, notas: 0, abertas: 0, pecasNovas: 0, fechadas: 0, notificados: 0,
    ignorados: { 'sem-produto': 0, 'cfop-sem-estoque': 0, maquina: 0, 'nao-e-peca': 0, 'ja-tem-locacao': 0, 'ja-registrado': 0, 'antes-do-inicio': 0 },
  };

  const notas = await lerNotasRecebidas(desde);
  const idRecebs = [...new Set(notas.map((n) => n.id_receb))];

  // existentes: tudo das notas em questão (idempotência) + todas as abertas (fechamento)
  const [abertas, ...porNota] = await Promise.all([
    lerPendencias((q) => q.eq('status', 'aberta')),
    ...lotes(idRecebs).map((l) => lerPendencias((q) => q.in('id_receb', l))),
  ]);
  const tabelaAusente = abertas === null || porNota.some((x) => x === null);
  if (tabelaAusente && gravar) return { ...vazio, notas: notas.length, pulado: `tabela ${TABELA} ausente (aplicar sql/pecas-alocacao-pendencias.sql)` };
  const porId = new Map<number, PendenciaAlocacao>();
  for (const lista of [abertas, ...porNota]) for (const p of lista || []) porId.set(p.id, p);
  const existentes = [...porId.values()];

  const ids = new Set<number>();
  for (const n of notas) for (const it of n.itens) { const cp = Number(it.nCodProduto); if (cp) ids.add(cp); }
  for (const p of existentes) if (p.status === 'aberta') ids.add(p.codigo_produto);
  const listaIds = [...ids];
  const [espelho, cadastro] = await Promise.all([lerEspelho(listaIds), lerCadastro(listaIds)]);

  const plano = planejar({ notas, existentes, espelho, cadastro, desde });
  const pecasNovas = new Set(plano.abrir.map((a) => chaveProduto(a.conta_omie, a.codigo_produto))).size;
  const res: ResultadoAlocacao = { ...vazio, notas: notas.length, abertas: plano.abrir.length, pecasNovas, fechadas: plano.fechar.length, ignorados: plano.ignorados };
  if (!gravar) return { ...res, previa: { abrir: plano.abrir, fechar: plano.fechar } };

  // 1) garante a linha da peça no espelho de características (produto criado na
  //    entrada só chegaria no sync das 03:00 — e sem a linha a locação gravada
  //    não aparece nem fecha a demanda).
  const faltamNoEspelho = new Map<string, NovaPendencia>();
  for (const a of plano.abrir) {
    const k = chaveProduto(a.conta_omie, a.codigo_produto);
    if (!espelho.has(k)) faltamNoEspelho.set(k, a);
  }
  if (faltamNoEspelho.size > 0) {
    const agora = new Date().toISOString();
    const { error } = await supabase.from('produtos_caracteristicas').insert(
      [...faltamNoEspelho.values()].map((a) => ({
        conta_omie: a.conta_omie, codigo_produto: a.codigo_produto, codigo: a.codigo, descricao: a.descricao,
        caracteristicas: {}, atualizado_em: agora,
      })),
    );
    if (error) console.warn('[alocacao] garantir espelho:', error.message);
  }

  // 2) abre (responsável fixo por empresa)
  if (plano.abrir.length > 0) {
    const resp = new Map<string, { id: string | null; nome: string | null }>();
    for (const conta of new Set(plano.abrir.map((a) => a.conta_omie))) {
      const id = await responsavelClassificacao(conta);
      resp.set(conta, { id, nome: await nomeUsuario(id) });
    }
    for (const lote of lotes(plano.abrir)) {
      const { error } = await supabase.from(TABELA).upsert(
        lote.map((a) => ({ ...a, status: 'aberta', responsavel_user_id: resp.get(a.conta_omie)?.id ?? null, responsavel_nome: resp.get(a.conta_omie)?.nome ?? null })),
        { onConflict: 'conta_omie,id_receb,codigo_produto', ignoreDuplicates: true },
      );
      if (error) throw new Error(`abrir demandas: ${error.message}`);
    }
    // 3) um resumo por responsável (nunca uma notificação por peça)
    const porResp = new Map<string, Set<string>>();
    for (const a of plano.abrir) {
      const id = resp.get(a.conta_omie)?.id;
      if (!id) continue;
      if (!porResp.has(id)) porResp.set(id, new Set());
      porResp.get(id)!.add(chaveProduto(a.conta_omie, a.codigo_produto));
    }
    for (const [userId, pecas] of porResp) {
      const n = pecas.size;
      const exemplo = plano.abrir.slice(0, 3).map((a) => a.codigo || a.codigo_produto).join(', ');
      const ok = await notificar(userId,
        n === 1 ? '1 peça recebida aguardando locação' : `${n} peças recebidas aguardando locação`,
        `Defina Prateleira/Andar/Caixa em Características → A alocar. Ex.: ${exemplo}${plano.abrir.length > 3 ? '…' : ''}`);
      if (ok) res.notificados++;
    }
  }

  // 4) fecha as que já têm locação completa (guarda contra corrida: só se ainda aberta)
  const agora = new Date().toISOString();
  for (const f of plano.fechar) {
    const { error } = await supabase.from(TABELA)
      .update({ status: 'resolvida', resolvida_em: agora, resolvida_por: 'Sistema', resolucao: `locação definida: ${f.locacao}`, locacao: f.locacao })
      .eq('id', f.id).eq('status', 'aberta');
    if (error) console.warn('[alocacao] fechar', f.id, error.message);
  }
  return res;
}

/**
 * Gancho de fechamento IMEDIATO: chamado quando uma característica de locação é
 * gravada (edição inline, modal da Localização, painel "A alocar"). Se a peça
 * ficou com locação completa, fecha as demandas abertas dela. Nunca lança — a
 * gravação da locação não pode falhar por causa disto.
 */
export async function fecharSeAlocada(conta: string, codigoProduto: number | string, autor?: AutorAlocacao): Promise<number> {
  try {
    const label = String(conta).toUpperCase();
    const cp = Number(codigoProduto) || codigoProduto;
    const { data: esp, error: e1 } = await supabase
      .from('produtos_caracteristicas').select('caracteristicas')
      .eq('conta_omie', label).eq('codigo_produto', cp).maybeSingle();
    if (e1 || !esp) return 0;
    const car = (esp as any).caracteristicas as Record<string, string> | null;
    if (!locacaoCompleta(car)) return 0;
    const loc = locacaoCurta(car);
    const { data, error } = await supabase.from(TABELA)
      .update({
        status: 'resolvida', resolvida_em: new Date().toISOString(),
        resolvida_por: autor?.userName || 'Sistema', resolvida_user_id: autor?.userId || null,
        resolucao: `locação definida: ${loc}`, locacao: loc,
      })
      .eq('conta_omie', label).eq('codigo_produto', cp).eq('status', 'aberta')
      .select('id');
    if (error) return 0;
    return (data || []).length;
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
export interface ListaAlocacao {
  tabelaAusente: boolean;
  grupos: ReturnType<typeof agruparPorProduto>;
  totais: { pecas: number; linhas: number; minhas: number };
}

/** Demandas ABERTAS agrupadas por peça. Antes, fecha as que já ganharam locação (barato). */
export async function listarAbertas(opts: { userId?: string | null } = {}): Promise<ListaAlocacao> {
  let abertas = await lerPendencias((q) => q.eq('status', 'aberta'));
  if (abertas === null) return { tabelaAusente: true, grupos: [], totais: { pecas: 0, linhas: 0, minhas: 0 } };
  if (abertas.length > 0) {
    const espelho = await lerEspelho([...new Set(abertas.map((p) => p.codigo_produto))]);
    const fechar = abertas.filter((p) => locacaoCompleta(espelho.get(chaveProduto(p.conta_omie, p.codigo_produto))?.caracteristicas));
    if (fechar.length > 0) {
      const feitos = new Set<string>();
      for (const p of fechar) {
        const k = chaveProduto(p.conta_omie, p.codigo_produto);
        if (feitos.has(k)) continue;
        feitos.add(k);
        await fecharSeAlocada(p.conta_omie, p.codigo_produto);
      }
      const idsFechados = new Set(fechar.map((p) => p.id));
      abertas = abertas.filter((p) => !idsFechados.has(p.id));
    }
  }
  const grupos = agruparPorProduto(abertas);
  return {
    tabelaAusente: false,
    grupos,
    totais: {
      pecas: grupos.length,
      linhas: abertas.length,
      minhas: opts.userId ? grupos.filter((g) => g.responsavel_user_id === opts.userId).length : 0,
    },
  };
}

/** Histórico recente (resolvidas/dispensadas), mais novas primeiro. */
export async function listarEncerradas(limite = 100): Promise<PendenciaAlocacao[]> {
  const { data, error } = await supabase.from(TABELA).select(COLS)
    .neq('status', 'aberta').order('resolvida_em', { ascending: false }).limit(limite);
  if (error) { if (ehAusente(error)) return []; throw new Error(`${TABELA}: ${error.message}`); }
  return (data || []) as any;
}

async function mudarStatus(
  alvo: { conta: string; codigoProduto: number | string },
  de: StatusAlocacao, patch: Record<string, unknown>,
): Promise<PendenciaAlocacao[]> {
  const { data, error } = await supabase.from(TABELA).update(patch)
    .eq('conta_omie', String(alvo.conta).toUpperCase()).eq('codigo_produto', Number(alvo.codigoProduto) || alvo.codigoProduto)
    .eq('status', de).select(COLS);
  if (error) throw new Error(`${TABELA}: ${error.message}`);
  return (data || []) as any;
}

/** Dispensa as demandas abertas da peça (ex.: peça grande que fica no chão). Motivo obrigatório. */
export async function dispensar(alvo: { conta: string; codigoProduto: number | string }, motivo: string, autor: AutorAlocacao): Promise<PendenciaAlocacao[]> {
  const m = String(motivo || '').trim();
  if (m.length < 3) throw new Error('Informe o motivo da dispensa');
  return mudarStatus(alvo, 'aberta', {
    status: 'dispensada', resolvida_em: new Date().toISOString(), resolvida_por: autor.userName, resolvida_user_id: autor.userId, resolucao: `dispensada: ${m}`,
  });
}

/** Reabre as dispensadas da peça (não reabre as resolvidas: a peça tem locação). */
export async function reabrir(alvo: { conta: string; codigoProduto: number | string }): Promise<PendenciaAlocacao[]> {
  return mudarStatus(alvo, 'dispensada', {
    status: 'aberta', resolvida_em: null, resolvida_por: null, resolvida_user_id: null, resolucao: null, locacao: null,
  });
}
