import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exigirAdmin } from '@/lib/auth/server'
import { esquecerConta } from '@/lib/auth/ativo'

// Ativar/inativar usuário (financeiro_usu.ativo) — só admin, pelo servidor.
// Com o RLS de financeiro_usu (cada um só edita a própria linha), o admin não
// consegue mais mexer no "ativo" de OUTRO usuário pelo navegador; passa por aqui.
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
  const ativo = body.ativo === true
  if (!userId) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  if (userId === auth.userId) return NextResponse.json({ error: 'Não pode inativar a própria conta' }, { status: 400 })

  const { error } = await supabase.from('financeiro_usu').update({ ativo }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  esquecerConta(userId)

  // Desativada também não entra: bloqueia o login no Supabase (corta as telas que leem
  // o banco direto pelo navegador e o token renovado). Reativar desbloqueia.
  let avisoLogin: string | undefined
  const { error: errBan } = await supabase.auth.admin.updateUserById(userId, { ban_duration: ativo ? 'none' : '876000h' })
  if (errBan) avisoLogin = `A conta foi ${ativo ? 'ativada' : 'desativada'}, mas o login não foi ${ativo ? 'liberado' : 'bloqueado'}: ${errBan.message}`

  // Ao DESATIVAR: conta as tarefas abertas do usuário (viram órfãs) p/ o /admin
  // avisar e oferecer reatribuição.
  let tarefasAbertas = 0
  if (!ativo) {
    const { count } = await supabase
      .from('portal_tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('atribuido_a', userId)
      .eq('concluida', false)
    tarefasAbertas = count || 0
  }
  return NextResponse.json({ ok: true, tarefasAbertas, avisoLogin })
}
