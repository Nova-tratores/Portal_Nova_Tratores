/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CENTRAL DE TRABALHO — agenda da pessoa, confirmação de tickets e "Seu dia".
// (SERVIDOR, service role) Migration: sql/central-trabalho.sql.
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { cronogramaAdmin } from '@/lib/cronograma/supabase-server'
import { STATUS_FINAIS } from '@/lib/tickets/constantes'
import { hojeSP } from './cronograma-server'
import { proximoLivre, conflitos, type Ocupacao } from './agenda'

/** O que ocupa os dias da pessoa: etapas do cronograma + tickets com prazo. */
export async function ocupacaoDe(userId: string): Promise<Ocupacao[]> {
  const out: Ocupacao[] = []
  try {
    const db = cronogramaAdmin().schema('cronograma')
    const { data: recs } = await db.from('recursos').select('id').eq('ref_externa', userId)
    const ids = (recs || []).map((r: any) => r.id)
    if (ids.length) {
      const { data: tarefas } = await db.from('tarefas').select('nome, inicio_calc, fim_calc, status, ticket_id').in('recurso_id', ids).in('status', ['pendente', 'em_andamento', 'bloqueada'])
      for (const t of tarefas || []) if (t.inicio_calc && t.fim_calc) out.push({ ini: t.inicio_calc, fim: t.fim_calc, nome: t.nome, ticketId: t.ticket_id || null })
    }
  } catch { /* cronograma indisponível: só tickets */ }
  const { data: tks } = await supabaseAdmin.from('tickets').select('id, titulo, prazo, status')
    .eq('responsavel_id', userId).not('prazo', 'is', null).not('status', 'in', `(${STATUS_FINAIS.join(',')})`)
  const comEtapa = new Set(out.map((o) => o.ticketId).filter(Boolean))
  for (const t of tks || []) if (!comEtapa.has(t.id)) out.push({ ini: t.prazo, fim: t.prazo, nome: t.titulo, ticketId: t.id })
  return out
}

export async function sugestaoAgenda(userId: string, duracao: number, desejado?: string | null) {
  const ocup = await ocupacaoDe(userId)
  const hoje = hojeSP()
  const sugestao = proximoLivre(ocup, hoje, duracao)
  const inicio = desejado || sugestao
  return { hoje, sugestao, ocupacao: ocup, conflitos: conflitos(ocup, inicio, duracao) }
}


// ── Para confirmar + Seu dia ─────────────────────────────────────────────────
export async function pendentesDeAceite(userId: string) {
  try {
    const { data, error } = await supabaseAdmin.from('tickets')
      .select('id, numero, titulo, prazo, solicitante_id, quadro_id, visibilidade, created_at')
      .eq('responsavel_id', userId).eq('aceite', 'pendente').not('status', 'in', `(${STATUS_FINAIS.join(',')})`)
      .order('created_at')
    if (error) return []
    return data || []
  } catch { return [] }
}

export interface ItemDia { tipo: 'andamento' | 'comeca' | 'ticket' | 'tarefa'; texto: string; detalhe?: string; ticketId?: string | null; atrasado?: boolean }

export async function itensDoDia(userId: string): Promise<ItemDia[]> {
  const hoje = hojeSP()
  const itens: ItemDia[] = []
  const ticketsNaEtapa = new Set<string>()
  try {
    const db = cronogramaAdmin().schema('cronograma')
    const { data: recs } = await db.from('recursos').select('id').eq('ref_externa', userId)
    const ids = (recs || []).map((r: any) => r.id)
    if (ids.length) {
      const { data: tarefas } = await db.from('tarefas').select('nome, inicio_calc, fim_calc, status, ticket_id').in('recurso_id', ids).in('status', ['pendente', 'em_andamento'])
      for (const t of tarefas || []) {
        if (t.ticket_id) ticketsNaEtapa.add(t.ticket_id)
        if (t.status === 'em_andamento') itens.push({ tipo: 'andamento', texto: t.nome, detalhe: t.fim_calc ? (t.fim_calc <= hoje ? 'termina hoje' : `previsto até ${br(t.fim_calc)}`) : undefined, ticketId: t.ticket_id, atrasado: !!t.fim_calc && t.fim_calc < hoje })
        else if (t.inicio_calc && t.inicio_calc <= hoje && (!t.fim_calc || t.fim_calc >= hoje)) itens.push({ tipo: 'comeca', texto: t.nome, detalhe: 'começa hoje pelo cronograma', ticketId: t.ticket_id })
      }
    }
  } catch { /* sem cronograma */ }
  const { data: tks } = await supabaseAdmin.from('tickets').select('id, numero, titulo, status, prazo')
    .eq('responsavel_id', userId).not('status', 'in', `(${STATUS_FINAIS.join(',')})`)
  for (const t of tks || []) {
    if (ticketsNaEtapa.has(t.id)) continue
    const vence = t.prazo && t.prazo <= hoje
    if (t.status === 'em_andamento' || vence) itens.push({ tipo: 'ticket', texto: `#${t.numero} ${t.titulo}`, detalhe: t.prazo ? (t.prazo < hoje ? `atrasado desde ${br(t.prazo)}` : t.prazo === hoje ? 'prazo hoje' : `prazo ${br(t.prazo)}`) : 'em andamento', ticketId: t.id, atrasado: !!t.prazo && t.prazo < hoje })
  }
  const { data: tarefas } = await supabaseAdmin.from('portal_tarefas').select('titulo, prazo')
    .eq('atribuido_a', userId).eq('concluida', false).not('prazo', 'is', null).lte('prazo', hoje + 'T23:59:59')
  for (const x of tarefas || []) {
    const d = String(x.prazo).slice(0, 10)
    itens.push({ tipo: 'tarefa', texto: x.titulo, detalhe: d < hoje ? `atrasada desde ${br(d)}` : 'vence hoje', atrasado: d < hoje })
  }
  return itens
}
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export async function diaConfirmado(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('ct_seu_dia').select('dia').eq('user_id', userId).eq('dia', hojeSP()).maybeSingle()
    return !!data
  } catch { return false }
}
export async function confirmarDia(userId: string) {
  await supabaseAdmin.from('ct_seu_dia').upsert({ user_id: userId, dia: hojeSP(), confirmado_em: new Date().toISOString() }, { onConflict: 'user_id,dia' })
}
export async function preferencias(userId: string): Promise<{ atalho_flutuante: boolean }> {
  try {
    const { data } = await supabaseAdmin.from('ct_preferencias').select('atalho_flutuante').eq('user_id', userId).maybeSingle()
    return { atalho_flutuante: data ? data.atalho_flutuante !== false : true }
  } catch { return { atalho_flutuante: true } }
}
export async function salvarPreferencias(userId: string, p: { atalho_flutuante: boolean }) {
  await supabaseAdmin.from('ct_preferencias').upsert({ user_id: userId, atalho_flutuante: p.atalho_flutuante, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}
