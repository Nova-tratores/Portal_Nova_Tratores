// Estação de impressão da térmica — banco (SÓ SERVIDOR, service role).
// Regras puras em ./estacao. Sem sql/etiquetas-estacao.sql (ou sem sql/etiquetas-estacoes-varias.sql)
// as funções lançam EstacaoSemMigracao e as rotas respondem 503 { migracaoFaltando }.
// Várias estações (19/11/2026): cada PC com impressora é uma linha em etiquetas_estacao; cada pedido
// diz para qual vai (estacao_id); cada pessoa guarda para onde manda (etiquetas_destino_usuario).

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'
import {
  CANAL_ESTACAO, ESTACAO_ID, ESTACAO_TRAVADO_MS, estacaoOnline, idEstacaoValido,
  type OrigemEtiqueta, type SituacaoEstacao, type Trabalho,
} from './estacao'

const FILA = 'etiquetas_estacao_fila'
const ESTACAO = 'etiquetas_estacao'
const DESTINO = 'etiquetas_destino_usuario'
const CAMPOS = 'id, origem, itens, total, status, erro, criado_nome, criado_em, pego_em, impresso_em'

export class EstacaoSemMigracao extends Error {
  constructor() { super('Falta rodar o sql/etiquetas-estacoes-varias.sql no Supabase.') }
}
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204'
    || /etiquetas_(estacao|destino)/.test(e.message || '') && /does not exist|schema cache/i.test(e.message || ''))
function checar(e: { code?: string; message?: string } | null) {
  if (!e) return
  if (semTabela(e)) throw new EstacaoSemMigracao()
  throw new Error(e.message || String(e))
}

export interface Autor { id: string; nome: string }

/** Todas as estações (ligadas primeiro), com quantos pedidos esperam em cada. */
export async function estacoes(): Promise<SituacaoEstacao[]> {
  const [{ data: est, error: e1 }, { data: fila, error: e2 }] = await Promise.all([
    sb.from(ESTACAO).select('id, nome, ultimo_sinal, sinal_nome'),
    sb.from(FILA).select('estacao_id').in('status', ['pendente', 'imprimindo']),
  ])
  checar(e1); checar(e2)
  const pend: Record<string, number> = {}
  for (const f of fila || []) pend[f.estacao_id] = (pend[f.estacao_id] || 0) + 1
  return (est || []).map((e) => ({
    id: e.id,
    nome: e.nome || 'Impressora',
    online: estacaoOnline(e.ultimo_sinal),
    ultimoSinal: e.ultimo_sinal || null,
    sinalNome: e.sinal_nome || null,
    pendentes: pend[e.id] || 0,
  })).sort((a, b) => Number(b.online) - Number(a.online) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Para onde a pessoa manda as etiquetas: 'local', o id de uma estação, ou null (ainda não escolheu). */
export async function lerDestinoUsuario(usuarioId: string): Promise<string | null> {
  const { data, error } = await sb.from(DESTINO).select('destino').eq('usuario_id', usuarioId).maybeSingle()
  checar(error)
  return data?.destino || null
}

export async function salvarDestinoUsuario(usuarioId: string, destino: string) {
  if (destino !== 'local') {
    const { data, error } = await sb.from(ESTACAO).select('id').eq('id', destino).maybeSingle()
    checar(error)
    if (!data) throw new Error('Essa impressora não existe mais. Escolha outra.')
  }
  const { error } = await sb.from(DESTINO).upsert({ usuario_id: usuarioId, destino, atualizado_em: new Date().toISOString() }, { onConflict: 'usuario_id' })
  checar(error)
}

export async function enfileirar(origem: OrigemEtiqueta, itens: ItemTermica[], autor: Autor, estacaoId = ESTACAO_ID): Promise<Trabalho> {
  const { data, error } = await sb.from(FILA)
    .insert({ origem, itens, total: itens.length, criado_por: autor.id, criado_nome: autor.nome, estacao_id: estacaoId })
    .select(CAMPOS).single()
  checar(error)
  await avisarEstacao(estacaoId)
  return data as Trabalho
}

/** Últimos pedidos de uma estação (painel da estação). */
export async function recentes(estacaoId = ESTACAO_ID, limite = 40): Promise<Trabalho[]> {
  const { data, error } = await sb.from(FILA).select(CAMPOS).eq('estacao_id', estacaoId).order('criado_em', { ascending: false }).limit(limite)
  checar(error)
  return (data || []) as Trabalho[]
}

/** A estação dá sinal de vida (e grava o nome que deram a ela) e PEGA os pedidos pendentes DELA (um UPDATE
 *  condicional por pedido: duas janelas abertas nunca imprimem o mesmo). Pedido que ficou "imprimindo" sem
 *  resposta vira erro — não reimprime sozinho (pode ter saído). */
export async function sinalEPegar(autor: Autor, info: Record<string, unknown>, estacao: { id: string; nome: string | null }): Promise<Trabalho[]> {
  if (!idEstacaoValido(estacao.id)) throw new Error('Estação inválida.')
  const agora = new Date()
  const linha: Record<string, unknown> = { id: estacao.id, ultimo_sinal: agora.toISOString(), sinal_por: autor.id, sinal_nome: autor.nome, info }
  if (estacao.nome) linha.nome = estacao.nome
  else {
    // estação sem nome mandado (a antiga 'termica'): mantém o que está no banco
    const { data } = await sb.from(ESTACAO).select('nome').eq('id', estacao.id).maybeSingle()
    linha.nome = data?.nome || 'Impressora'
  }
  const { error: e1 } = await sb.from(ESTACAO).upsert(linha, { onConflict: 'id' })
  checar(e1)
  await sb.from(FILA)
    .update({ status: 'erro', erro: 'A estação parou no meio da impressão — confira se saiu e, se não, imprima de novo.' })
    .eq('estacao_id', estacao.id).eq('status', 'imprimindo').lt('pego_em', new Date(agora.getTime() - ESTACAO_TRAVADO_MS).toISOString())

  const { data: pend, error: e2 } = await sb.from(FILA).select('id').eq('estacao_id', estacao.id).eq('status', 'pendente').order('criado_em').limit(20)
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

/** Manda de novo (novo pedido com as mesmas etiquetas, para a mesma estação) — qualquer status. */
export async function reenviar(id: number, autor: Autor): Promise<Trabalho> {
  const { data, error } = await sb.from(FILA).select('origem, itens, estacao_id').eq('id', id).maybeSingle()
  checar(error)
  if (!data) throw new Error('Pedido não encontrado.')
  return enfileirar(data.origem as OrigemEtiqueta, data.itens as ItemTermica[], autor, data.estacao_id || ESTACAO_ID)
}

export async function cancelar(id: number) {
  const { error } = await sb.from(FILA).update({ status: 'cancelada' }).eq('id', id).eq('status', 'pendente')
  checar(error)
}

/** Acorda a estação na hora (sem esperar o próximo sinal de 20 s). */
async function avisarEstacao(estacaoId: string) {
  const canal = sb.channel(CANAL_ESTACAO)
  try { await canal.send({ type: 'broadcast', event: 'nova', payload: { em: new Date().toISOString(), estacao: estacaoId } }) }
  catch (e) { console.error('[estacao-impressao] aviso', e) }
  finally { void sb.removeChannel(canal) }
}
