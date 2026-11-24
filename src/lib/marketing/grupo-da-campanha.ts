/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Campanha → grupo de requisições (24/11/2026, José: "assim que criar um evento, já cria um grupo em Requisição").
//
// O custo nasce na Requisição: com o grupo criado junto, toda requisição da feira (estande, frete, brinde)
// já tem onde entrar e o custo chega ao Marketing sem ninguém lembrar de criar nada.
// O sentido contrário (criar o grupo e ligar a uma campanha) continua em /api/marketing/acoes/grupo-requisicoes.
// Usa a coluna requisicao_grupos.mkt_acao_id (sql/marketing-evento-interno.sql). O grupo fica ABERTO
// (não conclui sozinho): as requisições de um evento chegam aos poucos, antes e depois dele.
// =============================================================================
import { db } from './db';

export interface GrupoLigado { id: number; nome: string; status: string }

/** Grupo já ligado à campanha (o mais antigo, se por acaso houver mais de um), ou null. */
export async function grupoLigado(acaoId: string): Promise<GrupoLigado | null> {
  const { data, error } = await db.from('requisicao_grupos')
    .select('id, nome, status').eq('mkt_acao_id', acaoId).order('id', { ascending: true }).limit(1);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data?.[0] as GrupoLigado) ?? null;
}

/** Devolve o grupo da campanha; se ainda não tem, cria um com o mesmo nome e já ligado. Não duplica. */
export async function grupoDaCampanha(acao: { id: string; nome: string }, autor: string): Promise<{ grupo: GrupoLigado; criado: boolean }> {
  const ja = await grupoLigado(acao.id);
  if (ja) return { grupo: ja, criado: false };
  const em = new Date().toISOString();
  const historico = [{ acao: 'criou', usuario: autor || '?', em, detalhe: `Criado junto com a campanha "${acao.nome}" (Marketing)` }];
  const { data, error } = await db.from('requisicao_grupos')
    .insert([{ nome: String(acao.nome).trim().slice(0, 200), criado_por: autor || null, historico, mkt_acao_id: acao.id }])
    .select('id, nome, status').single();
  if (error) {
    if (/mkt_acao_id/.test(error.message)) throw new Error('Falta rodar sql/marketing-evento-interno.sql no Supabase.');
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return { grupo: data as GrupoLigado, criado: true };
}
