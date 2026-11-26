// Robô dos posts (26/11/2026). GET = próximas vagas e o que o robô já fez · POST { max? } = roda agora.
// O mesmo robô roda sozinho todo dia às 07:00 (agendador 'marketing-robo-posts'). Ver lib/marketing/robo/robo.ts.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { MSG_SQL_ROBO, rodarRobo, vagasDoPeriodo } from '@/lib/marketing/robo/robo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data, error } = await sb.from('mkt_robo').select('*').order('criado_em', { ascending: false }).limit(60)
  if (error) return NextResponse.json({ ok: false, erro: /mkt_robo|does not exist|schema cache/i.test(error.message) ? MSG_SQL_ROBO : error.message }, { status: 503 })
  return NextResponse.json({ ok: true, vagas: vagasDoPeriodo(hoje).map((v) => ({ chave: v.chave, dia: v.dia, tipo: v.tipo })), caderno: data || [] })
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as { max?: number }
  try {
    const r = await rodarRobo(Math.max(1, Math.min(5, Number(b.max) || 3)))
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 })
  }
}
