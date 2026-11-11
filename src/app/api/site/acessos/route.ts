// Acessos do site (portal, módulo Site → Acessos). ?dias=1|7|30|90 ou ?mes=AAAA-MM (José, 11/11: "ver por mês") → resumo + visitas recentes com a jornada.
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, guardarSite, sb, semMigration } from '@/lib/site/server'
import { montarVisitas, resumir, type EventoSite } from '@/lib/site/acessos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const params = new URL(req.url).searchParams
  const pedido = Number(params.get('dias'))
  const dias = [1, 7, 30, 90].includes(pedido) ? pedido : 7
  // Mês fechado pelo relógio de Piraju (-03:00, sem horário de verão)
  const mes = /^d{4}-(0[1-9]|1[0-2])$/.test(params.get('mes') || '') ? params.get('mes')! : null
  let desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  let ate: string | null = null
  if (mes) {
    const [a, m] = mes.split('-').map(Number)
    desde = new Date(`${mes}-01T00:00:00-03:00`).toISOString()
    ate = new Date(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00-03:00`).toISOString()
  }
  const eventos: EventoSite[] = []
  // paginado: até 50 mil eventos no período
  for (let de = 0; de < 50_000; de += 1000) {
    let q = sb.from('site_eventos')
      .select('em, tipo, visitante, sessao, caminho, titulo, origem, utm, aparelho, evento, rotulo, tempo_s, rolou')
      .gte('em', desde)
    if (ate) q = q.lt('em', ate)
    const { data, error } = await q.order('em', { ascending: true }).range(de, de + 999)
    if (error) {
      const falta = semMigration(error.message)
      return NextResponse.json({ ok: false, erro: falta ? AVISO_MIGRATION : error.message }, { status: falta ? 503 : 500 })
    }
    eventos.push(...((data || []) as EventoSite[]))
    if (!data || data.length < 1000) break
  }
  const visitas = montarVisitas(eventos)
  let qp = sb.from('site_pedidos').select('id', { count: 'exact', head: true }).gte('criado_em', desde)
  if (ate) qp = qp.lt('criado_em', ate)
  const { count } = await qp
  return NextResponse.json({ ok: true, dias, mes, resumo: resumir(visitas), pedidos: count ?? 0, visitas: visitas.slice(0, 80) })
}
