// War Room — snapshots semanais.
// GET  lista os snapshots visíveis ao chamador (núcleo vê a tabela crua; membro
//      vê a view lite, sem caixa/antecipação). O corte é do banco (RLS/views).
// PUT  edita os campos MANUAIS do snapshot ABERTO da semana (SÓ núcleo). Recusa
//      se já fechado. Marca origem[campo]='manual'.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, clienteDoUsuario, carregarSnapshotAberto } from '@/lib/war-room/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { CAMPOS_MANUAIS_SNAPSHOT, farolMargem, farolGiro, farolCaixa } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const supa = clienteDoUsuario(req)
  // Núcleo enxerga a tabela crua (RLS permite); demais recebem 0 linhas dela e
  // caem na view lite. Tentamos a crua e, se vier vazia, a lite.
  const crua = await supa.from('war_room_snapshots').select('*').order('semana_inicio', { ascending: false }).limit(12)
  if (!crua.error && (crua.data?.length || 0) > 0) return NextResponse.json({ snapshots: crua.data, lite: false })
  const lite = await supa.from('v_war_room_snapshots_lite').select('*').order('semana_inicio', { ascending: false }).limit(12)
  if (lite.error) return NextResponse.json({ error: lite.error.message }, { status: 500 })
  return NextResponse.json({ snapshots: lite.data || [], lite: true })
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo edita o snapshot.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const snap = await carregarSnapshotAberto()
  if (!snap) return NextResponse.json({ error: 'Não há snapshot aberto nesta semana.' }, { status: 400 })
  if (snap.fechado_em) return NextResponse.json({ error: 'A reunião da semana já foi fechada — o snapshot é imutável.' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const origem = { ...(snap.origem || {}) }
  for (const campo of CAMPOS_MANUAIS_SNAPSHOT) {
    if (campo in body) {
      patch[campo] = num(body[campo])
      origem[campo] = 'manual'
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nenhum campo manual informado.' }, { status: 400 })

  // Recalcula faróis com os valores resultantes.
  const merged = { ...snap, ...patch }
  patch.origem = origem
  // Edição manual é correção pontual: recomputa os faróis com os valores dados.
  // (A regra das 4 semanas do giro é aplicada só no cron, com o histórico.)
  patch.farol_margem = farolMargem(merged.margem_semana)
  patch.farol_giro = farolGiro(merged.tratores_vendidos, false)
  patch.farol_caixa = farolCaixa(merged.caixa_90d, merged.volume_antecipado)

  const { error } = await supabaseAdmin.from('war_room_snapshots').update(patch).eq('id', snap.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
