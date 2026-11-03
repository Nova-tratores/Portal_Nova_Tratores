// Cancelar um recibo (PATCH { motivo }). O recibo não some: fica marcado e o PDF/QR mostram CANCELADO.
import { NextResponse } from 'next/server'
import { guardarRecibos } from '@/lib/recibos/guarda'
import { cancelarRecibo, nomeUsuario } from '@/lib/recibos/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Recibo inválido' }, { status: 400 })
  const corpo = await req.json().catch(() => ({}))
  const motivo = String(corpo?.motivo || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (motivo.length < 3) return NextResponse.json({ erro: 'Diga o motivo do cancelamento' }, { status: 400 })
  try {
    const por = (await nomeUsuario(g.auth.userId)) || g.auth.email || g.auth.userId
    return NextResponse.json({ recibo: await cancelarRecibo(id, motivo, por) })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}
