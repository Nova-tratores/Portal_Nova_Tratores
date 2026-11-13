// GET /api/empresa/nota-numero?conta=nova&numero=23&tipo=entrada|saida — o PDF de uma nota pelo NÚMERO (o que o DRE
// traz em numeroDocFiscal), para abrir numa janela na tela de Despesas do /empresa. ConsultarNF (número + série 1)
// → código interno → GetUrlDanfe; o PDF passa por aqui. Nota de serviço/recibo não tem DANFE: devolve erro claro.
// José, 12/11: "as notas já estão todas no Supabase" → primeiro lê notas_fiscais_docs + bucket notas-fiscais (na hora);
// só vai no Omie se a nota ainda não foi guardada. ?nome= ajuda a escolher quando o mesmo número existe em entrada e saída.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { omieRequest } from '@/lib/estoque/omie'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { lerArquivo } from '@/lib/notas/cache-docs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const sp = req.nextUrl.searchParams
  const conta = (sp.get('conta') || 'nova').toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA'
  const numero = (sp.get('numero') || '').replace(/\D/g, '')
  const tipos = sp.get('tipo') === 'saida' ? ['1', '0'] : ['0', '1']
  if (!numero) return NextResponse.json({ erro: 'Sem número de nota.' }, { status: 400 })
  const pdfResp = (buf: ArrayBuffer | Buffer) => new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="NF_${numero}.pdf"`, 'Cache-Control': 'private, max-age=600' } })
  try {
    // 1) guardada no portal
    const { data: docs } = await supabaseAdmin.from('notas_fiscais_docs').select('tipo,parte_nome,pdf_path,data_emissao')
      .eq('conta_omie', conta).eq('numero', String(Number(numero))).not('pdf_path', 'is', null).limit(10)
    if (docs?.length) {
      const nome = (sp.get('nome') || '').toUpperCase().replace(/s+/g, ' ').trim()
      const pref = sp.get('tipo') === 'saida' ? /^saida/ : sp.get('tipo') === 'entrada' ? /^entrada/ : /./
      const nota = (r0: { tipo: string; parte_nome: string | null }) => (nome && String(r0.parte_nome || '').toUpperCase().replace(/s+/g, ' ').trim() === nome ? 2 : 0) + (pref.test(r0.tipo) ? 1 : 0)
      const melhor = [...docs].sort((a, b) => nota(b) - nota(a))[0]
      const buf = await lerArquivo(String(melhor.pdf_path))
      if (buf) return pdfResp(buf)
    }
    // 2) ainda não guardada: busca no Omie
    let nCodNF: number | null = null
    for (const tpNF of tipos) {
      try {
        const c = await omieRequest<{ nCodNF?: number; compl?: { nIdNF?: number }; nfCadastro?: { nCodNF?: number }; faultstring?: string }>(
          '/produtos/nfconsultar/', 'ConsultarNF', { nNF: numero, serie: '1', tpNF, tpAmb: '1' }, { conta },
        )
        nCodNF = c?.nCodNF || c?.compl?.nIdNF || c?.nfCadastro?.nCodNF || null
        if (nCodNF) break
      } catch { /* tenta o outro tipo */ }
    }
    if (!nCodNF) return NextResponse.json({ erro: 'Não achei essa nota no Omie (pode ser nota de serviço ou recibo, que não tem DANFE).' }, { status: 404 })
    const u = await omieRequest<{ cUrlDanfe?: string; faultstring?: string }>('/produtos/notafiscalutil/', 'GetUrlDanfe', { nCodNF }, { conta })
    if (!u?.cUrlDanfe) return NextResponse.json({ erro: u?.faultstring || 'O Omie não devolveu o PDF dessa nota.' }, { status: 404 })
    const pdf = await fetch(u.cUrlDanfe, { signal: AbortSignal.timeout(30_000) })
    if (!pdf.ok) return NextResponse.json({ erro: `O Omie não entregou o PDF (${pdf.status}).` }, { status: 502 })
    return pdfResp(await pdf.arrayBuffer())
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 })
  }
}
