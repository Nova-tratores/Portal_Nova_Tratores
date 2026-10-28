import { NextRequest, NextResponse } from 'next/server'
import { limparItens, type OrigemEtiqueta } from '@/lib/etiquetas/estacao'
import { cancelar, enfileirar, recentes, reenviar, situacao } from '@/lib/etiquetas/estacao-server'
import { acessoEtiquetas, erroEstacao } from './acesso'

export const dynamic = 'force-dynamic'

// Estação de impressão da térmica (ROGERIA).
// GET  → { situacao, recentes? (com ?recentes=1) }
// POST { origem, itens }            → manda as etiquetas para a estação
// POST { acao: 'reenviar'|'cancelar', id }

const ORIGENS: OrigemEtiqueta[] = ['ppv', 'opa', 'patrimonio', 'teste']

export async function GET(req: NextRequest) {
  const a = await acessoEtiquetas(req)
  if (a.resposta) return a.resposta
  try {
    const comRecentes = req.nextUrl.searchParams.get('recentes') === '1'
    const [s, r] = await Promise.all([situacao(), comRecentes ? recentes() : Promise.resolve(undefined)])
    return NextResponse.json({ ok: true, situacao: s, recentes: r })
  } catch (e) { return erroEstacao(e) }
}

export async function POST(req: NextRequest) {
  const a = await acessoEtiquetas(req)
  if (a.resposta) return a.resposta
  const b = await req.json().catch(() => null) as { origem?: string; itens?: unknown; acao?: string; id?: unknown } | null
  try {
    if (b?.acao === 'reenviar' || b?.acao === 'cancelar') {
      const id = Number(b.id)
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
      if (b.acao === 'cancelar') { await cancelar(id); return NextResponse.json({ ok: true }) }
      return NextResponse.json({ ok: true, trabalho: await reenviar(id, a.autor) })
    }
    const origem = ORIGENS.find((o) => o === b?.origem)
    if (!origem) return NextResponse.json({ ok: false, erro: 'Origem inválida.' }, { status: 400 })
    const l = limparItens(b?.itens)
    if ('erro' in l) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
    const trabalho = await enfileirar(origem, l.itens, a.autor)
    return NextResponse.json({ ok: true, trabalho: { id: trabalho.id, total: trabalho.total } })
  } catch (e) { return erroEstacao(e) }
}
