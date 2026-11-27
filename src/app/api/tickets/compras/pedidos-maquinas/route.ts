// Pedidos de Máquinas (PVM) para ligar a uma Solicitação de Compras.
// GET /api/tickets/compras/pedidos-maquinas?q=&pedido_fabrica_id=
//   q                  → cliente ou nº do PVM (vazio = os mais recentes em aberto)
//   pedido_fabrica_id  → acha a proposta ligada ao pedido fábrica e põe os PVMs
//                        dela primeiro (`sugerido`); um só = `auto` (a SC já nasce com ele)
// Service role: quem abre a SC pode não ter o módulo Pedidos de Máquinas — só
// devolve número, cliente, fase e valor, o suficiente para escolher.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { idPedidoFabrica, ordenarPedidosMaquina, type PedidoMaquinaOpcao } from '@/lib/tickets/compras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLUNAS = 'id, id_pedido, cliente, status, valor_total, proposta_id, criado_em'

function faltaTabela(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message || ''))
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 60)
  const fab = idPedidoFabrica(sp.get('pedido_fabrica_id'))

  // Proposta comercial ligada ao pedido fábrica (Formulario.id_fabrica_ref).
  let propostaId: number | null = null
  if (fab) {
    const { data: prop } = await supabaseAdmin.from('Formulario')
      .select('id').eq('id_fabrica_ref', String(fab)).is('deleted_at', null).limit(1).maybeSingle()
    propostaId = prop?.id ? Number(prop.id) : null
  }

  let busca = supabaseAdmin.from('pedidos_maquinas').select(COLUNAS)
    .neq('status', 'cancelado').order('criado_em', { ascending: false }).limit(30)
  if (q) {
    const num = q.replace(/\D/g, '')
    const partes = [`cliente.ilike."*${q}*"`, `id_pedido.ilike."*${q}*"`]
    if (num) partes.push(`id_pedido.ilike."*${num.padStart(4, '0')}*"`)
    busca = busca.or(partes.join(','))
  }
  const [r1, r2] = await Promise.all([
    busca,
    propostaId
      ? supabaseAdmin.from('pedidos_maquinas').select(COLUNAS).eq('proposta_id', propostaId).neq('status', 'cancelado')
      : Promise.resolve({ data: [] as PedidoMaquinaOpcao[], error: null }),
  ])
  if (faltaTabela(r1.error)) return NextResponse.json({ pedidos: [], auto: null, propostaId, semTabela: true })
  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })

  const vistos = new Set<number>()
  const todos = [...((r2.data || []) as PedidoMaquinaOpcao[]), ...((r1.data || []) as PedidoMaquinaOpcao[])]
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
  const { pedidos, auto } = ordenarPedidosMaquina(todos, propostaId)
  return NextResponse.json({ pedidos, auto, propostaId })
}
