// Tickets — busca de entidades pra vincular (hoje só requisições).
// GET /api/tickets/vinculos/buscar?tipo=requisicao&q=6423|pneu|(vazio)
//   número (com ou sem #) → por id; texto (≥2) → ilike título/fornecedor;
//   vazio → 20 mais recentes. Sempre fora da lixeira. Devolve { itens: RequisicaoResumo[] }.
// Rota estática — vence /api/tickets/[id] (mesmo caso de /plano e /cron).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { COLS_REQ_RESUMO, interpretarBusca, resumoRequisicao } from '@/lib/tickets/vinculos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const tipo = req.nextUrl.searchParams.get('tipo') || 'requisicao'
  if (tipo !== 'requisicao') return NextResponse.json({ error: 'Tipo de vínculo inválido' }, { status: 400 })

  const b = interpretarBusca(req.nextUrl.searchParams.get('q'))
  let query = supabaseAdmin.from('Requisicao').select(COLS_REQ_RESUMO).neq('status', 'lixeira')
  if (b.modo === 'id') {
    query = query.eq('id', b.id)
  } else if (b.modo === 'texto') {
    if (b.texto.length < 2) return NextResponse.json({ error: 'Digite pelo menos 2 letras' }, { status: 400 })
    query = query.or(`titulo.ilike.%${b.texto}%,fornecedor.ilike.%${b.texto}%`)
  }
  const { data, error } = await query.order('id', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    itens: ((data || []) as Record<string, unknown>[]).map(resumoRequisicao),
  })
}
