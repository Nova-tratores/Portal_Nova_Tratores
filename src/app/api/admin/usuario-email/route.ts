import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exigirAdmin } from '@/lib/auth/server'
import { erroEmail, normalizarEmail } from '@/lib/auth/email'

// Troca o e-mail de LOGIN de um usuário (e, opcional, define uma senha
// provisória) — só admin. Caso de uso: login criado com um e-mail que não
// existe; o "Resetar" manda o link pra esse endereço e a pessoa nunca recebe.
// O usuário continua o MESMO (id, permissões, histórico); o e-mail novo já
// nasce confirmado. Vale também para login sem perfil (Contas sem cadastro).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '').trim()
  const email = normalizarEmail(body.email)
  const senha = String(body.senha || '')
  if (!userId) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  const erro = erroEmail(email)
  if (erro) return NextResponse.json({ error: erro }, { status: 400 })
  if (senha && senha.length < 6) return NextResponse.json({ error: 'A senha provisória precisa ter pelo menos 6 caracteres.' }, { status: 400 })

  const { data: atual, error: errAtual } = await supabase.auth.admin.getUserById(userId)
  if (errAtual || !atual?.user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  const emailAntigo = atual.user.email || ''

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    ...(senha ? { password: senha } : {}),
  })
  if (error) {
    const jaUsado = /already|registered|exists/i.test(error.message)
    return NextResponse.json({ error: jaUsado ? `O e-mail ${email} já é de outro login.` : error.message }, { status: jaUsado ? 409 : 500 })
  }

  // Perfil do portal acompanha (se existir — login sem cadastro não tem linha).
  await supabase.from('financeiro_usu').update({ email }).eq('id', userId)

  try {
    await supabase.from('audit_log').insert([{
      user_id: auth.userId, user_nome: auth.email, sistema: 'admin', acao: 'trocar_email',
      entidade: 'auth.users', entidade_id: userId, entidade_label: email,
      detalhes: { de: emailAntigo, para: email, senha_provisoria: !!senha },
    }])
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, de: emailAntigo, para: email, senhaDefinida: !!senha })
}
