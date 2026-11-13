// GET /api/empresa/nota?conta=NOVA&pedido=7849 — o PDF da nota fiscal (DANFE) de uma venda, para abrir numa janela
// na tela do diretor (/empresa → Comercial → Faturamento → "Faturado em…"). José, 12/11: "pegar as notas de vendas e
// deixar um PDF que abre com um modal ali".
// Mesmo caminho do Dashboard de Vendas (/api/estoque/dashboard/nf): número do pedido → id interno no Omie → notas do
// pedido → GetUrlDanfe. O PDF passa por aqui (a tela não consegue mostrar o link do Omie direto numa janela).
// Permissão: a do /empresa (guardarDre).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { lerArquivo } from '@/lib/notas/cache-docs'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta'
import { consultarPedido, normalizarPedido } from '@/lib/ajustes/omie'
import { buscarNotasPorIdPedido, urlDanfe } from '@/lib/ajustes/notas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const sp = req.nextUrl.searchParams
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT
  const pedido = (sp.get('pedido') || '').trim()
  if (!/^\d+$/.test(pedido)) return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 })
  try {
    // 1) a nota já guardada pelo portal (notas_fiscais_docs + bucket), pelo pedido — na hora, sem ir no Omie
    //    (José, 12/11: "as notas estão sendo buscadas no Omie, mas nós já temos todas no Supabase")
    const { data: docs } = await supabaseAdmin.from('notas_fiscais_docs').select('numero,pdf_path,cancelada,tipo')
      .eq('conta_omie', String(conta).toUpperCase()).eq('pedido_num', pedido).like('tipo', 'saida%').not('pdf_path', 'is', null).limit(5)
    const doc = (docs || []).find((x) => !x.cancelada) || (docs || [])[0]
    if (doc?.pdf_path) {
      const buf = await lerArquivo(String(doc.pdf_path))
      if (buf) return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="NF_${doc.numero || pedido}.pdf"`, 'X-Nota-Numero': String(doc.numero || ''), 'Cache-Control': 'private, max-age=600' } })
    }
    // 2) ainda não guardada: busca no Omie
    let idPedido: number | null = null
    try {
      const p = normalizarPedido(await consultarPedido(conta, { numeroPedido: pedido }))
      idPedido = p?.idPedido != null ? Number(p.idPedido) || null : null
    } catch { idPedido = null }
    if (!idPedido) return NextResponse.json({ erro: 'Pedido não encontrado no Omie.' }, { status: 404 })
    const notas = (await buscarNotasPorIdPedido(conta, idPedido)) as Array<{ nCodNF?: number | string; numero?: string | number; cancelada?: boolean; tipo?: string }>
    const nota = notas.find((n) => !n.cancelada) || notas[0]
    if (!nota?.nCodNF) return NextResponse.json({ erro: 'Esse pedido ainda não tem nota no Omie.' }, { status: 404 })
    const { url } = await urlDanfe(conta, String(nota.nCodNF), nota.tipo || 'produto')
    const pdf = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!pdf.ok) return NextResponse.json({ erro: `O Omie não entregou o PDF (${pdf.status}).` }, { status: 502 })
    return new NextResponse(await pdf.arrayBuffer(), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="NF_${nota.numero || pedido}.pdf"`, 'X-Nota-Numero': String(nota.numero || ''), 'Cache-Control': 'private, max-age=600' },
    })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
}
