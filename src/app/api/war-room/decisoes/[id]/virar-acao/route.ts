// War Room — transformar uma DECISÃO da ata numa AÇÃO do plano. Reusa a mesma
// lógica de criação de ação (caminho TS), grava o vínculo acao_id na decisão
// (única mutação permitida pelo trigger — ver sql/create-war-room.sql) e
// registra o evento 'wr_decisao_vinculada' no ticket criado. SÓ núcleo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, criarAcaoWarRoom } from '@/lib/war-room/server'
import { registrarEvento } from '@/lib/tickets/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { WarRoomFase } from '@/lib/war-room/constantes'
import { FASES } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo cria ações.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { data: decisao } = await supabaseAdmin
    .from('war_room_decisoes').select('*').eq('id', id).maybeSingle()
  if (!decisao) return NextResponse.json({ error: 'Decisão inválida' }, { status: 404 })
  if (decisao.acao_id) return NextResponse.json({ error: 'Esta decisão já está vinculada a uma ação.' }, { status: 400 })

  const fase = String(body.fase || '').trim() as WarRoomFase
  if (!FASES.some((f) => f.id === fase)) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
  const titulo = String(body.titulo || decisao.descricao || '').trim().slice(0, 200)
  const dono_id = String(body.dono_id || decisao.dono_id || '').trim()
  if (!dono_id) return NextResponse.json({ error: 'Escolha o dono da ação' }, { status: 400 })

  const res = await criarAcaoWarRoom(auth, {
    titulo,
    descricao: String(body.descricao || decisao.descricao || ''),
    dono_id, fase,
    causa_raiz: String(body.causa_raiz || ''),
    meta: String(body.meta || ''),
    prazo_estrategico: (body.prazo_estrategico ? String(body.prazo_estrategico) : decisao.prazo) || null,
  })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })

  // Vínculo decisão→ação (estado consultável pela pauta). Única mutação que o
  // trigger de imutabilidade permite: acao_id NULL→valor, uma vez.
  const { error: linkErr } = await supabaseAdmin
    .from('war_room_decisoes').update({ acao_id: res.acao.id }).eq('id', id).is('acao_id', null)
  if (linkErr) return NextResponse.json({ error: `Ação criada, mas o vínculo falhou: ${linkErr.message}` }, { status: 500 })

  // Evento imutável ligando a decisão à ação criada (rastro na timeline).
  await registrarEvento(res.ticket.id, auth.userId, 'wr_decisao_vinculada', {
    decisao_id: id, acao_id: res.acao.id,
  })

  return NextResponse.json({ ticket: res.ticket, acao: res.acao })
}
