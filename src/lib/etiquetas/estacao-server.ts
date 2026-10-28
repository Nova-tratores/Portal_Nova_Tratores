// Estação de impressão da térmica — banco (SÓ SERVIDOR, service role).
// Regras puras em ./estacao. Sem sql/etiquetas-estacao.sql as funções lançam
// EstacaoSemMigracao e as rotas respondem 503 { migracaoFaltando }.

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'
import {
  CANAL_ESTACAO, ESTACAO_ID, ESTACAO_TRAVADO_MS, estacaoOnline,
  type OrigemEtiqueta, type SituacaoEstacao, type Trabalho,
} from './estacao'

const FILA = 'etiquetas_estacao_fila'
const ESTACAO = 'etiquetas_estacao'
const CAMPOS = 'id, origem, itens, total, status, erro, criado_nome, criado_em, pego_em, impresso_em'

export class EstacaoSemMigracao extends Error {
  constructor() { super('Falta rodar o sql/etiquetas-estacao.sql no Supabase.') }
}
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /etiquetas_estacao/.test(e.message || '') && /does not exist|schema cache/i.test(e.message || ''))
function checar(e: { code?: string; message?: string } | null) {
  if (!e) return
  if (semTabela(e)) throw new EstacaoSemMigracao()
  throw new Error(e.message || String(e))
}

export interface Autor { id: string; nome: string }

export async function situacao(): Promise<SituacaoEstacao> {
  const [{ data: est, error: e1 }, { count, error: e2 }] = await Promise.all([
    sb.from(ESTACAO).select('nome, ultimo_sinal, sinal_nome').eq('id', ESTACAO_ID).maybeSingle(),
    sb.from(FILA).select('id', { count: 'exact', head: true }).in('status', ['pendente', 'imprimindo']),
  ])
  checar(e1); checar(e2)
  return {
    nome: est?.nome || 'ROGERIA',
    online: estacaoOnline(est?.ultimo_sinal),
    ultimoSinal: est?.ultimo_sinal || null,
    sinalNome: est?.sinal_nome || null,
    pendentes: count || 0,
  }
}

export async function enfileirar(origem: OrigemEtiqueta, itens: ItemTermica[], autor: Autor): Promise<Trabalho> {
  const { data, error } = await sb.from(FILA)
    .insert({ origem, itens, total: itens.length, criado_por: autor.id, criado_nome: autor.nome })
    .select(CAMPOS).single()
  checar(error)
  await avisarEstacao()
  return data as Trabalho
}

/** Últimos pedidos (painel da estação). */
export async function recentes(limite = 40): Promise<Trabalho[]> {
  const { data, error } = await sb.from(FILA).select(CAMPOS).order('criado_em', { ascending: false }).limit(limite)
  checar(error)
  return (data || []) as Trabalho[]
}

/** A estação dá sinal de vida e PEGA os pedidos pendentes (um UPDATE condicional
 *  por pedido: duas estações abertas nunca imprimem o mesmo). Pedido que ficou
 *  "imprimindo" sem resposta vira erro — não reimprime sozinho (pode ter saído). */
export async function sinalEPegar(autor: Autor, info: Record<string, unknown>): Promise<Trabalho[]> {
  const agora = new Date()
  const { error: e1 } = await sb.from(ESTACAO).upsert({
    id: ESTACAO_ID, nome: 'ROGERIA', ultimo_sinal: agora.toISOString(), sinal_por: autor.id, sinal_nome: autor.nome, info,
  }, { onConflict: 'id' })
  checar(e1)
  await sb.from(FILA)
    .update({ status: 'erro', erro: 'A estação parou no meio da impressão — confira se saiu e, se não, imprima de novo.' })
    .eq('status', 'imprimindo').lt('pego_em', new Date(agora.getTime() - ESTACAO_TRAVADO_MS).toISOString())

  const { data: pend, error: e2 } = await sb.from(FILA).select('id').eq('status', 'pendente').order('criado_em').limit(20)
  checar(e2)
  const pegos: Trabalho[] = []
  for (const { id } of pend || []) {
    const { data } = await sb.from(FILA)
      .update({ status: 'imprimindo', pego_em: agora.toISOString() })
      .eq('id', id).eq('status', 'pendente')
      .select(CAMPOS).maybeSingle()
    if (data) pegos.push(data as Trabalho)
  }
  return pegos
}

export async function concluir(id: number, ok: boolean, erro?: string) {
  const { error } = await sb.from(FILA)
    .update(ok ? { status: 'impressa', impresso_em: new Date().toISOString(), erro: null } : { status: 'erro', erro: (erro || 'Falha ao imprimir.').slice(0, 500) })
    .eq('id', id).eq('status', 'imprimindo')
  checar(error)
}

/** Manda de novo (novo pedido com as mesmas etiquetas) — qualquer status. */
export async function reenviar(id: number, autor: Autor): Promise<Trabalho> {
  const { data, error } = await sb.from(FILA).select('origem, itens').eq('id', id).maybeSingle()
  checar(error)
  if (!data) throw new Error('Pedido não encontrado.')
  return enfileirar(data.origem as OrigemEtiqueta, data.itens as ItemTermica[], autor)
}

export async function cancelar(id: number) {
  const { error } = await sb.from(FILA).update({ status: 'cancelada' }).eq('id', id).eq('status', 'pendente')
  checar(error)
}

/** Acorda a estação na hora (sem esperar o próximo sinal de 20 s). */
async function avisarEstacao() {
  const canal = sb.channel(CANAL_ESTACAO)
  try { await canal.send({ type: 'broadcast', event: 'nova', payload: { em: new Date().toISOString() } }) }
  catch (e) { console.error('[estacao-impressao] aviso', e) }
  finally { void sb.removeChannel(canal) }
}
