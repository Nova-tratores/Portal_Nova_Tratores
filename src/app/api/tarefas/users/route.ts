import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { protegerRota } from '@/lib/ajustes/permissao-server'

// Service role: lê o diretório de usuários (financeiro_usu) no servidor — com RLS
// a anon key não lê mais essa tabela.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Quem chama: /tarefas e /cronograma/recursos (Central de Trabalho: tarefas,
// tickets OU cronograma) e /dre-financeiro/monitor (temAcesso('financeiro') ou
// pode('dre','monitor')).
export async function GET(req: Request) {
  const g = await protegerRota(req, [
    { modulo: 'tarefas' }, { modulo: 'tickets' }, { modulo: 'cronograma' },
    { modulo: 'financeiro' }, { modulo: 'dre', acao: 'monitor' },
  ])
  if (g.resposta) return g.resposta
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
