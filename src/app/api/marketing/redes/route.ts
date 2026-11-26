// Acessos por rede (José, 12/11/2026: "os acessos também precisam se dividir nisso").
// GET ?rede=todas → as 4 redes juntas (aba Todas as redes). GET ?rede=instagram → números por dia gravados pelo robô (site_redes_metricas, 90 dias), a conta ligada (sem token)
// e os posts do calendário daquela rede (o que saiu e o que está marcado).
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { ehRede } from '@/lib/marketing/redes/redes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const rede = q.get('rede') || ''
  const todas = rede === 'todas'
  if (!todas && (!ehRede(rede) || rede === 'site')) return NextResponse.json({ ok: false, erro: 'rede inválida' }, { status: 400 })
  // ?desde=AAAA-MM-DD (25/11/2026, período "de dia tal a dia tal" no Todas as redes): busca mais para trás que os 90 dias,
  // até 2 anos. Sem ele, os 90 dias de sempre.
  const padrao = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const limite = new Date(Date.now() - 740 * 864e5).toISOString().slice(0, 10)
  const pedido = /^\d{4}-\d{2}-\d{2}$/.test(q.get('desde') || '') ? q.get('desde')! : null
  const desde = pedido && pedido < padrao ? (pedido < limite ? limite : pedido) : padrao
  const [m, c, p] = await Promise.all([
    (todas ? sb.from('site_redes_metricas').select('*') : sb.from('site_redes_metricas').select('*').eq('rede', rede)).gte('dia', desde).order('dia'),
    todas ? sb.from('site_redes_contas').select('rede, nome, atualizado_em') : sb.from('site_redes_contas').select('rede, nome, atualizado_em').eq('rede', rede).maybeSingle(),
    (todas ? sb.from('site_posts').select('id, titulo, quando, status, resultado, redes').not('quando', 'is', null) : sb.from('site_posts').select('id, titulo, quando, status, resultado, redes').contains('redes', [rede])).gte('quando', `${desde}T00:00:00-03:00`).order('quando', { ascending: false }).limit(200),
  ])
  const erro = m.error || p.error
  if (erro) {
    const sql = /site_redes|site_posts|does not exist|schema cache/i.test(erro.message)
    return NextResponse.json({ ok: false, erro: sql ? 'Rode sql/site-redes.sql no projeto do portal (citrhumdkfivdzbmayde).' : erro.message }, { status: sql ? 503 : 500 })
  }
  return NextResponse.json({ ok: true, metricas: m.data || [], conta: c.data || null, posts: p.data || [] })
}
