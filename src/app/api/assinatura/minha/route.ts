// A assinatura salva de quem está logado (para pedir/autorizar a comissão sem desenhar de novo) — José, 29/10/2026.
// POST {png} cadastra a própria · POST {acao:'link'} gera o link para assinar pelo celular (José, 30/10/2026).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { lerAssinatura, gravarAssinatura, criarLink } from '@/lib/assinaturas/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const a = await autenticar(req)
  if (!a) return NextResponse.json({ error: 'Sem login' }, { status: 401 })
  try { return NextResponse.json({ assinatura: await lerAssinatura(a.userId) }) }
  catch (e) { return NextResponse.json({ assinatura: null, error: e instanceof Error ? e.message : String(e) }) }
}

/** O link abre no celular: nunca pode sair com localhost nem com o endereço interno do servidor. */
function origemPublica(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (!host || /^(localhost|127\.|0\.0\.0\.0)/.test(host)) return 'https://portal.novatratores.com'
  return `${req.headers.get('x-forwarded-proto') || 'https'}://${host}`
}

export async function POST(req: NextRequest) {
  const a = await autenticar(req)
  if (!a) return NextResponse.json({ error: 'Sem login' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  try {
    if (b.acao === 'link') {
      const token = await criarLink(a.userId, a.email || a.userId)
      return NextResponse.json({ url: `${origemPublica(req)}/assinatura/${token}` })
    }
    await gravarAssinatura(a.userId, b.png, 'admin', a.email || a.userId)
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }
}
