// War Room — FECHAR a reunião da semana. Congela a pauta (completa + versão
// lite já filtrada) e carimba fechado_em/por. Depois disso o banco recusa
// UPDATE no snapshot (trigger de imutabilidade). SÓ núcleo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, clienteDoUsuario, carregarSnapshotAberto } from '@/lib/war-room/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PautaItem { so_nucleo?: string }

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo fecha a reunião.' }, { status: 403 })

  const snap = await carregarSnapshotAberto()
  if (!snap) return NextResponse.json({ error: 'Não há snapshot aberto para fechar.' }, { status: 400 })
  if (snap.fechado_em) return NextResponse.json({ error: 'A reunião desta semana já foi fechada.' }, { status: 400 })

  // Lê a pauta como o núcleo (view completa, via token do usuário).
  const supa = clienteDoUsuario(req)
  const { data: pauta } = await supa.from('v_war_room_pauta').select('*')
  const completa = (pauta || []) as PautaItem[]
  // Lite = o que um MEMBRO enxergaria (itens sem flag de núcleo).
  const lite = completa.filter((p) => p.so_nucleo !== 'sim')

  const { error } = await supabaseAdmin
    .from('war_room_snapshots')
    .update({
      pauta_congelada: completa,
      pauta_congelada_lite: lite,
      fechado_em: new Date().toISOString(),
      fechado_por: auth.userId,
    })
    .eq('id', snap.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, itens: completa.length })
}
