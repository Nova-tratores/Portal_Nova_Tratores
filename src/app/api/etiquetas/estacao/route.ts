import { NextRequest, NextResponse } from 'next/server'
import { ESTACAO_ID, idEstacaoValido, limparItens, type OrigemEtiqueta } from '@/lib/etiquetas/estacao'
import { cancelar, enfileirar, estacoes, lerDestinoUsuario, recentes, reenviar, salvarDestinoUsuario } from '@/lib/etiquetas/estacao-server'
import { guardarEstacaoEtiquetas, erroEstacao } from './acesso'

export const dynamic = 'force-dynamic'

// Estações de impressão da térmica (uma por PC com impressora — 19/11/2026).
// GET  → { estacoes, destino (o da pessoa: 'local' | id | null), recentes? (?recentes=1&estacao=<id>) }
// POST { origem, itens, estacao? }   → manda as etiquetas (sem estacao = a escolhida pela pessoa)
// POST { acao: 'destino', destino }  → guarda para onde a pessoa manda ('local' ou id da estação)
// POST { acao: 'reenviar'|'cancelar', id }

const ORIGENS: OrigemEtiqueta[] = ['ppv', 'opa', 'patrimonio', 'teste']

export async function GET(req: NextRequest) {
  const a = await guardarEstacaoEtiquetas(req)
  if (a.resposta) return a.resposta
  try {
    const p = req.nextUrl.searchParams
    const est = p.get('estacao')
    const [lista, destino, r] = await Promise.all([
      estacoes(),
      lerDestinoUsuario(a.autor.id),
      p.get('recentes') === '1' ? recentes(idEstacaoValido(est) ? est : ESTACAO_ID) : Promise.resolve(undefined),
    ])
    return NextResponse.json({ ok: true, estacoes: lista, destino, recentes: r })
  } catch (e) { return erroEstacao(e) }
}

export async function POST(req: NextRequest) {
  const a = await guardarEstacaoEtiquetas(req)
  if (a.resposta) return a.resposta
  const b = await req.json().catch(() => null) as { origem?: string; itens?: unknown; acao?: string; id?: unknown; destino?: unknown; estacao?: unknown } | null
  try {
    if (b?.acao === 'destino') {
      const d = b.destino
      if (d !== 'local' && !idEstacaoValido(d)) return NextResponse.json({ ok: false, erro: 'Destino inválido.' }, { status: 400 })
      await salvarDestinoUsuario(a.autor.id, d)
      return NextResponse.json({ ok: true })
    }
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
    let estacao = idEstacaoValido(b?.estacao) ? b.estacao : null
    if (!estacao) {
      const d = await lerDestinoUsuario(a.autor.id)
      estacao = d && d !== 'local' ? d : ESTACAO_ID
    }
    const trabalho = await enfileirar(origem, l.itens, a.autor, estacao)
    return NextResponse.json({ ok: true, trabalho: { id: trabalho.id, total: trabalho.total } })
  } catch (e) { return erroEstacao(e) }
}
