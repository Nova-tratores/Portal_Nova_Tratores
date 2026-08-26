// War Room — DEFINIÇÕES estratégicas (só núcleo). GET/POST/PUT, sem DELETE
// (arquiva-se em vez de apagar). Marcar como 'decidida' NÃO é feito aqui: exige
// uma decisão na ata (rota /decisoes com definicao_id) — aqui só rejeitamos.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { temModuloWarRoom, ehNucleo, clienteDoUsuario } from '@/lib/war-room/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  // RLS: só núcleo lê war_room_definicoes; membro recebe lista vazia.
  const supa = clienteDoUsuario(req)
  const { data, error } = await supa
    .from('war_room_definicoes').select('*').order('status').order('data_alvo', { nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ definicoes: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo gerencia definições.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const tema = String(body.tema || '').trim()
  const decisao_a_extrair = String(body.decisao_a_extrair || '').trim()
  if (!tema) return NextResponse.json({ error: 'Informe o tema' }, { status: 400 })
  if (!decisao_a_extrair) return NextResponse.json({ error: 'Informe qual decisão a conversa precisa produzir' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('war_room_definicoes')
    .insert({
      tema, decisao_a_extrair,
      contexto: String(body.contexto || ''),
      dados_necessarios: String(body.dados_necessarios || ''),
      status: 'pendente',
      data_alvo: body.data_alvo ? String(body.data_alvo) : null,
      criado_por: auth.userId,
    })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ definicao: data })
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo gerencia definições.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Informe a definição' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const c of ['tema', 'contexto', 'decisao_a_extrair', 'dados_necessarios']) {
    if (c in body) patch[c] = String(body[c] || '')
  }
  if ('data_alvo' in body) patch.data_alvo = body.data_alvo ? String(body.data_alvo) : null
  if ('status' in body) {
    const s = String(body.status)
    if (s === 'decidida') return NextResponse.json({ error: 'Para decidir, registre a decisão na ata (não aqui).' }, { status: 400 })
    if (!['pendente', 'agendada', 'arquivada'].includes(s)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    patch.status = s
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const { error } = await supabaseAdmin.from('war_room_definicoes').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
