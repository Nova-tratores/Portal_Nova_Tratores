// Comissão do escritório do pós-vendas (José, 29/10/2026). Regra em lib/mecanicos/comissao-escritorio-server.ts.
// GET ?mes=YYYY-MM → garantistas, bases do mês (garantias e revisões faturadas, OS + peças) e o cálculo.
// PUT { pctRevisao } → muda a % das revisões: só o Gerente do Pós-Vendas (função na Administração).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { comissaoEscritorio, gravarConfigEscritorio, ACAO_GERENTE } from '@/lib/mecanicos/comissao-escritorio-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mesSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const q = req.nextUrl.searchParams.get('mes') || ''
  const mes = /^\d{4}-\d{2}$/.test(q) ? q : mesSP()
  try {
    const r = await comissaoEscritorio(mes)
    return NextResponse.json({ ...r, podeEditar: g.user.modulos.includes(ACAO_GERENTE) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  if (!g.user.modulos.includes(ACAO_GERENTE)) return NextResponse.json({ error: 'Só o Gerente do Pós-Vendas muda a % das revisões.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  try {
    const config = await gravarConfigEscritorio(b.pctRevisao, g.user.email || g.user.id)
    return NextResponse.json({ config })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
