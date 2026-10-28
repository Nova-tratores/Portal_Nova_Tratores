// Horas e km fantasmas (José, 20/10/2026). GET ?mes=YYYY-MM[&forcar=1] · POST {mes} = o Tratorilson analisa no
// tempário as OS do mês que ainda não têm previsão (até 15 por vez) e devolve quantas faltam.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { fantasmasDoMes } from '@/lib/mecanicos/fantasmas-server'
import { preverOS } from '@/lib/mecanicos/previsao-os-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const mesOk = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? m : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7))

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  try { return NextResponse.json(await fantasmasDoMes(mesOk(req.nextUrl.searchParams.get('mes')), req.nextUrl.searchParams.get('forcar') === '1')) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({}))
  const mes = mesOk(b.mes)
  try {
    const f = await fantasmasDoMes(mes)
    const fila = f.osSemAnalise.slice(0, 15)
    let feitas = 0
    for (const id of fila) { try { if (await preverOS(id)) feitas++ } catch (e) { console.error('[fantasmas] tempário', id, e) } }
    const nova = await fantasmasDoMes(mes, true)
    return NextResponse.json({ feitas, faltam: nova.osSemAnalise.length, semTabela: nova.semTabela })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}
