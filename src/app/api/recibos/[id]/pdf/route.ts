// PDF de um recibo emitido (?modelo=1|2|3).
import { guardarRecibos } from '@/lib/recibos/guarda'
import { gerarPdfRecibo } from '@/lib/recibos/pdf'
import { assinaturaDe, buscarRecibo, dadosEmpresa } from '@/lib/recibos/server'
import { numeroRecibo, type ModeloRecibo } from '@/lib/recibos/tipos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardarRecibos(req)
  if (g.resposta) return g.resposta
  const id = Number((await params).id)
  const modelo = (Number(new URL(req.url).searchParams.get('modelo')) || 1) as ModeloRecibo
  try {
    const r = await buscarRecibo(id)
    if (!r) return Response.json({ erro: 'Recibo não encontrado' }, { status: 404 })
    const [emp, ass] = await Promise.all([dadosEmpresa(r.empresa), assinaturaDe(r.emitido_por)])
    const pdf = await gerarPdfRecibo(r, emp, [1, 2, 3].includes(modelo) ? modelo : 1, ass)
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recibo-${numeroRecibo(r.numero)}.pdf"` },
    })
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 500 })
  }
}
