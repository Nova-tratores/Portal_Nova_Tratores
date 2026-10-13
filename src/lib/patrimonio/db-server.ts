// Patrimônio Loja — acesso ao banco (SÓ servidor, service role). As rotas
// /api/patrimonio/* checam o módulo 'patrimonio' antes de chamar aqui.

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { mudouOnde, type ItemPat, type Movimentacao } from './tipos'

/** Banco sem o sql/patrimonio-01.sql (tabela/coluna inexistente). */
export function semMigracao(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /patrimonio_\w+.*does not exist|Could not find the table/i.test(e.message || ''))
}

const SELECT_ITEM = '*, patrimonio_fotos(id, storage_path, ordem)'

type Linha = Omit<ItemPat, 'fotos'> & { patrimonio_fotos: ItemPat['fotos'] | null; valor_atual: number | string | null; valor_compra: number | string | null }

function normalizar(l: Linha): ItemPat {
  const { patrimonio_fotos, ...resto } = l
  const num = (v: number | string | null) => (v == null || v === '' ? null : Number(v))
  return {
    ...resto,
    valor_atual: num(l.valor_atual),
    valor_compra: num(l.valor_compra),
    tags: l.tags || [],
    fotos: [...(patrimonio_fotos || [])].sort((a, b) => a.ordem - b.ordem),
  }
}

export async function listarItens(): Promise<ItemPat[]> {
  const out: ItemPat[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin.from('patrimonio_itens').select(SELECT_ITEM)
      .is('deleted_at', null).order('criado_em', { ascending: false }).range(de, de + 999)
    if (error) throw error
    out.push(...((data || []) as Linha[]).map(normalizar))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function buscarItem(idOuCodigo: string): Promise<ItemPat | null> {
  const porCodigo = /^PAT-/i.test(idOuCodigo)
  const { data, error } = await supabaseAdmin.from('patrimonio_itens').select(SELECT_ITEM)
    .eq(porCodigo ? 'codigo' : 'id', porCodigo ? idOuCodigo.toUpperCase() : idOuCodigo).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data ? normalizar(data as Linha) : null
}

export async function listarMovimentacoes(itemId: string): Promise<Movimentacao[]> {
  const { data, error } = await supabaseAdmin.from('patrimonio_movimentacoes').select('*').eq('item_id', itemId).order('em', { ascending: false })
  if (error) throw error
  return (data || []) as Movimentacao[]
}

type Quem = { id: string; nome?: string; email?: string }
const nomeDe = (q: Quem) => q.nome || q.email || null

export async function criarItem(dados: Record<string, unknown>, fotos: string[], quem: Quem): Promise<ItemPat> {
  const { data, error } = await supabaseAdmin.from('patrimonio_itens')
    .insert({ ...dados, criado_por: quem.id, atualizado_por: quem.id }).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  if (fotos.length) {
    const { error: ef } = await supabaseAdmin.from('patrimonio_fotos').insert(fotos.map((p, i) => ({ item_id: id, storage_path: p, ordem: i })))
    if (ef) throw ef
  }
  await supabaseAdmin.from('patrimonio_movimentacoes').insert({
    item_id: id, para_local_id: dados.local_id ?? null, para_local_tecnico: dados.local_tecnico ?? null,
    para_responsavel: dados.responsavel ?? null, situacao: dados.situacao ?? null, motivo: 'Cadastro', por: quem.id, por_nome: nomeDe(quem),
  })
  return (await buscarItem(id))!
}

/** Atualiza; se mudou de lugar/mão/situação, registra a movimentação (com o motivo). */
export async function atualizarItem(id: string, dados: Record<string, unknown>, quem: Quem, motivo?: string | null): Promise<ItemPat> {
  const antes = await buscarItem(id)
  if (!antes) throw new Error('Item não encontrado.')
  const { error } = await supabaseAdmin.from('patrimonio_itens')
    .update({ ...dados, atualizado_por: quem.id, atualizado_em: new Date().toISOString() }).eq('id', antes.id)
  if (error) throw error
  const depois = (await buscarItem(antes.id))!
  if (mudouOnde(antes, depois)) {
    await supabaseAdmin.from('patrimonio_movimentacoes').insert({
      item_id: antes.id,
      de_local_id: antes.local_id, de_local_tecnico: antes.local_tecnico, de_responsavel: antes.responsavel,
      para_local_id: depois.local_id, para_local_tecnico: depois.local_tecnico, para_responsavel: depois.responsavel,
      situacao: depois.situacao, motivo: (motivo || '').trim().slice(0, 500) || null, por: quem.id, por_nome: nomeDe(quem),
    })
  }
  return depois
}

export async function adicionarFotos(itemId: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  const { data } = await supabaseAdmin.from('patrimonio_fotos').select('ordem').eq('item_id', itemId).order('ordem', { ascending: false }).limit(1)
  const base = ((data?.[0] as { ordem?: number } | undefined)?.ordem ?? -1) + 1
  const { error } = await supabaseAdmin.from('patrimonio_fotos').insert(paths.map((p, i) => ({ item_id: itemId, storage_path: p, ordem: base + i })))
  if (error) throw error
}

export async function removerFoto(itemId: string, fotoId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('patrimonio_fotos').delete().eq('id', fotoId).eq('item_id', itemId).select('storage_path').maybeSingle()
  if (error) throw error
  return (data as { storage_path?: string } | null)?.storage_path || null
}

/** Excluir = some da lista (deleted_at), o histórico fica. */
export async function excluirItem(id: string, quem: Quem): Promise<void> {
  const { error } = await supabaseAdmin.from('patrimonio_itens')
    .update({ deleted_at: new Date().toISOString(), atualizado_por: quem.id, atualizado_em: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
