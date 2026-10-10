// REUNIÕES — uma série.
// GET   /api/reunioes/series/:id -> { serie, proxima, usuarios }
// PATCH /api/reunioes/series/:id { campos… }   (admin ou condutor)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { validarSerie } from '@/lib/reunioes/regras'
import { carregarSerie, podeVerSerie, podeGerirSerie, editarSerie, proximaReuniaoDaSerie, usuariosMin, migrationFaltou, MSG_MIGRATION_REUNIOES } from '@/lib/reunioes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { id } = await params
  try {
    const serie = await carregarSerie(id)
    if (!serie || !podeVerSerie(serie, auth)) return NextResponse.json({ error: 'Série não encontrada' }, { status: 404 })
    const proxima = await proximaReuniaoDaSerie(serie.id, new Date().toISOString())
    const usuarios = await usuariosMin([serie.condutor_id, ...serie.secretarios_rodizio, ...serie.participantes_padrao])
    return NextResponse.json({ serie, proxima, usuarios, pode_gerir: podeGerirSerie(serie, auth) })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes/series/id] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar a série' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarSerie(body, false)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  if (!Object.keys(v.campos).length) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })
  try {
    const serie = await carregarSerie(id)
    if (!serie || !podeVerSerie(serie, auth)) return NextResponse.json({ error: 'Série não encontrada' }, { status: 404 })
    if (!podeGerirSerie(serie, auth)) return NextResponse.json({ error: 'Só o condutor ou um administrador alteram a série.' }, { status: 403 })
    const atual = await editarSerie(id, v.campos)
    return NextResponse.json({ serie: atual })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes/series/id] PATCH', e)
    return NextResponse.json({ error: 'Falha ao alterar a série' }, { status: 500 })
  }
}
