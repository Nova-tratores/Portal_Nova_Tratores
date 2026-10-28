// AGENDA PESSOAL — GET /api/agenda/bloqueios?de=&ate= -> { bloqueios (meus, com motivo), reunioes (as minhas), agora }
//                  POST /api/agenda/bloqueios { dia, inicio, fim, motivo? } | { dia_inteiro:true, de, ate, motivo? }
// Cada um só mexe nos próprios bloqueios. Todo usuário logado.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { meusBloqueios, criarBloqueio, migrationFaltou, MSG_MIGRATION_BLOQUEIOS } from '@/lib/agenda/bloqueios-server'
import { validarBloqueio } from '@/lib/agenda/bloqueios'
import { localDe, addDias, isoDe, fimDaReuniao } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Reuniões (não canceladas) em que estou, no período — para a grade "Minha agenda". */
async function minhasReunioes(userId: string, deISO: string, ateISO: string) {
  const { data: pres } = await supabaseAdmin.from('reunioes_presencas').select('reuniao_id').eq('usuario_id', userId).limit(2000)
  const ids = ((pres || []) as { reuniao_id: string }[]).map((p) => p.reuniao_id)
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from('tickets').select('id, numero, titulo, reuniao_inicio, reuniao_etapa, payload')
    .in('id', ids).eq('tipo', 'reuniao').neq('reuniao_etapa', 'cancelada').gte('reuniao_inicio', deISO).lt('reuniao_inicio', ateISO).limit(500)
  return ((data || []) as { id: string; numero: number; titulo: string; reuniao_inicio: string; payload: { duracao_min?: number } | null }[]).map((t) => {
    const l = localDe(t.reuniao_inicio)
    return { id: t.id, numero: t.numero, titulo: t.titulo, inicio: t.reuniao_inicio, fim: isoDe(l.dia, fimDaReuniao(l.hora, Number(t.payload?.duracao_min) || 30)) }
  })
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const agora = localDe(new Date().toISOString())
  const sp = req.nextUrl.searchParams
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('de') || '') ? sp.get('de')! : agora.dia
  let ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('ate') || '') ? sp.get('ate')! : addDias(de, 6)
  if (ate < de) ate = de
  if (ate > addDias(de, 41)) ate = addDias(de, 41)
  const deISO = isoDe(de, '00:00'), ateISO = isoDe(addDias(ate, 1), '00:00')
  try {
    const [bloqueios, reunioes] = await Promise.all([meusBloqueios(auth.userId, deISO, ateISO), minhasReunioes(auth.userId, deISO, ateISO)])
    return NextResponse.json({ bloqueios, reunioes, agora, eu: auth.userId })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ bloqueios: [], reunioes: [], agora, eu: auth.userId, migracaoFaltando: true, error: MSG_MIGRATION_BLOQUEIOS })
    console.error('[agenda/bloqueios] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar a sua agenda' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarBloqueio(body, localDe(new Date().toISOString()))
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    const bloqueio = await criarBloqueio(auth.userId, v.campos)
    return NextResponse.json({ bloqueio })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_BLOQUEIOS }, { status: 503 })
    console.error('[agenda/bloqueios] POST', e)
    return NextResponse.json({ error: 'Falha ao bloquear o horário' }, { status: 500 })
  }
}
