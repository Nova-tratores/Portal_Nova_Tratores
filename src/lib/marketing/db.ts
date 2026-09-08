/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// MARKETING & EVENTOS — acesso ao banco (SERVIDOR).
//
// As tabelas mkt_* têm RLS ligada e ZERO policy: o navegador lê [] SEM ERRO.
// Todo acesso passa por aqui, com service role, chamado das rotas /api/marketing.
//
// O SQL roda À MÃO e o código sai do main sozinho. Se a migration ainda não foi
// aplicada, a LEITURA degrada (devolve vazio + flag) e a ESCRITA falha com
// mensagem clara — o portal inteiro nunca quebra por causa disso.
// Mesmo padrão de lib/email/envios-config.ts.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { Acao, Apoio, Custo, Lead, PropostaVinculada } from './tipos';

export const db = supabaseAdmin;

/** A tabela/coluna ainda não existe no banco (migration pendente). */
export function migrationFaltou(err: any): boolean {
  const m = String(err?.message || err?.code || '');
  return (
    err?.code === '42P01' ||
    err?.code === 'PGRST205' ||
    /does not exist|schema cache|relation .* not/i.test(m)
  );
}

export const MSG_MIGRATION =
  'As tabelas do módulo Marketing ainda não existem no banco. Rode sql/marketing-acoes.sql no SQL Editor do Supabase.';

/** Erro de escrita que a rota transforma em 503 com instrução. */
export class MigrationPendente extends Error {
  constructor() {
    super(MSG_MIGRATION);
    this.name = 'MigrationPendente';
  }
}

/**
 * Envolve uma LEITURA: se a migration faltar devolve o `vazio` com a flag, em
 * vez de estourar. Qualquer outro erro sobe (bug de verdade não vira silêncio).
 */
export async function lerOuVazio<T>(
  fn: () => Promise<T>,
  vazio: T,
): Promise<{ dados: T; migracaoFaltando: boolean }> {
  try {
    return { dados: await fn(), migracaoFaltando: false };
  } catch (e: any) {
    if (migrationFaltou(e)) return { dados: vazio, migracaoFaltando: true };
    throw e;
  }
}

/** Levanta o erro do PostgREST como Error (o supabase-js devolve, não lança). */
function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) {
    const err = new Error(res.error.message || 'erro no banco');
    (err as any).code = res.error.code;
    throw err;
  }
  return (res.data ?? []) as T;
}

// ── Ações ────────────────────────────────────────────────────────────────────
export interface FiltroAcoes {
  ano?: number;
  tipo?: string;
  status?: string;
  empresa?: string;
  busca?: string;
  incluirLixeira?: boolean;
}

export async function listarAcoes(f: FiltroAcoes = {}): Promise<Acao[]> {
  let q = db.from('mkt_acoes').select('*');
  if (!f.incluirLixeira) q = q.is('deleted_at', null);
  if (f.tipo) q = q.eq('tipo', f.tipo);
  if (f.status) q = q.eq('status', f.status);
  if (f.empresa) q = q.eq('empresa', f.empresa);
  if (f.ano) {
    // Ação sem data não some do filtro por ano só porque não tem data: entra
    // pelo ano de criação. Filtrar em JS, que o OR do PostgREST com range de
    // data fica ilegível.
    const acoes = ok<Acao[]>(await q.order('data_inicio', { ascending: false, nullsFirst: false }).order('criado_em', { ascending: false }));
    return filtrarPorAnoEBusca(acoes, f);
  }
  const acoes = ok<Acao[]>(
    await q
      .order('data_inicio', { ascending: false, nullsFirst: false })
      .order('criado_em', { ascending: false }),
  );
  return filtrarPorAnoEBusca(acoes, f);
}

function filtrarPorAnoEBusca(acoes: Acao[], f: FiltroAcoes): Acao[] {
  let out = acoes;
  if (f.ano) {
    out = out.filter((a) => {
      const ref = a.data_inicio || a.criado_em;
      return ref ? Number(String(ref).slice(0, 4)) === f.ano : false;
    });
  }
  if (f.busca) {
    const t = normalizar(f.busca);
    out = out.filter((a) =>
      [a.nome, a.codigo, a.cidade, a.local_nome, a.responsavel_nome, a.projeto_nome]
        .some((v) => v && normalizar(String(v)).includes(t)),
    );
  }
  return out;
}

/** Sem acento, minúsculo — o ilike do Postgres não ignora acento. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export async function obterAcao(id: string): Promise<Acao | null> {
  const { data, error } = await db.from('mkt_acoes').select('*').eq('id', id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data as Acao) ?? null;
}

// ── Filhas de uma ação ───────────────────────────────────────────────────────
export async function apoiosDaAcao(acaoId: string): Promise<Apoio[]> {
  return ok<Apoio[]>(
    await db.from('mkt_apoios').select('*').eq('acao_id', acaoId).order('criado_em'),
  );
}

export async function custosDaAcao(acaoId: string): Promise<Custo[]> {
  return ok<Custo[]>(
    await db.from('mkt_custos').select('*').eq('acao_id', acaoId).order('data', { nullsFirst: false }).order('criado_em'),
  );
}

export async function leadsDaAcao(acaoId: string): Promise<Lead[]> {
  return ok<Lead[]>(
    await db.from('mkt_leads').select('*').eq('acao_id', acaoId).order('capturado_em', { ascending: false }),
  );
}

export async function filhasSimples(tabela: string, acaoId: string, ordem = 'criado_em'): Promise<any[]> {
  return ok<any[]>(await db.from(tabela).select('*').eq('acao_id', acaoId).order(ordem));
}

/**
 * Propostas vinculadas à ação, já achatadas com o que o ROI precisa.
 * Lê a LIGAÇÃO em mkt_acao_propostas e depois a view v_formulario — nunca
 * escreve nada no módulo Comercial.
 */
export async function propostasDaAcao(acaoId: string): Promise<PropostaVinculada[]> {
  const vinculos = ok<any[]>(
    await db.from('mkt_acao_propostas').select('proposta_id, peso').eq('acao_id', acaoId),
  );
  if (vinculos.length === 0) return [];

  const ids = vinculos.map((v) => v.proposta_id);
  const props = ok<any[]>(
    await db
      .from('v_formulario')
      .select('id, status, "Valor_Total", "Cliente", vendedor_nome, criado_em')
      .in('id', ids),
  );
  const porId = new Map(props.map((p) => [Number(p.id), p]));

  return vinculos.map((v) => {
    const p = porId.get(Number(v.proposta_id));
    return {
      proposta_id: Number(v.proposta_id),
      peso: Number(v.peso ?? 1),
      status: p?.status ?? null,
      valor_total: p?.Valor_Total ?? null,
      cliente: p?.Cliente ?? null,
      vendedor_nome: p?.vendedor_nome ?? null,
      criado_em: p?.criado_em ?? null,
    };
  });
}

/**
 * Carrega a ficha inteira numa chamada só — a tela do evento abre com um GET.
 */
export async function carregarAcaoCompleta(id: string) {
  const acao = await obterAcao(id);
  if (!acao) return null;

  const [apoios, custos, leads, propostas, equipe, itens, realizadas, concorrentes, midias, avaliacoes] =
    await Promise.all([
      apoiosDaAcao(id),
      custosDaAcao(id),
      leadsDaAcao(id),
      propostasDaAcao(id),
      filhasSimples('mkt_equipe', id),
      filhasSimples('mkt_itens', id),
      filhasSimples('mkt_realizadas', id),
      filhasSimples('mkt_concorrentes', id),
      filhasSimples('mkt_midias', id, 'ordem'),
      filhasSimples('mkt_avaliacoes', id),
    ]);

  return { acao, apoios, custos, leads, propostas, equipe, itens, realizadas, concorrentes, midias, avaliacoes };
}

/**
 * Responsáveis que não estão mais ATIVOS no portal. É o alerta que valida o
 * caso IRRIGASHOW: a ação continua legível (o nome é snapshot), mas a tela
 * precisa gritar "reatribuir".
 */
export async function idsInativos(ids: (string | null)[]): Promise<Set<string>> {
  const limpos = [...new Set(ids.filter((i): i is string => !!i))];
  if (limpos.length === 0) return new Set();
  try {
    const rows = ok<any[]>(
      await db.from('financeiro_usu').select('id, ativo').in('id', limpos),
    );
    const inativos = new Set<string>();
    const vistos = new Set<string>();
    for (const r of rows) {
      vistos.add(String(r.id));
      if (r.ativo === false) inativos.add(String(r.id));
    }
    // Quem sumiu de financeiro_usu também conta como inativo.
    for (const id of limpos) if (!vistos.has(id)) inativos.add(id);
    return inativos;
  } catch {
    return new Set();
  }
}
