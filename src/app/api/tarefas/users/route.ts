import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
