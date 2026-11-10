// Acessos do site (portal, módulo Site → Acessos). ?dias=1|7|30|90 → resumo + visitas recentes com a jornada.
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, guardarSite, sb, semMigration } from '@/lib/site/server'
import { montarVisitas, resumir, type EventoSite } from '@/lib/site/acessos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const pedido = Number(new URL(req.url).searchParams.get('dias'))
  const dias = [1, 7, 30, 90].includes(pedido) ? pedido : 7
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const eventos: EventoSite[] = []
  // paginado: até 50 mil eventos no período
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await sb.from('site_eventos')
      .select('em, tipo, visitante, sessao, caminho, titulo, origem, utm, aparelho, evento, rotulo, tempo_s, rolou')
      .gte('em', desde).order('em', { ascending: true }).range(de, de + 999)
    if (error) {
      const falta = semMigration(error.message)
      return NextResponse.json({ ok: false, erro: falta ? AVISO_MIGRATION : error.message }, { status: falta ? 503 : 500 })
    }
    eventos.push(...((data || []) as EventoSite[]))
    if (!data || data.length < 1000) break
  }
  const visitas = montarVisitas(eventos)
  const { count } = await sb.from('site_pedidos').select('id', { count: 'exact', head: true }).gte('criado_em', desde)
  return NextResponse.json({ ok: true, dias, resumo: resumir(visitas), pedidos: count ?? 0, visitas: visitas.slice(0, 80) })
}
