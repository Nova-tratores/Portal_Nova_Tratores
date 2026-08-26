// War Room — gestão da LISTA EXPLÍCITA de acesso (núcleo/membro).
// GET  devolve o nível do chamador (+ a lista completa, se núcleo/admin).
// PUT  adiciona/atualiza/remove um membro (SÓ admin). Toda mudança é registrada
//      no log append-only (auditoria). Promover a núcleo adiciona a pessoa como
//      participante dos tickets war_room abertos (senão tomaria 404 no detalhe).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloWarRoom, nivelDoUsuario, registrarLogMembro, adicionarNucleoAosTicketsAbertos,
} from '@/lib/war-room/server'
import type { WarRoomNivel } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const meu_nivel = await nivelDoUsuario(auth)
  // Só núcleo/admin enxerga a lista completa (com nomes).
  if (meu_nivel !== 'nucleo') return NextResponse.json({ meu_nivel, membros: [] })

  const { data: membros } = await supabaseAdmin
    .from('war_room_membros')
    .select('user_id, nivel, ativo, adicionado_por, created_at')
    .order('created_at')
  const ids = (membros || []).map((m) => m.user_id)
  const { data: usuarios } = ids.length
    ? await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url, ativo').in('id', ids)
    : { data: [] as { id: string; nome: string; avatar_url: string | null; ativo: boolean }[] }
  const mapa = new Map((usuarios || []).map((u) => [u.id, u]))
  const lista = (membros || []).map((m) => ({
    ...m,
    nome: mapa.get(m.user_id)?.nome || '—',
    avatar_url: mapa.get(m.user_id)?.avatar_url || null,
    usuario_ativo: mapa.get(m.user_id)?.ativo !== false,
  }))
  return NextResponse.json({ meu_nivel, membros: lista })
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só administradores gerenciam a lista do War Room.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const userId = String(body.user_id || '').trim()
  const nivel = String(body.nivel || '').trim() as WarRoomNivel
  const ativo = body.ativo !== false // default true
  if (!userId) return NextResponse.json({ error: 'Informe o usuário' }, { status: 400 })
  if (nivel !== 'nucleo' && nivel !== 'membro') return NextResponse.json({ error: 'Nível inválido' }, { status: 400 })

  const { data: usr } = await supabaseAdmin
    .from('financeiro_usu').select('id, ativo').eq('id', userId).maybeSingle()
  if (!usr) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })

  const { data: existente } = await supabaseAdmin
    .from('war_room_membros').select('user_id, nivel, ativo').eq('user_id', userId).maybeSingle()

  const { error } = await supabaseAdmin.from('war_room_membros').upsert({
    user_id: userId,
    nivel,
    ativo,
    adicionado_por: existente ? undefined : auth.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const acao: 'add' | 'update' | 'remove' = !existente ? 'add' : (!ativo ? 'remove' : 'update')
  await registrarLogMembro(userId, nivel, ativo, acao, auth.userId)

  // Entrou/segue como núcleo ativo → garante visibilidade dos tickets abertos.
  if (ativo && nivel === 'nucleo') await adicionarNucleoAosTicketsAbertos(userId, auth.userId)

  return NextResponse.json({ ok: true })
}
