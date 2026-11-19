// "Publicar site" (portal, módulo Site → Conteúdo). Chama o gancho de publicação da hospedagem do site
// (SITE_DEPLOY_HOOK = URL do "Deploy hook" do Cloudflare Pages). O site é gerado de novo em ~2 min, já com o
// conteúdo e o catálogo do portal. Quem publica: módulo Site inteiro ou site:conteudo:publicar.
import { NextResponse } from 'next/server'
import { sb } from '@/lib/marketing/redes/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'

export const runtime = 'nodejs'

/** Quem vê a barra de publicar: telas Conteúdo, Catálogo ou Promoções. */
const guardaBarra = (req: Request) => protegerRota(req, [{ modulo: 'marketing', acao: 'conteudo' }, { modulo: 'marketing', acao: 'catalogo' }, { modulo: 'marketing', acao: 'promocoes' }])
const podePublicar = (u: { isAdmin: boolean; modulos: string[] }) => u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:publicar')

// GET (12/11): há mudança gravada no portal (conteúdo, máquinas, promoções) depois da última publicação?
export async function GET(req: Request) {
  const g = await guardaBarra(req)
  if (g.resposta) return g.resposta
  const ult = async (t: string, col: string, filtro?: [string, string]) => {
    let q = sb.from(t).select(col).order(col, { ascending: false }).limit(1)
    if (filtro) q = q.eq(filtro[0], filtro[1])
    const { data } = await q.maybeSingle()
    return ((data as Record<string, string> | null)?.[col]) || null
  }
  const [pub, conteudo, catalogo, promo, promoApagada, maqApagada, marcas] = await Promise.all([
    sb.from('site_publicacoes').select('pedido_em, por').eq('ok', true).order('pedido_em', { ascending: false }).limit(1).maybeSingle(),
    ult('site_conteudo', 'atualizado_em'), ult('site_catalogo', 'atualizado_em'), ult('site_promocoes', 'atualizado_em'),
    ult('site_conteudo_hist', 'em', ['grupo', 'promocoes']), ult('site_catalogo_hist', 'em', ['campo', 'apagou']), ult('site_marcas', 'atualizado_em'),
  ])
  const ultima = (pub.data as { pedido_em: string; por: string | null } | null) || null
  const mudou = [conteudo, catalogo, promo, promoApagada, maqApagada, marcas].filter(Boolean).sort().pop() || null
  return NextResponse.json({
    ok: true, ultima, mudancaEm: mudou, pendente: !!mudou && (!ultima || mudou > ultima.pedido_em),
    podePublicar: podePublicar(g.user), hookConfigurado: !!process.env.SITE_DEPLOY_HOOK,
  })
}

export async function POST(req: Request) {
  const g = await guardaBarra(req)
  if (g.resposta) return g.resposta
  if (!podePublicar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão para publicar o site' }, { status: 403 })
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
