// IDEIAS DOS DEVS — grupos (2º passo) e ligação ao ticket (3º passo). Só Dev.
// POST   /api/dev/ideias/grupos { nome, descricao?, cor?, ideias?: uuid[] } -> { grupo }
// PATCH  /api/dev/ideias/grupos { id, nome? | descricao? | cor? | ticket_id?: uuid|null } -> { grupo }
// DELETE /api/dev/ideias/grupos?id=   (desfaz o grupo; planejado recusa 409)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { validarGrupo } from '@/lib/dev/ideias'
import {
  criarGrupo, editarGrupo, carregarGrupo, apagarGrupo, moverIdeias, ticketExiste,
  uuidValido, migrationFaltou, MSG_MIGRATION_IDEIAS,
} from '@/lib/dev/ideias-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guardar(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  if (!auth.isDev) return { erro: NextResponse.json({ error: 'Só o Dev acessa as ideias.' }, { status: 403 }) }
  return { auth }
}

export async function POST(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarGrupo(body, true)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    const grupo = await criarGrupo(g.auth.userId, v.campos as { nome: string; descricao?: string | null; cor?: string | null })
    const ideias = Array.isArray(body.ideias) ? body.ideias.filter(uuidValido) : []
    const movidas = ideias.length ? await moverIdeias(ideias, grupo.id) : 0
    await registrarAuditLog({
      userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias', acao: 'agrupar',
      entidade: 'dev_ideias_grupos', entidadeId: grupo.id, entidadeLabel: grupo.nome, detalhes: { ideias, movidas },
    })
    return NextResponse.json({ grupo, movidas })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_IDEIAS }, { status: 503 })
    console.error('[dev/ideias/grupos] POST', e)
    return NextResponse.json({ error: 'Falha ao criar o grupo' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!uuidValido(body.id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const v = validarGrupo(body, false)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    const atual = await carregarGrupo(body.id)
    if (!atual) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
    const campos: Record<string, unknown> = { ...v.campos }
    let acao = 'editar_grupo'
    if (body.ticket_id !== undefined) {
      if (body.ticket_id === null || body.ticket_id === '') { campos.ticket_id = null; acao = 'desplanejar' }
      else {
        const t = await ticketExiste(String(body.ticket_id))
        if (!t) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
        campos.ticket_id = t.id
        acao = 'planejar'
      }
    }
    if (!Object.keys(campos).length) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })
    const grupo = await editarGrupo(body.id, campos)
    await registrarAuditLog({
      userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias', acao,
      entidade: 'dev_ideias_grupos', entidadeId: body.id, entidadeLabel: grupo?.nome || atual.nome, detalhes: campos,
    })
    return NextResponse.json({ grupo })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_IDEIAS }, { status: 503 })
    console.error('[dev/ideias/grupos] PATCH', e)
    return NextResponse.json({ error: 'Falha ao alterar o grupo' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!uuidValido(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  try {
    const atual = await carregarGrupo(id)
    if (!atual) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
    if (atual.ticket_id) return NextResponse.json({ error: 'Esse grupo já virou ticket — não dá para desfazer. Arquive as ideias se quiser.' }, { status: 409 })
    await apagarGrupo(id)
    await registrarAuditLog({
      userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias', acao: 'desfazer_grupo',
      entidade: 'dev_ideias_grupos', entidadeId: id, entidadeLabel: atual.nome,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_IDEIAS }, { status: 503 })
    console.error('[dev/ideias/grupos] DELETE', e)
    return NextResponse.json({ error: 'Falha ao desfazer o grupo' }, { status: 500 })
  }
}
