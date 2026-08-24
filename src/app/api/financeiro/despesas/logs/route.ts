// GET /api/financeiro/despesas/logs?ids=82,83  → alterações feitas nas despesas
//
// Lê o `audit_log` no servidor. O portal escreve nele por rota
// (/api/audit/log) porque o RLS bloqueia insert do navegador; a leitura vem
// por aqui pelo mesmo motivo de fundo — depender da permissão do cliente
// deixaria o histórico vazio sem ninguém perceber que foi bloqueio, e não
// ausência de alteração.
//
// Sem `ids`, devolve as últimas alterações de qualquer despesa (é o "log da
// tela": o que mudou por aqui, em ordem).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exigirAcessoModulo } from '@/lib/ajustes/permissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const COLS = 'id,user_nome,acao,entidade_id,entidade_label,detalhes,created_at'
const LIMITE = 200

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, 'financeiro')
  } catch (e) {
    const status = (e as { status?: number })?.status || 401
    return NextResponse.json({ erro: (e as Error).message }, { status })
  }

  const ids = (req.nextUrl.searchParams.get('ids') || '')
    .split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s))

  let q = supabase.from('audit_log').select(COLS)
    .eq('sistema', 'financeiro')
    .eq('entidade', 'finan_pagar')
    .order('created_at', { ascending: false })
    .limit(LIMITE)

  if (ids.length > 0) q = q.in('entidade_id', [...new Set(ids)])

  const { data, error } = await q
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ logs: data || [] })
}
