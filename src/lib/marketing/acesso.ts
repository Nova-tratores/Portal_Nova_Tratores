/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// QUEM VÊ UMA CAMPANHA (25/11/2026, José)
// - Pública: todo mundo com o módulo Marketing.
// - Privada: só os RESPONSÁVEIS (mkt_acao_responsaveis + o dono responsavel_id) e quem é DEV.
//   Para os outros a lista mostra um cartão "Campanha privada", sem nome, sem capa, sem id real.
// Se o SQL (sql/marketing-campanha-equipe.sql) ainda não rodou, tudo continua público como antes.
// =============================================================================
import type { Autenticado } from '@/lib/auth/server';
import { db } from './db';

export type Responsavel = { user_id: string; nome: string | null };

const semTabela = (e: any) => e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(String(e.message || '')));

/** Responsáveis de várias campanhas de uma vez: { acaoId: [user_id...] }. */
export async function responsaveisDas(acaoIds: string[]): Promise<Record<string, Responsavel[]>> {
  const out: Record<string, Responsavel[]> = {};
  if (!acaoIds.length) return out;
  const { data, error } = await db.from('mkt_acao_responsaveis').select('acao_id, user_id, nome').in('acao_id', acaoIds);
  if (error) { if (semTabela(error)) return out; throw error; }
  for (const r of data ?? []) (out[r.acao_id] ||= []).push({ user_id: r.user_id, nome: r.nome });
  return out;
}

/** A pessoa enxerga esta campanha? (dev sempre; pública sempre; privada só responsável) */
export function podeVer(auth: Autenticado, acao: { visibilidade?: string | null; responsavel_id?: string | null }, resp: Responsavel[] = []): boolean {
  if (auth.isDev) return true;
  if ((acao.visibilidade ?? 'publica') !== 'privada') return true;
  if (acao.responsavel_id && acao.responsavel_id === auth.userId) return true;
  return resp.some((r) => r.user_id === auth.userId);
}

/** Para uma rota de UMA campanha: carrega o mínimo e diz se pode ver. */
export async function acessoDaCampanha(auth: Autenticado, acaoId: string): Promise<{ existe: boolean; ver: boolean; responsavel: boolean; responsaveis: Responsavel[] }> {
  let { data: acao, error } = await db.from('mkt_acoes').select('id, visibilidade, responsavel_id').eq('id', acaoId).maybeSingle();
  if (error && semTabela(error)) ({ data: acao, error } = await db.from('mkt_acoes').select('id, responsavel_id').eq('id', acaoId).maybeSingle());
  if (error) throw error;
  if (!acao) return { existe: false, ver: false, responsavel: false, responsaveis: [] };
  const responsaveis = (await responsaveisDas([acaoId]))[acaoId] ?? [];
  const responsavel = acao.responsavel_id === auth.userId || responsaveis.some((r) => r.user_id === auth.userId);
  return { existe: true, ver: podeVer(auth, acao as any, responsaveis), responsavel, responsaveis };
}

/**
 * Lista: troca as privadas que a pessoa não pode ver por um cartão mudo.
 * O id também é trocado (não dá para abrir a ficha nem chamar as rotas filhas com ele).
 */
export async function mascararLista<T extends { id: string; visibilidade?: string | null; responsavel_id?: string | null }>(
  auth: Autenticado, acoes: T[],
): Promise<{ visiveis: T[]; ocultas: number; lista: any[] }> {
  if (auth.isDev || !acoes.some((a) => a.visibilidade === 'privada')) return { visiveis: acoes, ocultas: 0, lista: acoes };
  const resp = await responsaveisDas(acoes.filter((a) => a.visibilidade === 'privada').map((a) => a.id));
  const visiveis: T[] = [];
  let n = 0;
  const lista = acoes.map((a) => {
    if (podeVer(auth, a, resp[a.id])) { visiveis.push(a); return a; }
    n += 1;
    return { id: `privada-${n}`, privada_oculta: true, nome: 'Campanha privada', visibilidade: 'privada' };
  });
  return { visiveis, ocultas: n, lista };
}

/** Grava o grupo de responsáveis (substitui). O dono (responsavel_id) sempre entra. */
export async function salvarResponsaveis(acaoId: string, ids: string[], autorId: string): Promise<Responsavel[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const nomes: Record<string, string | null> = {};
  if (unicos.length) {
    const { data } = await db.from('financeiro_usu').select('id, nome').in('id', unicos);
    for (const u of data ?? []) nomes[u.id] = u.nome ?? null;
  }
  const { error: eDel } = await db.from('mkt_acao_responsaveis').delete().eq('acao_id', acaoId).not('user_id', 'in', `(${unicos.length ? unicos.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  if (eDel) throw eDel;
  if (unicos.length) {
    const { error } = await db.from('mkt_acao_responsaveis').upsert(
      unicos.map((user_id) => ({ acao_id: acaoId, user_id, nome: nomes[user_id] ?? null, adicionado_por: autorId })),
      { onConflict: 'acao_id,user_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  return unicos.map((user_id) => ({ user_id, nome: nomes[user_id] ?? null }));
}
