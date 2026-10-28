// Tempário vigente = base do código + ajustes da equipe (mecanicos_tempario_ajustes) — SÓ SERVIDOR (José, 28/10/2026).
// Sem a tabela (SQL sql/tempario-ajustes.sql não rodado) vale só o base e salvar responde 503.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TEMPARIO, aplicarAjustes, type AjusteTempario } from './tempario'

const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find/i.test(e.message || ''))
export class SemTabelaTempario extends Error { constructor() { super('Falta rodar o SQL sql/tempario-ajustes.sql (ajustes do tempário).') } }

const CAMPOS = 'id, base_i, baseado_em, codigo, sistema, subsistema, atividade, minutos, motivo, os_origem, criado_por, criado_em'
let cache: { em: number; ajustes: AjusteTempario[]; semTabela: boolean } | null = null

export async function carregarAjustes(forcar = false): Promise<{ ajustes: AjusteTempario[]; semTabela: boolean }> {
  if (!forcar && cache && Date.now() - cache.em < 60_000) return cache
  const { data, error } = await sb.from('mecanicos_tempario_ajustes').select(CAMPOS).eq('ativo', true).order('criado_em', { ascending: true }).limit(5000)
  if (error && !falta(error)) throw new Error(error.message)
  cache = { em: Date.now(), ajustes: (data || []) as unknown as AjusteTempario[], semTabela: !!error }
  return cache
}

/** O tempário que a previsão usa e uma "versão" (muda a cada ajuste → as OS são reavaliadas). */
export async function temparioVigente() {
  const { ajustes } = await carregarAjustes().catch(() => ({ ajustes: [] as AjusteTempario[] }))
  const lista = ajustes.length ? aplicarAjustes(TEMPARIO, ajustes) : TEMPARIO
  const versao = ajustes.length ? `${ajustes.length}-${ajustes.reduce((m, a) => Math.max(m, a.id), 0)}` : '0'
  return { lista, versao }
}

export async function salvarAjuste(a: {
  base_i: number | null; baseado_em: number | null; codigo?: string | null; sistema?: string | null; subsistema?: string | null
  atividade: string; minutos: number | null; motivo: string; os_origem?: string | null
}, autor: { id: string; nome: string }): Promise<AjusteTempario> {
  if (!String(a.atividade || '').trim()) throw new Error('Descreva a atividade')
  if (!String(a.motivo || '').trim()) throw new Error('Diga o motivo da mudança')
  if (a.minutos != null && !(a.minutos > 0 && a.minutos <= 6000)) throw new Error('Tempo inválido')
  if (a.base_i != null && !TEMPARIO.some((t) => t.i === a.base_i)) throw new Error('Atividade do tempário não encontrada')
  const { data, error } = await sb.from('mecanicos_tempario_ajustes').insert({
    base_i: a.base_i, baseado_em: a.baseado_em, codigo: a.codigo || null, sistema: a.sistema || null, subsistema: a.subsistema || null,
    atividade: a.atividade.trim().slice(0, 400), minutos: a.minutos == null ? null : Math.round(a.minutos), motivo: a.motivo.trim().slice(0, 400),
    os_origem: a.os_origem || null, criado_por: autor.nome, criado_por_id: autor.id,
  }).select(CAMPOS).single()
  if (error) { if (falta(error)) throw new SemTabelaTempario(); throw new Error(error.message) }
  await carregarAjustes(true)
  return data as unknown as AjusteTempario
}

/** Desfaz um ajuste (fica no banco como inativo). */
export async function desfazerAjuste(id: number) {
  const { error } = await sb.from('mecanicos_tempario_ajustes').update({ ativo: false }).eq('id', id)
  if (error) { if (falta(error)) throw new SemTabelaTempario(); throw new Error(error.message) }
  await carregarAjustes(true)
}
