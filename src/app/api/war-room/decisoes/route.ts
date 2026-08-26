// War Room — ATA (append-only). Registra uma decisão na reunião (snapshot) da
// semana. Se vier `definicao_id`, marca a definição estratégica como 'decidida'
// na mesma sequência (a decisão fica na ata, imutável; a definição só carrega o
// status). SÓ núcleo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, carregarSnapshotAberto } from '@/lib/war-room/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo registra decisões.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const descricao = String(body.descricao || '').trim()
  if (!descricao) return NextResponse.json({ error: 'Descreva a decisão' }, { status: 400 })

  const snap = await carregarSnapshotAberto()
  if (!snap) return NextResponse.json({ error: 'Não há reunião aberta nesta semana (snapshot).' }, { status: 400 })

  const definicaoId = body.definicao_id ? String(body.definicao_id) : null
  // Se resolve uma definição, ela precisa existir e ainda não estar decidida.
  if (definicaoId) {
    const { data: def } = await supabaseAdmin
      .from('war_room_definicoes').select('id, status').eq('id', definicaoId).maybeSingle()
    if (!def) return NextResponse.json({ error: 'Definição estratégica inválida' }, { status: 400 })
    if (def.status === 'decidida') return NextResponse.json({ error: 'Essa definição já foi decidida.' }, { status: 400 })
  }

  const { data: decisao, error } = await supabaseAdmin
    .from('war_room_decisoes')
    .insert({
      snapshot_id: snap.id,
      descricao,
      dono_id: body.dono_id ? String(body.dono_id) : null,
      prazo: body.prazo ? String(body.prazo) : null,
      acao_id: body.acao_id ? String(body.acao_id) : null,
      definicao_id: definicaoId,
      registrado_por: auth.userId,
    })
    .select('*')
    .single()
  if (error || !decisao) return NextResponse.json({ error: error?.message || 'Falha ao registrar' }, { status: 500 })

  // Marca a definição como decidida (a ata acima é a prova imutável exigida).
  if (definicaoId) {
    await supabaseAdmin
      .from('war_room_definicoes')
      .update({ status: 'decidida', decidida_em: new Date().toISOString() })
      .eq('id', definicaoId)
  }

  return NextResponse.json({ decisao })
}
