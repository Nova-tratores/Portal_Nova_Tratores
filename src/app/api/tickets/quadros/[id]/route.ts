// Tickets — um QUADRO.
// GET   /api/tickets/quadros/:id[?encerrados=1] -> quadro + colunas + integrantes + tickets
// PATCH /api/tickets/quadros/:id { nome?, descricao?, cor?, visibilidade?, arquivado? }  (criador/admin)
// POST  /api/tickets/quadros/:id { acao, ... }                                         (criador/admin)
//   integrante_add { user_ids }   integrante_remover { user_id }
//   coluna_add { nome }   coluna_renomear { coluna_id, nome }
//   coluna_remover { coluna_id, destino_id? }   colunas_ordenar { ids }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { STATUS_FINAIS, type Ticket } from '@/lib/tickets/constantes'
import { validarQuadro, limparNome, destinoAoRemover, ordemValida } from '@/lib/tickets/quadros'
import {
  carregarQuadro, papeis, filtrarUsuariosAtivos, notificarIntegrantes,
  migrationFaltou, MSG_MIGRATION_QUADROS,
} from '@/lib/tickets/quadros-server'
import { etapasDosTickets, projetoDoQuadro } from '@/lib/trabalho/cronograma-server'
import { contagemPassos } from '@/lib/trabalho/tarefas-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

function tratar(e: unknown, ctx: string) {
  if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_QUADROS, migracaoFaltando: true }, { status: 503 })
  console.error(`[tickets/quadros/:id] ${ctx}`, e)
  return erro('Erro inesperado', 500)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const { id } = await params
  try {
    const c = await carregarQuadro(id)
    if (!c) return erro('Quadro não encontrado', 404)
    const p = papeis(c, auth)
    if (!p.ver) return erro('Quadro não encontrado', 404)

    let q = supabaseAdmin.from('tickets').select('*').eq('quadro_id', id)
      .order('ultima_atividade_em', { ascending: false }).limit(1000)
    if (req.nextUrl.searchParams.get('encerrados') !== '1') q = q.not('status', 'in', `(${STATUS_FINAIS.join(',')})`)
    const { data: tickets, error } = await q
    if (error) throw Object.assign(new Error(error.message), { code: error.code })

    const lista = (tickets || []) as Ticket[]
    const ids = [...new Set([c.quadro.criado_por, ...c.membros, ...lista.flatMap((t) => [t.solicitante_id, t.responsavel_id])])]
    const { data: us } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids)
    const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
    for (const u of us || []) usuarios[u.id] = u

    const [etapas, projeto, passos] = await Promise.all([etapasDosTickets(lista.map((t) => t.id)), projetoDoQuadro(id), contagemPassos(lista.map((t) => t.id))])
    return NextResponse.json({
      quadro: c.quadro, colunas: c.colunas, membros: c.membros, tickets: lista, usuarios, etapas, projeto, passos,
      pode_trabalhar: p.trabalhar, pode_gerenciar: p.gerenciar,
    })
  } catch (e) { return tratar(e, 'GET') }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const c = await carregarQuadro(id)
    if (!c || !papeis(c, auth).ver) return erro('Quadro não encontrado', 404)
    if (!papeis(c, auth).gerenciar) return erro('Só quem criou o quadro pode alterar.', 403)
    const v = validarQuadro(body, false)
    if (!v.ok) return erro(v.erro)
    const patch: Record<string, unknown> = { ...v.campos, updated_at: new Date().toISOString() }
    if ('arquivado' in body) patch.arquivado = body.arquivado === true
    const { data, error } = await supabaseAdmin.from('tickets_quadros').update(patch).eq('id', id).select('*').single()
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return NextResponse.json({ quadro: data })
  } catch (e) { return tratar(e, 'PATCH') }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')
  try {
    const c = await carregarQuadro(id)
    if (!c || !papeis(c, auth).ver) return erro('Quadro não encontrado', 404)
    if (!papeis(c, auth).gerenciar) return erro('Só quem criou o quadro pode alterar integrantes e colunas.', 403)

    if (acao === 'integrante_add') {
      const novos = (await filtrarUsuariosAtivos(body.user_ids)).filter((u) => !c.membros.includes(u))
      if (novos.length === 0) return erro('Escolha alguém que ainda não está no quadro.')
      const { error } = await supabaseAdmin.from('tickets_quadro_membros')
        .insert(novos.map((user_id) => ({ quadro_id: id, user_id, adicionado_por: auth.userId })))
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      await notificarIntegrantes(c.quadro, novos, auth.userId)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'integrante_remover') {
      const userId = String(body.user_id || '')
      if (userId === c.quadro.criado_por) return erro('Quem criou o quadro não sai dele.')
      const { error } = await supabaseAdmin.from('tickets_quadro_membros').delete().eq('quadro_id', id).eq('user_id', userId)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      return NextResponse.json({ ok: true })
    }

    if (acao === 'coluna_add') {
      const nome = limparNome(body.nome, 60)
      if (!nome) return erro('Dê um nome à coluna.')
      if (c.colunas.length >= 20) return erro('Limite de 20 colunas por quadro.')
      const posicao = c.colunas.reduce((m, x) => Math.max(m, x.posicao), -1) + 1
      const { data, error } = await supabaseAdmin.from('tickets_quadro_colunas')
        .insert({ quadro_id: id, nome, posicao }).select('*').single()
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      return NextResponse.json({ coluna: data })
    }

    if (acao === 'coluna_renomear') {
      const nome = limparNome(body.nome, 60)
      if (!nome) return erro('Dê um nome à coluna.')
      const col = c.colunas.find((x) => x.id === String(body.coluna_id))
      if (!col) return erro('Coluna não encontrada', 404)
      const { error } = await supabaseAdmin.from('tickets_quadro_colunas').update({ nome }).eq('id', col.id)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      return NextResponse.json({ ok: true })
    }

    if (acao === 'coluna_remover') {
      const colId = String(body.coluna_id || '')
      if (!c.colunas.some((x) => x.id === colId)) return erro('Coluna não encontrada', 404)
      const destino = destinoAoRemover(c.colunas, colId, body.destino_id ? String(body.destino_id) : null)
      if (!destino) return erro('O quadro precisa de pelo menos uma coluna.')
      // Os cartões vão para o destino ANTES de apagar a coluna (nada some).
      const mov = await supabaseAdmin.from('tickets').update({ quadro_coluna_id: destino }).eq('quadro_id', id).eq('quadro_coluna_id', colId)
      if (mov.error) throw Object.assign(new Error(mov.error.message), { code: mov.error.code })
      const { error } = await supabaseAdmin.from('tickets_quadro_colunas').delete().eq('id', colId)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      return NextResponse.json({ ok: true, destino })
    }

    if (acao === 'colunas_ordenar') {
      const ids = ordemValida(c.colunas, body.ids)
      if (!ids) return erro('Ordem inválida — recarregue a página.')
      for (const [posicao, colId] of ids.entries()) {
        const { error } = await supabaseAdmin.from('tickets_quadro_colunas').update({ posicao }).eq('id', colId)
        if (error) throw Object.assign(new Error(error.message), { code: error.code })
      }
      return NextResponse.json({ ok: true })
    }

    return erro('Ação desconhecida')
  } catch (e) { return tratar(e, `POST ${acao}`) }
}
