// Botão "Ligar" / "Desligar" do Instagram (Conteúdo e publicar → Contas), 25/11/2026. Ver lib/marketing/redes/meta.ts.
// GET → { url } do login da Meta (o navegador vai para lá). DELETE → esquece a conta ligada (apaga o token).
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { metaPronta, urlDoLogin } from '@/lib/marketing/redes/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  if (!metaPronta()) return NextResponse.json({ ok: false, erro: 'Faltam META_APP_ID, META_APP_SECRET ou META_CONFIG_ID no Railway.' }, { status: 503 })
  return NextResponse.json({ ok: true, url: urlDoLogin(g.user.nome || g.user.email || 'Portal') })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const { error } = await sb.from('site_redes_contas').delete().eq('rede', 'instagram')
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
