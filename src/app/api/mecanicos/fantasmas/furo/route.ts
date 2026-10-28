// Furo de km de um mecânico (José, 28/10/2026). GET ?tecnico=&mes= → dias com GPS × cobrado e paradas ·
// GET ?tecnico=&mes=&rota=AAAA-MM-DD → o dia aberto (rota, paradas com cidade, trechos, tempo no cliente) · POST {tecnico, mes, forcar?} → o Tratorilson resume onde foi o furo.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { furoKm, analisarFuro, diaDetalhado } from '@/lib/mecanicos/furo-km-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const mesOk = (m: unknown) => (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? m : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7))
const MODULOS = [{ modulo: 'mecanicos' }, { modulo: 'pos' }]

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, MODULOS)
  if (g.resposta) return g.resposta
  const sp = req.nextUrl.searchParams
  const tecnico = sp.get('tecnico') || ''
  if (!tecnico) return NextResponse.json({ error: 'tecnico obrigatório' }, { status: 400 })
  try {
    const mes = mesOk(sp.get('mes'))
    const dia = sp.get('rota')
    if (dia) {
      // um dia aberto: rota, paradas com cidade, trechos e o cliente de cada OS (só a placa que o técnico usou naquele dia)
      const dd = await diaDetalhado(tecnico, mes, dia)
      return NextResponse.json(dd || { pontos: [], paradas: [] })
    }
    const fk = await furoKm(tecnico, mes)
    if (!fk) return NextResponse.json({ error: 'Técnico sem dados no mês' }, { status: 404 })
    return NextResponse.json(fk)
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, MODULOS)
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({}))
  if (!b.tecnico) return NextResponse.json({ error: 'tecnico obrigatório' }, { status: 400 })
  try {
    const a = await analisarFuro(String(b.tecnico), mesOk(b.mes), !!b.forcar)
    if (!a) return NextResponse.json({ error: 'Técnico sem dados no mês' }, { status: 404 })
    return NextResponse.json(a)
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}
