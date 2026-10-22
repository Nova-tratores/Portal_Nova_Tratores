// Transferência Peças S/Estoque ↔ Patrimônio Loja — banco e fotos (SÓ servidor,
// service role). Regras e textos em opa-transferencia.ts. As fotos são COPIADAS
// para o bucket do destino (pasta do usuário que transferiu, como se ele tivesse
// enviado), com a miniatura _mini quando existir.
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { patrimonioDaPeca, pecaDoPatrimonio, type PecaOrigem, type PatrimonioOrigem } from './opa-transferencia'

const BUCKET_PECAS = 'pni-fotos'
const BUCKET_PAT = 'patrimonio-fotos'
const mini = (p: string) => p.replace(/\.jpg$/i, '_mini.jpg')

export class ErroTransferencia extends Error {
  constructor(msg: string, public status = 400) { super(msg) }
}

type Quem = { id: string; nome: string }

async function copiarFotos(origem: string, destino: string, paths: string[], userId: string): Promise<string[]> {
  const novos: string[] = []
  for (const p of paths) {
    const { data, error } = await supabaseAdmin.storage.from(origem).download(p)
    if (error || !data) continue // foto sumida no storage: segue sem ela
    const novo = `${userId}/${randomUUID()}.jpg`
    const up = await supabaseAdmin.storage.from(destino).upload(novo, data, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new ErroTransferencia(`Não consegui copiar uma foto: ${up.error.message}`, 500)
    const m = await supabaseAdmin.storage.from(origem).download(mini(p))
    if (!m.error && m.data) await supabaseAdmin.storage.from(destino).upload(mini(novo), m.data, { contentType: 'image/jpeg', upsert: false })
    novos.push(novo)
  }
  return novos
}

/** O motivo vai na linha de histórico que a trigger das Peças acabou de gravar. */
async function motivoNoHistorico(itemId: string, campo: 'exclusao' | 'criacao', motivo: string) {
  const { data } = await supabaseAdmin.from('pni_historico').select('id').eq('item_id', itemId).eq('campo', campo)
    .order('em', { ascending: false }).limit(1)
  const id = (data?.[0] as { id?: number } | undefined)?.id
  if (id != null) await supabaseAdmin.from('pni_historico').update({ motivo }).eq('id', id)
}

/** Peça → Patrimônio. Devolve o código do item novo (PAT-…). */
export async function pecaParaPatrimonio(pecaId: string, quem: Quem): Promise<{ codigo: string; id: string }> {
  const { data: peca, error } = await supabaseAdmin.from('pni_itens').select('*').eq('id', pecaId).is('deleted_at', null).maybeSingle()
  if (error) throw error
  if (!peca) throw new ErroTransferencia('Peça não encontrada (já foi transferida ou excluída?).', 404)
  const { data: fotos } = await supabaseAdmin.from('pni_fotos').select('storage_path, ordem').eq('item_id', pecaId).is('deleted_at', null).order('ordem')

  const copias = await copiarFotos(BUCKET_PECAS, BUCKET_PAT, (fotos || []).map((f) => f.storage_path), quem.id)
  const dados = patrimonioDaPeca(peca as PecaOrigem)
  const { data: novo, error: e1 } = await supabaseAdmin.from('patrimonio_itens')
    .insert({ ...dados, criado_por: quem.id, atualizado_por: quem.id }).select('id, codigo').single()
  if (e1) throw e1
  const pat = novo as { id: string; codigo: string }
  if (copias.length) {
    const { error: ef } = await supabaseAdmin.from('patrimonio_fotos').insert(copias.map((p, i) => ({ item_id: pat.id, storage_path: p, ordem: i })))
    if (ef) throw ef
  }
  await supabaseAdmin.from('patrimonio_movimentacoes').insert({
    item_id: pat.id, para_local_id: dados.local_id ?? null, para_local_tecnico: dados.local_tecnico ?? null,
    situacao: dados.situacao, motivo: `Transferido das Peças S/Estoque (${(peca as { codigo: string }).codigo})`, por: quem.id, por_nome: quem.nome,
  })

  // sai das Peças: exclusão lógica (o código não volta a circular) com o motivo no histórico
  const { error: e2 } = await supabaseAdmin.from('pni_itens')
    .update({ deleted_at: new Date().toISOString(), deleted_por: quem.id, atualizado_por: quem.id }).eq('id', pecaId)
  if (e2) throw e2
  await motivoNoHistorico(pecaId, 'exclusao', `Transferida para o Patrimônio Loja (${pat.codigo}) por ${quem.nome}`)
  return pat
}

/** Patrimônio → Peças (entra na verificação). Devolve o código da peça nova (CAP-…). */
export async function patrimonioParaPeca(patId: string, quem: Quem): Promise<{ codigo: string; id: string }> {
  const { data: item, error } = await supabaseAdmin.from('patrimonio_itens').select('*').eq('id', patId).is('deleted_at', null).maybeSingle()
  if (error) throw error
  if (!item) throw new ErroTransferencia('Item do Patrimônio não encontrado.', 404)
  const it = item as PatrimonioOrigem & { id: string; situacao: string | null; local_id: string | null; local_tecnico: string | null; responsavel: string | null }
  if (it.situacao === 'baixado') throw new ErroTransferencia('Este item já está baixado no Patrimônio.', 409)
  const { data: fotos } = await supabaseAdmin.from('patrimonio_fotos').select('storage_path, ordem').eq('item_id', patId).order('ordem')

  const copias = await copiarFotos(BUCKET_PAT, BUCKET_PECAS, (fotos || []).map((f) => f.storage_path), quem.id)
  const { data: novo, error: e1 } = await supabaseAdmin.from('pni_itens')
    .insert({ ...pecaDoPatrimonio(it), criado_por: quem.id, atualizado_por: quem.id }).select('id, codigo').single()
  if (e1) throw e1
  const peca = novo as { id: string; codigo: string }
  if (copias.length) {
    const { error: ef } = await supabaseAdmin.from('pni_fotos')
      .insert(copias.map((p, i) => ({ item_id: peca.id, storage_path: p, ordem: i, criado_por: quem.id })))
    if (ef) throw ef
  }
  await motivoNoHistorico(peca.id, 'criacao', `Transferida do Patrimônio Loja (${it.codigo}) por ${quem.nome}`)

  // no Patrimônio fica BAIXADO, com o motivo na movimentação
  const { error: e2 } = await supabaseAdmin.from('patrimonio_itens')
    .update({ situacao: 'baixado', atualizado_por: quem.id, atualizado_em: new Date().toISOString() }).eq('id', patId)
  if (e2) throw e2
  await supabaseAdmin.from('patrimonio_movimentacoes').insert({
    item_id: patId,
    de_local_id: it.local_id, de_local_tecnico: it.local_tecnico, de_responsavel: it.responsavel,
    para_local_id: it.local_id, para_local_tecnico: it.local_tecnico, para_responsavel: it.responsavel,
    situacao: 'baixado', motivo: `Transferido para as Peças S/Estoque (${peca.codigo})`, por: quem.id, por_nome: quem.nome,
  })
  return peca
}
