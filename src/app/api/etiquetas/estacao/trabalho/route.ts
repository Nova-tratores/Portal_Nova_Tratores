import { NextRequest, NextResponse } from 'next/server'
import { concluir, sinalEPegar } from '@/lib/etiquetas/estacao-server'
import { acessoEtiquetas, erroEstacao } from '../acesso'

export const dynamic = 'force-dynamic'

// Usada SÓ pela página /estacao-impressao (o Chrome do PC da ROGERIA).
// GET  ?versao=&ua= → sinal de vida + pega os pedidos pendentes (já ficam "imprimindo")
// POST { id, ok, erro? } → resultado da impressão

export async function GET(req: NextRequest) {
  const a = await acessoEtiquetas(req)
  if (a.resposta) return a.resposta
  const p = req.nextUrl.searchParams
  try {
    const trabalhos = await sinalEPegar(a.autor, { ua: (p.get('ua') || '').slice(0, 300), ajuste: (p.get('ajuste') || '').slice(0, 300) })
    return NextResponse.json({ ok: true, trabalhos })
  } catch (e) { return erroEstacao(e) }
}

export async function POST(req: NextRequest) {
  const a = await acessoEtiquetas(req)
  if (a.resposta) return a.resposta
  const b = await req.json().catch(() => null) as { id?: unknown; ok?: unknown; erro?: unknown } | null
  const id = Number(b?.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  try {
    await concluir(id, b?.ok === true, typeof b?.erro === 'string' ? b.erro : undefined)
    return NextResponse.json({ ok: true })
  } catch (e) { return erroEstacao(e) }
}
