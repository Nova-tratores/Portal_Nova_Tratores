// Furo de km de um mecânico (José, 28/10/2026). GET ?tecnico=&mes= → dias com GPS × cobrado e paradas ·
// GET ?tecnico=&mes=&rota=AAAA-MM-DD → pontos da rota daquele dia · POST {tecnico, mes, forcar?} → o Tratorilson resume onde foi o furo.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { furoKm, analisarFuro } from '@/lib/mecanicos/furo-km-server'
import { computarESalvarRota } from '@/lib/pos/rastreamento'

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
    const fk = await furoKm(tecnico, mesOk(sp.get('mes')))
    if (!fk) return NextResponse.json({ error: 'Técnico sem dados no mês' }, { status: 404 })
    const dia = sp.get('rota')
    if (dia) {
      // só a placa que o técnico usou naquele dia (não abre rota de carro de outra pessoa)
      const d = fk.dias.find((x) => x.data === dia)
      if (!d?.placa) return NextResponse.json({ pontos: [] })
      const r = await computarESalvarRota(supabaseAdmin, d.placa, dia)
      return NextResponse.json({ pontos: (r.pontos || []).map((p) => ({ lat: p.lat, lng: p.lng, dt: p.dt })) })
    }
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
