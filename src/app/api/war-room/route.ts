// War Room — GET AGREGADO: um payload com tudo que a página precisa numa só
// chamada. As leituras sensíveis passam pelo cliente COM TOKEN do usuário
// (RLS/views aplicam o corte núcleo/membro no banco — nunca só na UI).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloWarRoom, nivelDoUsuario, clienteDoUsuario } from '@/lib/war-room/server'
import { PONTE_ALVO_TOTAL, PONTE_ALVO_DATA } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const supa = clienteDoUsuario(req)
  const meu_nivel = await nivelDoUsuario(auth)

  const [acoesR, snapRawR, pautaR, definicoesR, ponteR, ataR, usuariosR] = await Promise.all([
    supa.from('v_war_room_acoes').select('*').order('fase').order('ordem'),
    supa.from('war_room_snapshots').select('*').order('semana_inicio', { ascending: false }).limit(12),
    supa.from('v_war_room_pauta').select('*'),
    supa.from('war_room_definicoes').select('*').order('status').order('data_alvo', { nullsFirst: false }),
    supa.from('war_room_ponte').select('*').order('ordem'),
    supa.from('war_room_decisoes').select('*').order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url, ativo').eq('ativo', true).order('nome'),
  ])

  // Snapshots: núcleo recebe a tabela crua; membro recebe 0 linhas dela (RLS) e
  // cai na view lite (sem caixa/antecipação).
  let snapshots = snapRawR.data || []
  let snapshotsLite = false
  if (snapshots.length === 0) {
    const liteR = await supa.from('v_war_room_snapshots_lite').select('*').order('semana_inicio', { ascending: false }).limit(12)
    snapshots = liteR.data || []
    snapshotsLite = true
  }

  return NextResponse.json({
    meu_nivel,
    acoes: acoesR.data || [],
    snapshots,
    snapshots_lite: snapshotsLite,
    pauta: pautaR.data || [],
    definicoes: definicoesR.data || [],
    ponte: { fontes: ponteR.data || [], alvo_total: PONTE_ALVO_TOTAL, alvo_data: PONTE_ALVO_DATA },
    ata: ataR.data || [],
    usuarios: (usuariosR.data || []),
  })
}
