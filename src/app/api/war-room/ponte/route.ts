// War Room — PONTE DE CAIXA até dez/2026 (só núcleo). GET lista as fontes;
// POST cria uma fonte; PUT atualiza `realizado`/metadados de uma fonte existente.
// (Mesmo padrão de /definicoes: POST cria, PUT atualiza.)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, clienteDoUsuario } from '@/lib/war-room/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { PONTE_ALVO_TOTAL, PONTE_ALVO_DATA } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  // RLS: só núcleo lê war_room_ponte; membro recebe lista vazia.
  const supa = clienteDoUsuario(req)
  const { data, error } = await supa.from('war_room_ponte').select('*').order('ordem')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    fontes: data || [],
    alvo_total: PONTE_ALVO_TOTAL,
    alvo_data: PONTE_ALVO_DATA,
  })
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo gerencia a ponte de caixa.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const nome = String(body.nome || '').trim()
  const meta = num(body.meta)
  if (!nome) return NextResponse.json({ error: 'Informe o nome da fonte' }, { status: 400 })
  if (meta == null) return NextResponse.json({ error: 'Informe a meta (R$)' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('war_room_ponte')
    .insert({
      nome, meta,
      realizado: num(body.realizado) ?? 0,
      prazo: body.prazo ? String(body.prazo) : null,
      acao_id: body.acao_id ? String(body.acao_id) : null,
      ordem: num(body.ordem) ?? 0,
    })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fonte: data })
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo atualiza a ponte de caixa.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const id = body.id ? String(body.id) : null
  if (!id) return NextResponse.json({ error: 'Informe a fonte (id). Para criar, use POST.' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if ('nome' in body) patch.nome = String(body.nome || '')
  if ('meta' in body) patch.meta = num(body.meta) ?? 0
  if ('realizado' in body) patch.realizado = num(body.realizado) ?? 0
  if ('prazo' in body) patch.prazo = body.prazo ? String(body.prazo) : null
  if ('acao_id' in body) patch.acao_id = body.acao_id ? String(body.acao_id) : null
  if ('ordem' in body) patch.ordem = num(body.ordem) ?? 0
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })
  const { error } = await supabaseAdmin.from('war_room_ponte').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
