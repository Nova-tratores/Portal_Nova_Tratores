// Tentar de novo o lançamento no Omie de um recibo que falhou (POST). Não duplica: o código de integração é fixo
// e a baixa só acontece se o título ainda não estiver pago/recebido.
import { NextResponse } from 'next/server'
import { guardarRecibos } from '@/lib/recibos/guarda'
import { buscarRecibo, lancarOmie } from '@/lib/recibos/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Recibo inválido' }, { status: 400 })
  try {
    const r = await buscarRecibo(id)
    if (!r) return NextResponse.json({ erro: 'Recibo não encontrado' }, { status: 404 })
    if (r.cancelado_em) return NextResponse.json({ erro: 'Recibo cancelado não vai ao Omie' }, { status: 400 })
    if (!r.omie_lancar) return NextResponse.json({ erro: 'Este recibo foi emitido sem lançar no Omie' }, { status: 400 })
    if (r.omie_baixado_em) return NextResponse.json({ recibo: r })
    return NextResponse.json({ recibo: await lancarOmie(r) })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
