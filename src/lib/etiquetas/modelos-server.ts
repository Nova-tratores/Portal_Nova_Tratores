// Modelos (padrões) da etiqueta térmica — banco (SÓ SERVIDOR, service role).
// Sem sql/etiquetas-modelos.sql as funções lançam ModelosSemMigracao e a rota
// responde 503 { migracaoFaltando } (a tela só esconde os modelos).

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { normalizarLayout, type LayoutCampo } from '@/lib/opa-pecas/etiqueta-termica'

const TABELA = 'etiquetas_modelos'
export const MAX_MODELOS = 10

export interface ModeloEtiqueta { id: number; nome: string; layout: LayoutCampo[]; ordem: number; atualizado_em: string; atualizado_por_nome: string | null }
export interface Autor { id: string; nome: string }

export class ModelosSemMigracao extends Error {
  constructor() { super('Falta rodar o sql/etiquetas-modelos.sql no Supabase.') }
}
function checar(e: { code?: string; message?: string } | null) {
  if (!e) return
  if (e.code === '42P01' || e.code === 'PGRST205' || (/etiquetas_modelos/.test(e.message || '') && /does not exist|schema cache/i.test(e.message || ''))) throw new ModelosSemMigracao()
  if (e.code === '23505') throw new Error('Já existe um modelo com esse nome.')
  throw new Error(e.message || String(e))
}

/** Nome limpo (1–40) ou erro. */
export function nomeModelo(v: unknown): string | { erro: string } {
  const n = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!n) return { erro: 'Dê um nome ao modelo.' }
  if (n.length > 40) return { erro: 'Nome do modelo com no máximo 40 letras.' }
  return n
}

export async function listarModelos(): Promise<ModeloEtiqueta[]> {
  const { data, error } = await sb.from(TABELA).select('id, nome, layout, ordem, atualizado_em, atualizado_por_nome')
    .order('ordem').order('id')
  checar(error)
  return (data || []).flatMap((m) => {
    const layout = normalizarLayout(m.layout)
    return layout ? [{ ...m, layout } as ModeloEtiqueta] : []
  })
}

export async function criarModelo(nome: string, layout: LayoutCampo[], autor: Autor): Promise<ModeloEtiqueta> {
  const { count, error: e1 } = await sb.from(TABELA).select('id', { count: 'exact', head: true })
  checar(e1)
  if ((count || 0) >= MAX_MODELOS) throw new Error(`No máximo ${MAX_MODELOS} modelos — apague um antes.`)
  const { data, error } = await sb.from(TABELA).insert({
    nome, layout, ordem: count || 0, criado_por: autor.id, criado_nome: autor.nome, atualizado_por_nome: autor.nome,
  }).select('id, nome, layout, ordem, atualizado_em, atualizado_por_nome').single()
  checar(error)
  return data as ModeloEtiqueta
}

export async function atualizarModelo(id: number, mudanca: { nome?: string; layout?: LayoutCampo[] }, autor: Autor) {
  const { data, error } = await sb.from(TABELA)
    .update({ ...mudanca, atualizado_por_nome: autor.nome, atualizado_em: new Date().toISOString() })
    .eq('id', id).select('id')
  checar(error)
  if (!data?.length) throw new Error('Modelo não encontrado.')
}

export async function apagarModelo(id: number) {
  const { error } = await sb.from(TABELA).delete().eq('id', id)
  checar(error)
}
