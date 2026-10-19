// Solicitação de Compras ligada a um pedido fábrica (Propostas → Pedidos Fabrica).
// GET /api/tickets/compras/pedido-fabrica?id=<Proposta_Fabrica.id>
//   → { sc: { id, numero, sc_etapa } | null }  (a mais recente; a cancelada só se não houver outra)
// Service role: quem está no pedido fábrica pode não ver o ticket pela RLS,
// mas precisa saber que a SC existe para não abrir outra.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { idPedidoFabrica } from '@/lib/tickets/compras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = idPedidoFabrica(req.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'Pedido fábrica inválido' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('tickets')
    .select('id, numero, sc_etapa')
    .eq('tipo', 'compras').eq('payload->>pedido_fabrica_id', String(id))
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lista = data || []
  const sc = lista.find((t) => t.sc_etapa !== 'cancelada') || lista[0] || null
  return NextResponse.json({ sc })
}
