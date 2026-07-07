import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Atualiza um cadastro de cliente (portal_nt_clientes_PRINCIPAL). Antes era gravado
// direto do navegador (anon); com RLS a escrita do cliente e bloqueada, entao passa aqui.
export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const cliente = body?.cliente
  const id = cliente?.id
  if (!id) return NextResponse.json({ error: 'id do cliente obrigatorio' }, { status: 400 })
  const { error } = await supabase.from('portal_nt_clientes_PRINCIPAL').update(cliente).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
