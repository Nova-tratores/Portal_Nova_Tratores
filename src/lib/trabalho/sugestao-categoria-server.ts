// SUGESTÃO DE TEMPO POR CATEGORIA (melhorias 2.1, 24/11/2026).
// Mediana do tempo real dos pedidos concluídos de cada categoria (mínimo 5 amostras).
// Tempo real de um pedido = cronômetro do Modo Agora (tickets_tempo) quando existe; senão, o
// tempo ÚTIL entre "começou" (1º evento status → em_andamento) e "resolveu" (último → resolvido),
// contando só seg–sex 07:30–17:30 e metade dele (a pessoa tem 4,5 de 9 h do dia para a fila).
// Cache de 10 min em memória: a conta é a mesma para todo mundo.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { horasUteisEntre } from './estimativa'

export interface Mediana { horas: number; n: number }
const MINIMO = 5
let cache: { quando: number; mapa: Map<string, Mediana> } | null = null

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Tempo real (horas) dos pedidos concluídos, por id. Também usado no fator pessoal. */
export async function temposReais(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!ids.length) return out
  const [tempo, ev] = await Promise.all([
    supabaseAdmin.from('tickets_tempo').select('ticket_id, inicio, fim').in('ticket_id', ids).not('fim', 'is', null),
    supabaseAdmin.from('tickets_eventos').select('ticket_id, payload, created_at').eq('tipo', 'status').in('ticket_id', ids).order('created_at'),
  ])
  const cron = new Map<string, number>()
  if (!tempo.error) for (const l of (tempo.data || []) as { ticket_id: string; inicio: string; fim: string }[]) {
    cron.set(l.ticket_id, (cron.get(l.ticket_id) || 0) + (Date.parse(l.fim) - Date.parse(l.inicio)) / 3600000)
  }
  const ini = new Map<string, string>(), fim = new Map<string, string>()
  for (const e of (ev.data || []) as { ticket_id: string; payload: { para?: string } | null; created_at: string }[]) {
    if (e.payload?.para === 'em_andamento' && !ini.has(e.ticket_id)) ini.set(e.ticket_id, e.created_at)
    if (e.payload?.para === 'resolvido') fim.set(e.ticket_id, e.created_at)
  }
  for (const id of ids) {
    const c = cron.get(id)
    if (c && c >= 0.25) { out.set(id, c); continue }
    const a = ini.get(id), b = fim.get(id)
    if (a && b && b > a) { const h = horasUteisEntre(a, b) / 2; if (h >= 0.25) out.set(id, h) }
  }
  return out
}

/** categoria → { horas (mediana, de 15 em 15 min), n }. Só categorias com 5+ amostras. */
export async function medianasPorCategoria(): Promise<Map<string, Mediana>> {
  if (cache && Date.now() - cache.quando < 10 * 60 * 1000) return cache.mapa
  const desde = new Date(Date.now() - 365 * 86400000).toISOString()
  const { data } = await supabaseAdmin.from('tickets').select('id, categoria')
    .eq('tipo', 'generico').in('status', ['resolvido', 'fechado']).gte('created_at', desde).limit(1500)
  const lista = (data || []) as { id: string; categoria: string | null }[]
  const reais = await temposReais(lista.map((t) => t.id))
  const por = new Map<string, number[]>()
  for (const t of lista) {
    const h = reais.get(t.id); const cat = (t.categoria || '').trim()
    if (!h || !cat) continue
    por.set(cat, [...(por.get(cat) || []), h])
  }
  const mapa = new Map<string, Mediana>()
  for (const [cat, xs] of por) if (xs.length >= MINIMO) mapa.set(cat, { horas: Math.max(0.25, Math.round(mediana(xs) * 4) / 4), n: xs.length })
  cache = { quando: Date.now(), mapa }
  return mapa
}

/**
 * "Você costuma levar 1,8× o que estima" (melhorias 2.1 · bônus): mediana de real ÷ estimado nos
 * últimos 30 pedidos concluídos da pessoa que têm os dois. null = menos de 3 casos.
 */
export async function fatorPessoal(userId: string): Promise<{ fator: number; n: number } | null> {
  const { data } = await supabaseAdmin.from('tickets').select('id, payload')
    .eq('responsavel_id', userId).in('status', ['resolvido', 'fechado']).order('updated_at', { ascending: false }).limit(30)
  const est = new Map<string, number>()
  for (const t of (data || []) as { id: string; payload: { dias?: number; horas_dia?: number } | null }[]) {
    if (t.payload?.horas_dia) est.set(t.id, (t.payload.dias || 1) * t.payload.horas_dia)
  }
  if (est.size < 3) return null
  const reais = await temposReais([...est.keys()])
  const razoes = [...est].filter(([id]) => reais.has(id)).map(([id, e]) => reais.get(id)! / e)
  if (razoes.length < 3) return null
  return { fator: Math.round(mediana(razoes) * 10) / 10, n: razoes.length }
}
