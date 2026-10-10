// REUNIÕES — séries ("Semanal Oficina"…).
// GET  /api/reunioes/series[?inativas=1]  -> { series, usuarios }
// POST /api/reunioes/series { nome, condutor_id, secretarios_rodizio?, participantes_padrao?, recorrencia?, dia_semana?, hora?, duracao_min?, corte_antecedencia_horas?, visibilidade? }
//   Qualquer pessoa com a Central cria uma série (ela é o condutor por padrão); admin cria para outros.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloTickets } from '@/lib/tickets/server'
import { validarSerie } from '@/lib/reunioes/regras'
import { listarSeries, criarSerie, usuariosMin, migrationFaltou, MSG_MIGRATION_REUNIOES } from '@/lib/reunioes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const series = await listarSeries(auth, req.nextUrl.searchParams.get('inativas') === '1')
    const usuarios = await usuariosMin(series.flatMap((s) => [s.condutor_id, ...s.secretarios_rodizio, ...s.participantes_padrao]))
    return NextResponse.json({ series, usuarios })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ series: [], usuarios: {}, migracaoFaltando: true, error: MSG_MIGRATION_REUNIOES })
    console.error('[reunioes/series] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar as séries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (body.condutor_id === undefined) body.condutor_id = auth.userId
  const v = validarSerie(body, true)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  if (v.campos.condutor_id !== auth.userId && !auth.isAdmin) return NextResponse.json({ error: 'Só um administrador cria série para outro condutor.' }, { status: 403 })
  try {
    const serie = await criarSerie(auth, v.campos)
    return NextResponse.json({ serie })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_REUNIOES }, { status: 503 })
    console.error('[reunioes/series] POST', e)
    return NextResponse.json({ error: 'Falha ao criar a série' }, { status: 500 })
  }
}
