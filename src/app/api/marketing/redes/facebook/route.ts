// Acessos → Facebook ao vivo (25/11/2026): visualizações, alcance, seguidores × não seguidores, orgânico × anúncio
// e TODOS os posts da Página com os números de cada um. GET ?dias=7|28 [&forcar=1]. Ver lib/marketing/redes/meta-detalhe.ts.
import { NextResponse } from 'next/server'
import { guardarSite } from '@/lib/marketing/redes/server'
import { detalheFacebook } from '@/lib/marketing/redes/meta-detalhe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const dias = q.get('dias') === '7' ? 7 : 28
  try {
    const d = await detalheFacebook(dias, q.get('forcar') === '1')
    if (!d) return NextResponse.json({ ok: false, erro: 'Facebook não ligado.' }, { status: 404 })
    return NextResponse.json({ ok: true, ...d })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 })
  }
}
