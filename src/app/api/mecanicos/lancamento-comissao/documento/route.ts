// Documento final da comissão (A4, com as OS e as assinaturas) — José, 20/10/2026.
// GET ?id=<pedido>[&doc=autorizacao|recibo|ambos] → HTML pronto para imprimir/salvar em PDF.
// Antes de autorizado sai com a marca "aguardando". 'ambos' = de acordo + recibo na mesma impressão (05/11/2026).
import { NextRequest, NextResponse } from 'next/server'
import { guardarComissao } from '@/lib/mecanicos/lancamento-comissao-rota'
import { pedidoCompleto, SemTabela } from '@/lib/mecanicos/lancamento-comissao-server'
import { montarDocumento } from '@/lib/mecanicos/documento-comissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  try {
    const p = await pedidoCompleto(String(req.nextUrl.searchParams.get('id') || ''))
    if (!p) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    const doc = req.nextUrl.searchParams.get('doc')
    const html = await montarDocumento(p, doc === 'recibo' || doc === 'ambos' ? doc : 'autorizacao')
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof SemTabela) return NextResponse.json({ error: e.message, semTabela: true }, { status: 503 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 })
  }
}
