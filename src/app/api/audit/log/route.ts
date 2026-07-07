import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'

// Escrita no audit_log — só pelo servidor, com login. Antes o navegador inseria
// direto (anon key) e o RLS estava desligado: dava pra forjar quem fez a ação e
// até apagar/reescrever o log. Agora o user_id/user_nome vêm do TOKEN (não do
// corpo), então o registro é confiável, e o RLS bloqueia escrita pelo cliente.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  if (!b?.sistema || !b?.acao) {
    return NextResponse.json({ error: 'sistema e acao são obrigatórios' }, { status: 400 })
  }

  // Nome vem da tabela pelo id do token — não do cliente (não-forjável).
  const { data: perfil } = await supabase
    .from('financeiro_usu')
    .select('nome')
    .eq('id', auth.userId)
    .maybeSingle()

  const { error } = await supabase.from('audit_log').insert([{
    user_id: auth.userId,
    user_nome: perfil?.nome || auth.email || '—',
    sistema: String(b.sistema),
    acao: String(b.acao),
    entidade: b.entidade ?? null,
    entidade_id: b.entidade_id != null ? String(b.entidade_id) : null,
    entidade_label: b.entidade_label ?? null,
    detalhes: b.detalhes ?? null,
  }])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
