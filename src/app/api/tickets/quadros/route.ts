// Tickets — QUADROS: lista e criação.
// GET  /api/tickets/quadros[?arquivados=1] -> quadros que o usuário enxerga
// POST /api/tickets/quadros { nome, descricao?, cor?, visibilidade?, integrantes?: uuid[] }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { validarQuadro } from '@/lib/tickets/quadros'
import {
  listarQuadros, criarQuadro, filtrarUsuariosAtivos, notificarIntegrantes,
  migrationFaltou, MSG_MIGRATION_QUADROS,
} from '@/lib/tickets/quadros-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const quadros = await listarQuadros(auth, req.nextUrl.searchParams.get('arquivados') === '1')
    const ids = [...new Set(quadros.flatMap((q) => [q.criado_por, ...q.membros]))]
    const { data } = ids.length
      ? await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids)
      : { data: [] }
    const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
    for (const u of data || []) usuarios[u.id] = u
    return NextResponse.json({ quadros, usuarios })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ quadros: [], usuarios: {}, migracaoFaltando: true, error: MSG_MIGRATION_QUADROS })
    console.error('[tickets/quadros] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar os quadros' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarQuadro(body, true)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    const integrantes = await filtrarUsuariosAtivos(body.integrantes)
    const quadro = await criarQuadro(auth, v.campos as Parameters<typeof criarQuadro>[1], integrantes)
    await notificarIntegrantes(quadro, integrantes, auth.userId)
    return NextResponse.json({ quadro })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_QUADROS }, { status: 503 })
    console.error('[tickets/quadros] POST', e)
    return NextResponse.json({ error: 'Falha ao criar o quadro' }, { status: 500 })
  }
}
