// Controle das comissões (José, 04/11/2026): GET ?ate=YYYY-MM&n=6 → pessoa × mês (enviada, autorizada, no RH, paga).
import { NextRequest, NextResponse } from 'next/server'
import { guardarComissao } from '@/lib/mecanicos/lancamento-comissao-rota'
import { controleComissoes } from '@/lib/mecanicos/controle-comissoes-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mesSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const andar = (m: string, k: number) => { const a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - 1 + k; return `${a + Math.floor(x / 12)}-${String(((x % 12) + 12) % 12 + 1).padStart(2, '0')}` }

export async function GET(req: NextRequest) {
  const g = await guardarComissao(req)
  if (g.resposta) return g.resposta
  const p = req.nextUrl.searchParams
  const hoje = mesSP()
  const ate = /^\d{4}-\d{2}$/.test(p.get('ate') || '') && p.get('ate')! <= hoje ? p.get('ate')! : hoje
  const n = Math.min(12, Math.max(1, Number(p.get('n')) || 6))
  try {
    return NextResponse.json(await controleComissoes(Array.from({ length: n }, (_, i) => andar(ate, -i)), hoje))
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 }) }
}
