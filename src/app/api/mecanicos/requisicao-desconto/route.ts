// Requisição cobrada do técnico (José, 20/10/2026): a tela da requisição mostra que ela foi descontada de um
// técnico, em quantas vezes, em quais meses e quanto falta. GET ?id=<nº da requisição>.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { descontosDaRequisicao } from '@/lib/mecanicos/lancamento-comissao-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'requisicoes' }, { modulo: 'mecanicos' }, { modulo: 'pos' }, { modulo: 'financeiro' }])
  if (g.resposta) return g.resposta
  const id = String(req.nextUrl.searchParams.get('id') || '').replace(/\D/g, '')
  if (!id) return NextResponse.json({ descontos: [] })
  try { return NextResponse.json({ descontos: await descontosDaRequisicao(id) }) }
  catch (e) { return NextResponse.json({ descontos: [], erro: e instanceof Error ? e.message : 'Falha' }) }
}
