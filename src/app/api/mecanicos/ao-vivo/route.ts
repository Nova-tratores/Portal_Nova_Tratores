// Pede ao servidor para atualizar o Centro do Pós-Vendas agora e avisar todas as telas abertas (José, 21/10/2026).
// POST { motivo, leve? } — leve = ocorrência/defesa (só renova fichas, carreira e pontos, sem regravar tabelas).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { atualizarPosVendasAgora } from '@/lib/mecanicos/ao-vivo-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({}))
  const motivo = String(b.motivo || 'pedido da tela').slice(0, 120)
  void atualizarPosVendasAgora(motivo, { leve: b.leve !== false })
  return NextResponse.json({ ok: true })
}
