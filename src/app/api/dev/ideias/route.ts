// IDEIAS DOS DEVS — só quem tem papel Dev (auth.isDev).
// GET   /api/dev/ideias[?arquivadas=1] -> { ideias, grupos, usuarios, tickets }
// POST  /api/dev/ideias { texto, grupo_id? } -> { ideia }
// PATCH /api/dev/ideias { id, texto? | grupo_id? | arquivada? | posicao? }
//                        ou { ids: uuid[], grupo_id: uuid|null } (mover várias)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import { validarIdeia } from '@/lib/dev/ideias'
import {
  listarTudo, criarIdeia, editarIdeia, moverIdeias, carregarGrupo, resumoTickets,
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

export async function GET(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  try {
    const dados = await listarTudo(req.nextUrl.searchParams.get('arquivadas') === '1')
    const tickets = await resumoTickets(dados.grupos.map((x) => x.ticket_id).filter((x): x is string => !!x))
    return NextResponse.json({ ...dados, tickets })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ ideias: [], grupos: [], usuarios: {}, tickets: {}, migracaoFaltando: true, error: MSG_MIGRATION_IDEIAS })
    console.error('[dev/ideias] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar as ideias' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarIdeia(body.texto)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    let grupoId: string | null = null
    if (body.grupo_id) {
      if (!uuidValido(body.grupo_id) || !(await carregarGrupo(body.grupo_id))) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
      grupoId = body.grupo_id
    }
    const ideia = await criarIdeia(g.auth.userId, v.campos.texto, grupoId)
    await registrarAuditLog({
      userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias', acao: 'criar',
      entidade: 'dev_ideias', entidadeId: ideia.id, entidadeLabel: ideia.texto.slice(0, 80),
    })
    return NextResponse.json({ ideia })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_IDEIAS }, { status: 503 })
    console.error('[dev/ideias] POST', e)
    return NextResponse.json({ error: 'Falha ao salvar a ideia' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guardar(req)
  if (g.erro) return g.erro
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    // Mover várias de uma vez (agrupar / tirar do grupo).
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter(uuidValido)
      if (!ids.length) return NextResponse.json({ error: 'Nenhuma ideia selecionada' }, { status: 400 })
      let grupoId: string | null = null
      if (body.grupo_id) {
        if (!uuidValido(body.grupo_id) || !(await carregarGrupo(body.grupo_id))) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
        grupoId = body.grupo_id
      }
      const n = await moverIdeias(ids, grupoId)
      await registrarAuditLog({
        userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias', acao: grupoId ? 'agrupar' : 'desagrupar',
        entidade: 'dev_ideias_grupos', entidadeId: grupoId || undefined, detalhes: { ideias: ids, movidas: n },
      })
      return NextResponse.json({ movidas: n })
    }

    if (!uuidValido(body.id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const campos: Record<string, unknown> = {}
    if (body.texto !== undefined) {
      const v = validarIdeia(body.texto)
      if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
      campos.texto = v.campos.texto
    }
    if (body.grupo_id !== undefined) {
      if (body.grupo_id === null || body.grupo_id === '') campos.grupo_id = null
      else {
        if (!uuidValido(body.grupo_id) || !(await carregarGrupo(body.grupo_id))) return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
        campos.grupo_id = body.grupo_id
      }
    }
    if (body.arquivada !== undefined) campos.arquivada = !!body.arquivada
    if (body.posicao !== undefined) campos.posicao = Math.max(0, Math.trunc(Number(body.posicao) || 0))
    if (!Object.keys(campos).length) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })
    const ideia = await editarIdeia(body.id, campos)
    if (!ideia) return NextResponse.json({ error: 'Ideia não encontrada' }, { status: 404 })
    await registrarAuditLog({
      userId: g.auth.userId, userName: g.auth.email || 'dev', sistema: 'ideias',
      acao: campos.arquivada === true ? 'arquivar' : campos.texto !== undefined ? 'editar' : 'mover',
      entidade: 'dev_ideias', entidadeId: ideia.id, entidadeLabel: ideia.texto.slice(0, 80), detalhes: campos,
    })
    return NextResponse.json({ ideia })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_IDEIAS }, { status: 503 })
    console.error('[dev/ideias] PATCH', e)
    return NextResponse.json({ error: 'Falha ao alterar a ideia' }, { status: 500 })
  }
}
