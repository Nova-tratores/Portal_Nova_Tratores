// Tarefas (passos) dentro do ticket — Central de Trabalho.
// GET    /api/tickets/:id/tarefas                 -> passos + nomes
// POST   /api/tickets/:id/tarefas { titulo, atribuido_a?, prazo? }
// PATCH  /api/tickets/:id/tarefas { tarefa_id, feita }  ou  { tarefa_id, editar:true, titulo?, atribuido_a?, prazo? }
// DELETE /api/tickets/:id/tarefas?tarefa_id=
// Ler: quem vê o ticket. Mexer: envolvidos, integrantes do quadro ou admin.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, carregarTicket, podeVerTicket, ehParticipanteAtivo, registrarEvento, notificarTicket, envolvidos,
} from '@/lib/tickets/server'
import { carregarQuadro, papeis } from '@/lib/tickets/quadros-server'
import { migrationFaltou } from '@/lib/marketing/erros'
import { passosDoTicket, criarPasso, marcarPasso, removerPasso, editarPasso } from '@/lib/trabalho/tarefas-server'
import { STATUS_FINAIS, type Ticket, type TicketParticipante } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const MSG_MIGRATION = 'As tarefas dentro do ticket ainda não foram ativadas no banco (rode sql/central-trabalho.sql).'

async function podeMexer(t: Ticket, parts: TicketParticipante[], auth: Autenticado) {
  if (STATUS_FINAIS.includes(t.status)) return false // ticket encerrado: tarefas só leitura
  if (auth.isAdmin || t.solicitante_id === auth.userId || t.responsavel_id === auth.userId || ehParticipanteAtivo(parts, auth.userId)) return true
  if (t.quadro_id) { const c = await carregarQuadro(t.quadro_id); return !!c && papeis(c, auth).trabalhar }
  return false
}

async function nomeDe(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return data?.nome || 'Alguém'
}

async function contexto(req: NextRequest, id: string) {
  const auth = await autenticar(req)
  if (!auth) return { resp: erro('Não autenticado', 401) }
  if (!temModuloTickets(auth)) return { resp: erro('Sem permissão', 403) }
  const c = await carregarTicket(id)
  if (!c || !(await podeVerTicket(c.ticket, c.participantes, auth))) return { resp: erro('Ticket não encontrado', 404) }
  return { auth, ...c }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(req, id); if ('resp' in ctx) return ctx.resp
  const passos = await passosDoTicket(id)
  const ids = [...new Set(passos.map((p) => p.atribuido_a).filter(Boolean))] as string[]
  const { data } = ids.length ? await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids) : { data: [] }
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of data || []) usuarios[u.id] = u
  return NextResponse.json({ passos, usuarios, pode_mexer: await podeMexer(ctx.ticket, ctx.participantes, ctx.auth) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(req, id); if ('resp' in ctx) return ctx.resp
  if (!(await podeMexer(ctx.ticket, ctx.participantes, ctx.auth))) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const p = await criarPasso(id, ctx.auth.userId, { titulo: String(body.titulo || ''), atribuido_a: body.atribuido_a ? String(body.atribuido_a) : null, prazo: body.prazo ? String(body.prazo) : null })
    await registrarEvento(id, ctx.auth.userId, 'edicao', { campo: 'tarefa', acao: 'criada', titulo: p.titulo })
    // Quem pediu fica sabendo do que foi acrescentado (e vice-versa) + quem recebeu a tarefa.
    const alvo = [...envolvidos(ctx.ticket, ctx.participantes), ...(p.atribuido_a ? [p.atribuido_a] : [])]
    const autor = await nomeDe(ctx.auth.userId)
    await notificarTicket(ctx.ticket, alvo, ctx.auth.userId,
      `${autor} adicionou uma tarefa no ticket #${ctx.ticket.numero}`, p.titulo, 'tarefa_nova')
    return NextResponse.json({ passo: p })
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION, 503)
    const s = (e as { status?: number }).status
    return erro((e as Error).message || 'Erro', s || 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(req, id); if ('resp' in ctx) return ctx.resp
  if (!(await podeMexer(ctx.ticket, ctx.participantes, ctx.auth))) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    // Editar texto / quem faz / prazo (sem mexer no "feita")
    if (body.editar === true) {
      const { antes, depois } = await editarPasso(id, Number(body.tarefa_id), {
        ...('titulo' in body ? { titulo: String(body.titulo ?? '') } : {}),
        ...('atribuido_a' in body ? { atribuido_a: body.atribuido_a ? String(body.atribuido_a) : null } : {}),
        ...('prazo' in body ? { prazo: body.prazo ? String(body.prazo) : null } : {}),
      })
      const mudou: string[] = []
      if (antes.titulo !== depois.titulo) mudou.push('texto')
      if (antes.atribuido_a !== depois.atribuido_a) mudou.push('quem faz')
      if ((antes.prazo || '').slice(0, 10) !== (depois.prazo || '').slice(0, 10)) mudou.push('prazo')
      if (mudou.length) {
        await registrarEvento(id, ctx.auth.userId, 'edicao', { campo: 'tarefa', acao: 'editada', titulo: depois.titulo, mudou })
        // Quem passou a fazer a tarefa fica sabendo.
        if (depois.atribuido_a && depois.atribuido_a !== antes.atribuido_a) {
          const autor = await nomeDe(ctx.auth.userId)
          await notificarTicket(ctx.ticket, [depois.atribuido_a], ctx.auth.userId,
            `${autor} passou uma tarefa para você no ticket #${ctx.ticket.numero}`, depois.titulo, 'tarefa_nova')
        }
      }
      return NextResponse.json({ passo: depois })
    }
    const r = await marcarPasso(id, Number(body.tarefa_id), body.feita === true)
    await registrarEvento(id, ctx.auth.userId, 'edicao', { campo: 'tarefa', acao: r.concluida ? 'feita' : 'reaberta', titulo: r.titulo })
    if (r.concluida) {
      const autor = await nomeDe(ctx.auth.userId)
      await notificarTicket(ctx.ticket, envolvidos(ctx.ticket, ctx.participantes), ctx.auth.userId,
        `${autor} concluiu uma tarefa do ticket #${ctx.ticket.numero}`, r.titulo, 'tarefa_feita')
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION, 503)
    return erro((e as Error).message || 'Erro', (e as { status?: number }).status || 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(req, id); if ('resp' in ctx) return ctx.resp
  if (!(await podeMexer(ctx.ticket, ctx.participantes, ctx.auth))) return erro('Sem permissão', 403)
  try {
    const r = await removerPasso(id, Number(req.nextUrl.searchParams.get('tarefa_id')))
    await registrarEvento(id, ctx.auth.userId, 'edicao', { campo: 'tarefa', acao: 'removida', titulo: r.titulo })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION, 503)
    const s = (e as { status?: number }).status
    return erro((e as Error).message || 'Erro', s || 500)
  }
}
