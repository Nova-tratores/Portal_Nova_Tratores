// "É vendedor (NT Vendas)" na Administração.
// O app de vendas (vendas-pwa) usa o MESMO login do portal, mas só deixa entrar
// quem tem linha ATIVA em `vendedores` (a mesma tabela das Propostas). Esta rota
// liga/desliga essa linha a partir do usuário do portal — nunca apaga (visitas,
// negócios e propostas apontam para o vendedor).
// GET  /api/admin/vendedor                → { vendedores: { [user_id]: { id, ativo } } }
// POST /api/admin/vendedor { user_id, ativo }
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { data, error } = await supabaseAdmin.from('vendedores').select('id, auth_uid, ativo').not('auth_uid', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const vendedores: Record<string, { id: number; ativo: boolean }> = {}
  for (const v of data || []) vendedores[v.auth_uid] = { id: v.id, ativo: v.ativo !== false }
  return NextResponse.json({ vendedores })
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '')
  const ativo = body.ativo !== false
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'user_id inválido' }, { status: 400 })

  const { data: usu } = await supabaseAdmin.from('financeiro_usu').select('nome, email').eq('id', userId).maybeSingle()
  if (!usu?.email) return NextResponse.json({ error: 'Usuário sem cadastro ou sem e-mail no portal' }, { status: 400 })
  const email = String(usu.email).trim().toLowerCase()

  // Já existe? Pelo login ou pelo e-mail (vendedor antigo ainda não vinculado).
  const { data: porUid } = await supabaseAdmin.from('vendedores').select('id').eq('auth_uid', userId).maybeSingle()
  const { data: porEmail } = porUid ? { data: null } : await supabaseAdmin.from('vendedores').select('id').ilike('email', email).maybeSingle()
  const existente = porUid || porEmail

  if (existente) {
    const { error } = await supabaseAdmin.from('vendedores').update({ auth_uid: userId, ativo }).eq('id', existente.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: existente.id, ativo })
  }
  if (!ativo) return NextResponse.json({ ok: true, id: null, ativo: false })

  const { data: novo, error } = await supabaseAdmin
    .from('vendedores')
    .insert({ auth_uid: userId, nome: usu.nome || email, email, ativo: true })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: novo.id, ativo: true })
}
