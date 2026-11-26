// Botão "Ligar" / "Desligar" do Instagram e do Facebook (Conteúdo e publicar → Contas), 25/11/2026.
// GET ?rede=instagram|facebook → { url } do login da Meta (o navegador vai para lá).
// DELETE ?rede=… → esquece a conta ligada (apaga o token). Ver lib/marketing/redes/meta.ts.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { metaPronta, urlDoLogin, type RedeMeta } from '@/lib/marketing/redes/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')
const redeDe = (req: Request): RedeMeta => (new URL(req.url).searchParams.get('rede') === 'facebook' ? 'facebook' : 'instagram')

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const rede = redeDe(req)
  if (!metaPronta(rede)) {
    const falta = rede === 'facebook' ? 'META_CONFIG_ID_FACEBOOK' : 'META_APP_ID, META_APP_SECRET ou META_CONFIG_ID'
    return NextResponse.json({ ok: false, erro: `Falta ${falta} no Railway.` }, { status: 503 })
  }
  return NextResponse.json({ ok: true, url: urlDoLogin(g.user.nome || g.user.email || 'Portal', rede) })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const { error } = await sb.from('site_redes_contas').delete().eq('rede', redeDe(req))
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
