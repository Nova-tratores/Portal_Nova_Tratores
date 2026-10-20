// Ficha completa do técnico (José, 19/10/2026): RH, OS, requisições, frota, ocorrências e a comissão
// OS por OS. GET ?nome=<nome do portal>&mes=YYYY-MM[&forcar=1] (cache de 5 min).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { fichaTecnico } from '@/lib/mecanicos/ficha-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  const p = req.nextUrl.searchParams
  const nome = (p.get('nome') || '').trim()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const mes = /^\d{4}-\d{2}$/.test(p.get('mes') || '') ? p.get('mes')! : hoje.slice(0, 7)
  if (!nome) return NextResponse.json({ error: 'Informe o técnico' }, { status: 400 })
  try {
    return NextResponse.json(await fichaTecnico(nome, mes, p.get('forcar') === '1'))
  } catch (e) {
    console.error('[mecanicos/tecnico]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao montar a ficha' }, { status: 500 })
  }
}
