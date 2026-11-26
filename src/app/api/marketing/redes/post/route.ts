// Janela de um post (Acessos → Instagram/Facebook, 25/11/2026): GET ?rede=instagram|facebook&id=…
// Devolve o vídeo (para tocar ali) e todas as estatísticas do post. Ver lib/marketing/redes/meta-post.ts.
import { NextResponse } from 'next/server'
import { guardarSite } from '@/lib/marketing/redes/server'
import { abrirPost } from '@/lib/marketing/redes/meta-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardarSite(req, 'acessos')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const rede = q.get('rede') === 'facebook' ? 'facebook' : 'instagram'
  const id = q.get('id') || ''
  // id de post da Meta: só números e "_" (não deixa montar outro caminho na Graph API)
  if (!/^[0-9_]{5,60}$/.test(id)) return NextResponse.json({ ok: false, erro: 'post inválido' }, { status: 400 })
  try {
    const p = await abrirPost(rede, id)
    if (!p) return NextResponse.json({ ok: false, erro: 'Rede não ligada.' }, { status: 404 })
    return NextResponse.json({ ok: true, ...p })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 502 })
  }
}
