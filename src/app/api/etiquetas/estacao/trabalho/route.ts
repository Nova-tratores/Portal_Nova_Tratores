import { NextRequest, NextResponse } from 'next/server'
import { concluir, sinalEPegar } from '@/lib/etiquetas/estacao-server'
import { ESTACAO_ID, idEstacaoValido, limparNomeEstacao } from '@/lib/etiquetas/estacao'
import { guardarEstacaoEtiquetas, erroEstacao } from '../acesso'

export const dynamic = 'force-dynamic'

// Usada SÓ pela página /estacao-impressao (o Chrome de cada PC com impressora).
// GET  ?estacao=&nome=&ua= → sinal de vida + pega os pedidos pendentes (já ficam "imprimindo")
// POST { id, ok, erro? } → resultado da impressão

export async function GET(req: NextRequest) {
  const a = await guardarEstacaoEtiquetas(req)
  if (a.resposta) return a.resposta
  const p = req.nextUrl.searchParams
  // cada PC com impressora manda o id e o nome que deram a ele (19/11/2026); sem id = a antiga ('termica')
  const id = p.get('estacao')
  const estacao = { id: idEstacaoValido(id) ? id : ESTACAO_ID, nome: limparNomeEstacao(p.get('nome')) }
  try {
    const trabalhos = await sinalEPegar(a.autor, { ua: (p.get('ua') || '').slice(0, 300), ajuste: (p.get('ajuste') || '').slice(0, 300) }, estacao)
    return NextResponse.json({ ok: true, trabalhos })
  } catch (e) { return erroEstacao(e) }
}

export async function POST(req: NextRequest) {
  const a = await guardarEstacaoEtiquetas(req)
  if (a.resposta) return a.resposta
  const b = await req.json().catch(() => null) as { id?: unknown; ok?: unknown; erro?: unknown } | null
  const id = Number(b?.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  try {
    await concluir(id, b?.ok === true, typeof b?.erro === 'string' ? b.erro : undefined)
    return NextResponse.json({ ok: true })
  } catch (e) { return erroEstacao(e) }
}
