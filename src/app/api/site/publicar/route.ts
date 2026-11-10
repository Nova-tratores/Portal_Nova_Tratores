// "Publicar site" (portal, módulo Site → Conteúdo). Chama o gancho de publicação da hospedagem do site
// (SITE_DEPLOY_HOOK = URL do "Deploy hook" do Cloudflare Pages). O site é gerado de novo em ~2 min, já com o
// conteúdo e o catálogo do portal. Quem publica: módulo Site inteiro ou site:conteudo:publicar.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  const pode = g.user.isAdmin || g.user.modulos.includes('site') || g.user.modulos.includes('site:conteudo:publicar')
  if (!pode) return NextResponse.json({ ok: false, erro: 'sem permissão para publicar o site' }, { status: 403 })
  const hook = process.env.SITE_DEPLOY_HOOK
  const por = g.user.nome || g.user.email || 'Portal'
  if (!hook) {
    return NextResponse.json({ ok: false, erro: 'Falta configurar SITE_DEPLOY_HOOK no portal (Cloudflare Pages → o projeto do site → Settings → Builds → Deploy hooks).' }, { status: 503 })
  }
  // um pedido por minuto basta: a hospedagem já junta pedidos seguidos
  const { data: ultima } = await sb.from('site_publicacoes').select('pedido_em').eq('ok', true).order('pedido_em', { ascending: false }).limit(1).maybeSingle()
  if (ultima && Date.now() - new Date((ultima as { pedido_em: string }).pedido_em).getTime() < 60_000) {
    return NextResponse.json({ ok: false, erro: 'O site já está sendo publicado. Espere um minuto.' }, { status: 429 })
  }
  let ok = false, resposta = ''
  try {
    const r = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(15_000) })
    ok = r.ok
    resposta = `${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`
  } catch (e) {
    resposta = e instanceof Error ? e.message : 'erro'
  }
  const { data } = await sb.from('site_publicacoes').insert({ por, ok, resposta }).select('*').single()
  if (!ok) return NextResponse.json({ ok: false, erro: `A hospedagem recusou a publicação (${resposta}).`, publicacao: data }, { status: 502 })
  return NextResponse.json({ ok: true, publicacao: data })
}
