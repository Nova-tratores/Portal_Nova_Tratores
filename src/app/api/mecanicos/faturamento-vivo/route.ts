// Faturamento do pós-vendas AO VIVO (José, 16/10/2026): hoje, semana (seg–dom) e mês —
// bruto, custo de terceiros (requisições da OS) e líquido, separado em serviço/km/peças —
// e os últimos faturamentos. A tela consulta a cada 20 s.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { carregarBase } from '@/lib/mecanicos/painel-server'
import { segundaDa, type OSFaturada } from '@/lib/mecanicos/painel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function somar(os: OSFaturada[]) {
  const t = { os: os.length, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, horas: 0, km: 0 }
  for (const o of os) { t.servico += o.servico; t.kmValor += o.kmValor; t.pecas += o.pecas; t.outros += o.outros; t.bruto += o.bruto; t.custo += o.custo; t.horas += o.horasCobradas; t.km += o.km }
  t.liquido = t.bruto - t.custo
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = Math.round(t[k] * 100) / 100
  return t
}

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  const hoje = hojeSP()
  const ini = hoje.slice(0, 8) + '01'
  const seg = segundaDa(hoje)
  const de = seg < ini ? seg : ini
  try {
    const base = await carregarBase(de, hoje)
    const fat = base.faturadas
    const mes = fat.filter((o) => o.data >= ini)
    const ultimos = [...fat].sort((a, b) => (b.em || `${b.data}T12:00`).localeCompare(a.em || `${a.data}T12:00`)).slice(0, 15)
    // dia a dia do mês (gráfico)
    const porDia: Record<string, { bruto: number; liquido: number }> = {}
    for (const o of mes) { const d = (porDia[o.data] ||= { bruto: 0, liquido: 0 }); d.bruto += o.bruto; d.liquido += o.bruto - o.custo }
    return NextResponse.json({
      agora: new Date().toISOString(), hoje,
      dia: somar(fat.filter((o) => o.data === hoje)),
      semana: somar(fat.filter((o) => o.data >= seg)),
      mes: somar(mes),
      porDia: Object.entries(porDia).sort().map(([data, v]) => ({ data, bruto: Math.round(v.bruto * 100) / 100, liquido: Math.round(v.liquido * 100) / 100 })),
      ultimos,
    })
  } catch (e) {
    console.error('[mecanicos/faturamento-vivo]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha' }, { status: 500 })
  }
}
