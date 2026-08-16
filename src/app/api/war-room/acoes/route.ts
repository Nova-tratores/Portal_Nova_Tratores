// War Room — ações do plano (cada ação = ticket tipo='war_room').
// GET  lista as ações visíveis ao chamador (via view, RLS aplica o corte).
// POST cria uma ação (SÓ núcleo) pelo caminho TS do motor (sem RPC).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, criarAcaoWarRoom, clienteDoUsuario } from '@/lib/war-room/server'
import type { WarRoomFase } from '@/lib/war-room/constantes'
import { FASES } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const supa = clienteDoUsuario(req)
  const { data, error } = await supa
    .from('v_war_room_acoes')
    .select('*')
    .order('fase')
    .order('ordem')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acoes: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo cria ações.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const titulo = String(body.titulo || '').trim()
  const descricao = String(body.descricao || '').trim()
  const dono_id = String(body.dono_id || body.responsavel_id || '').trim()
  const fase = String(body.fase || '').trim() as WarRoomFase
  if (!titulo) return NextResponse.json({ error: 'Informe o título da ação' }, { status: 400 })
  if (!descricao) return NextResponse.json({ error: 'Descreva a ação (origem imutável)' }, { status: 400 })
  if (!dono_id) return NextResponse.json({ error: 'Escolha o dono da ação' }, { status: 400 })
  if (!FASES.some((f) => f.id === fase)) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })

  const res = await criarAcaoWarRoom(auth, {
    titulo, descricao, dono_id, fase,
    causa_raiz: String(body.causa_raiz || ''),
    entregavel: String(body.entregavel || ''),
    indicador: String(body.indicador || ''),
    meta: String(body.meta || ''),
    consequencia: String(body.consequencia || ''),
    prazo_estrategico: body.prazo_estrategico ? String(body.prazo_estrategico) : null,
    ordem: Number(body.ordem) || 0,
  })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ticket: res.ticket, acao: res.acao })
}
