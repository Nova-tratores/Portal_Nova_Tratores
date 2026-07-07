import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role: lê o diretório de usuários (financeiro_usu) no servidor — com RLS
// a anon key não lê mais essa tabela.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('financeiro_usu')
      .select('id, nome, avatar_url')
      .eq('ativo', true)
      .order('nome')

    if (error) throw new Error(error.message)
    return NextResponse.json(data || [])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
