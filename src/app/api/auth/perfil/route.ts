import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'

// Cria o perfil (financeiro_usu) de quem ACABOU de se cadastrar no /login.
// Desde o RLS de financeiro_usu (p1-rls-financeiro-usu.sql, 07/07/2026) o
// navegador não pode mais inserir ali — o cadastro criava o login e falhava no
// perfil ("Erro ao salvar perfil"), deixando logins sem cadastro. O id e o
// e-mail vêm SEMPRE do token (ninguém cria perfil em nome de outro).
// Idempotente: se o perfil já existe, só responde ok.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nome = String(body.nome || '').trim().slice(0, 120)
  const funcao = String(body.funcao || '').trim().slice(0, 120)
  const avatarUrl = String(body.avatar_url || '').trim().slice(0, 500)

  const { data: existe } = await supabase.from('financeiro_usu').select('id').eq('id', auth.userId).maybeSingle()
  if (existe) return NextResponse.json({ ok: true, jaExistia: true })

  if (!nome) return NextResponse.json({ error: 'Informe o nome.' }, { status: 400 })

  const { error } = await supabase.from('financeiro_usu').insert([{
    id: auth.userId,
    nome,
    funcao: funcao || null,
    avatar_url: avatarUrl,
    email: auth.email,
  }])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, criado: true })
}
