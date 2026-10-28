// Lançamento da comissão pelo portal com autorização do diretor (José, 20/10/2026).
// GET ?mes=&tecnico=&abertos=1 (pedidos) · GET ?eventos=1[&tecnico=&mes=] (histórico)
// POST = pedir autorização (com a assinatura de quem pede)
// PATCH {id, acao:'autorizar'|'devolver', observacao, apontamentos, assinatura} = diretor decide.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { guardarComissao } from '@/lib/mecanicos/lancamento-comissao-rota'
import { listarPedidos, listarEventos, pedirLancamento, decidirPedido, ehDiretor, SemTabela } from '@/lib/mecanicos/lancamento-comissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const erro = (e: unknown) => {
  if (e instanceof SemTabela) return NextResponse.json({ error: e.message, semTabela: true }, { status: 503 })
  const st = (e as { status?: number })?.status || 500
  return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: st })
}
const metaDe = (req: NextRequest) => ({ ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, ua: req.headers.get('user-agent')?.slice(0, 300) || null })

export async function GET(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  const p = req.nextUrl.searchParams
  try {
    const diretor = await ehDiretor(g.user!.id)
    const f = { mes: p.get('mes') || undefined, tecnico: p.get('tecnico') || undefined }
    if (p.get('eventos') === '1') return NextResponse.json({ eventos: await listarEventos(f), diretor })
    const pedidos = await listarPedidos({ ...f, abertos: p.get('abertos') === '1' })
    return NextResponse.json({ pedidos, diretor })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try {
    const b = await req.json()
    const r = await pedirLancamento(
      { tecnico: String(b.tecnico || ''), mes: String(b.mes || ''), valor: Number(b.valor), calculado: Number(b.calculado) || 0, linhas: Array.isArray(b.linhas) ? b.linhas : [], assinatura: b.assinatura, info: b.info && typeof b.info === 'object' ? b.info : null, descontos: b.descontos },
      { id: g.user!.id, nome: autorDe(g.user!) }, metaDe(req),
    )
    return NextResponse.json(r)
  } catch (e) { return erro(e) }
}

export async function PATCH(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  try {
    const b = await req.json()
    const acao = b.acao === 'devolver' ? 'devolver' : 'autorizar'
    return NextResponse.json(await decidirPedido(String(b.id || ''), { acao, observacao: b.observacao, apontamentos: b.apontamentos, assinatura: b.assinatura }, { id: g.user!.id, nome: g.user!.nome }, metaDe(req)))
  } catch (e) { return erro(e) }
}
