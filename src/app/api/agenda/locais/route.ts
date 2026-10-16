// AGENDA COLETIVA — locais pré-definidos do campo "Local" (José, 16/10/2026).
// GET → { locais }   POST { nome } → cria   PATCH { id, nome } → renomeia   DELETE ?id= → tira da lista
// Qualquer pessoa logada cria/edita (pedido do José). Sem a migration sql/agenda-locais.sql: lista vazia.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { listarLocais, migrationFaltou } from '@/lib/agenda/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG = 'Falta rodar o sql/agenda-locais.sql no Supabase.'
const nomeOk = (v: unknown) => { const n = String(v ?? '').replace(/\s+/g, ' ').trim(); return n.length >= 1 && n.length <= 80 ? n : null }

export async function GET(req: NextRequest) {
  if (!(await autenticar(req))) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  return NextResponse.json({ locais: await listarLocais() })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const nome = nomeOk(((await req.json().catch(() => ({}))) as { nome?: unknown }).nome)
  if (!nome) return NextResponse.json({ error: 'Dê um nome ao local (até 80 letras).' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('agenda_locais').insert({ nome, criado_por: auth.userId }).select('id, nome').single()
  if (error) {
    if (migrationFaltou(error)) return NextResponse.json({ error: MSG }, { status: 503 })
    if (error.code === '23505') return NextResponse.json({ error: 'Esse local já existe.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ local: data })
}

export async function PATCH(req: NextRequest) {
  if (!(await autenticar(req))) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; nome?: unknown }
  const nome = nomeOk(b.nome)
  if (!b.id || !nome) return NextResponse.json({ error: 'Informe o local e o nome novo.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('agenda_locais').update({ nome, updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Já existe um local com esse nome.' : migrationFaltou(error) ? MSG : error.message }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await autenticar(req))) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Informe o local.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('agenda_locais').update({ ativo: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: migrationFaltou(error) ? MSG : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
