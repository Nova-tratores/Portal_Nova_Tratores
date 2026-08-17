// GET /api/financeiro/prefs-envio → todas as preferências de envio dos clientes
// (EnvioBoleto). A tabela tem RLS que bloqueia leitura no navegador, então o
// service role lê aqui pra mostrar o selo na capa dos cards.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(req: Request) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado', prefs: [] }, { status: 401 })
  try {
    const { data, error } = await supabase.from('EnvioBoleto').select('cnpj_cpf, metodo, cliente_nome')
    if (error) throw error
    return NextResponse.json({ prefs: data || [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    console.error('[prefs-envio]', msg)
    return NextResponse.json({ error: msg, prefs: [] }, { status: 500 })
  }
}
