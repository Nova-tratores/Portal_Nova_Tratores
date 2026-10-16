// Painel do pós-vendas por técnico (José, 16/10/2026).
// GET ?tipo=semana|mes&ref=YYYY-MM-DD → período (seg–sex ou mês), linhas por técnico, total,
// série (8 semanas ou 6 meses), OS faturadas e dias registrados do período (drill / ficha).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { carregarBase } from '@/lib/mecanicos/painel-server'
import { agregar, pesosPorOS, ultimasSemanas, ultimosMeses } from '@/lib/mecanicos/painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') === 'mes' ? 'mes' : 'semana'
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('ref') || '') ? sp.get('ref')! : hojeSP()
  const buckets = tipo === 'semana' ? ultimasSemanas(ref, 8) : ultimosMeses(ref, 6)
  const atual = buckets[buckets.length - 1]
  const de = buckets[0].de, ate = atual.ate
  try {
    const base = await carregarBase(de, ate)
    const pesos = pesosPorOS(base.diasTodos)
    const periodo = agregar(atual.de, atual.ate, base.tecnicos, base.dias, base.faturadas, pesos)
    const serie = buckets.map((b) => {
      const r = agregar(b.de, b.ate, base.tecnicos, base.dias, base.faturadas, pesos)
      return { ...b, total: r.total, porTecnico: Object.fromEntries(r.linhas.map((l) => [l.tecnico, { faturadas: l.faturadas, internas: l.internas, ociosas: l.ociosas, bruto: l.bruto, liquido: l.liquido, km: l.km }])) }
    })
    const noPeriodo = (d: string) => d >= atual.de && d <= atual.ate
    return NextResponse.json({
      tipo, ref, periodo: { de: atual.de, ate: atual.ate, rotulo: atual.rotulo },
      linhas: periodo.linhas, total: periodo.total, serie,
      os: base.faturadas.filter((o) => noPeriodo(o.data)).sort((a, b) => b.data.localeCompare(a.data)),
      dias: base.dias.filter((d) => noPeriodo(d.data)),
    })
  } catch (e) {
    console.error('[mecanicos/painel]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao montar o painel' }, { status: 500 })
  }
}
