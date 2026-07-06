import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'

// Escrita de permissões (portal_permissoes) — SÓ pelo servidor, com checagem de
// admin. Antes o painel gravava direto do navegador com a anon key: como não
// havia RLS de escrita, qualquer usuário podia se auto-promover a admin/dev pelo
// console. Agora a tabela bloqueia escrita do cliente (RLS) e toda alteração
// passa por aqui, autenticada.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Campos que um admin pode alterar. is_dev é tratado à parte (só Dev pode mudar).
const CAMPOS = ['is_admin', 'categoria', 'modulos_permitidos', 'mecanico_role', 'mecanico_tecnico_nome'] as const

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '').trim()
  const updates = body.updates && typeof body.updates === 'object' ? body.updates : {}
  if (!userId) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const k of CAMPOS) {
    if (k in updates) patch[k] = updates[k]
  }

  // is_dev: "só um Dev pode dar/tirar Dev". Só exige Dev se o valor realmente muda.
  if ('is_dev' in updates) {
    const { data: atual } = await supabase
      .from('portal_permissoes')
      .select('is_dev')
      .eq('user_id', userId)
      .maybeSingle()
    const mudou = (atual?.is_dev === true) !== (updates.is_dev === true)
    if (mudou && !auth.isDev) {
      return NextResponse.json({ error: 'Apenas um Dev pode conceder ou retirar o papel Dev.' }, { status: 403 })
    }
    patch.is_dev = updates.is_dev === true
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('portal_permissoes')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
