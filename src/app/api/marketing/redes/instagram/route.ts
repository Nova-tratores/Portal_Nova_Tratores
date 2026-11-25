// Acessos → Instagram ao vivo (25/11/2026): público, tipo de conteúdo, seguidores × não seguidores e os posts.
// GET ?dias=7|30 [&forcar=1 ignora os 15 min guardados]. Ver lib/marketing/redes/meta-detalhe.ts.
import { NextResponse } from 'next/server'
import { guardarSite } from '@/lib/marketing/redes/server'
import { detalheInstagram } from '@/lib/marketing/redes/meta-detalhe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const dias = q.get('dias') === '7' ? 7 : 30
  try {
    const d = await detalheInstagram(dias, q.get('forcar') === '1')
    if (!d) return NextResponse.json({ ok: false, erro: 'Instagram não ligado.' }, { status: 404 })
    return NextResponse.json({ ok: true, ...d })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 })
  }
}
