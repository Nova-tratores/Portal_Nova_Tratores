// Editar a arte em camadas de um post (26/11/2026). Ver lib/marketing/robo/camadas.ts.
// POST { id, camadas, previa: true }      → devolve a imagem (JPG) sem gravar nada (para a prévia da tela)
// POST { id, camadas }                    → redesenha, grava a arte nova no post e devolve { url, arte }
// POST { id, novaCena: true, pedido? }    → pede outra cena à IA (mesmo trator), grava e devolve { url, arte }
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { desenhar, limparCamadas, novaCena, salvarArte, type Camadas } from '@/lib/marketing/robo/camadas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as { id?: string; camadas?: Partial<Camadas>; previa?: boolean; novaCena?: boolean; pedido?: string }
  const id = String(b.id || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, erro: 'post inválido' }, { status: 400 })

  const { data, error } = await sb.from('site_posts').select('arte').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, erro: /arte/.test(error.message) ? 'Rode sql/marketing-arte-camadas.sql no projeto do portal.' : error.message }, { status: 503 })
  const base = (data as { arte?: Camadas | null } | null)?.arte
  if (!base?.cena) return NextResponse.json({ ok: false, erro: 'Este post não tem arte em camadas (só os posts do robô têm).' }, { status: 404 })
  const por = g.user.nome || g.user.email || 'Portal'

  try {
    let c = limparCamadas(b.camadas || {}, base)
    if (b.previa) {
      const jpg = await desenhar(c)
      return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } })
    }
    if (b.novaCena) c = await novaCena(c, String(b.pedido || '').slice(0, 600))
    const url = await salvarArte(id, c, por)
    return NextResponse.json({ ok: true, url, arte: c })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 })
  }
}
