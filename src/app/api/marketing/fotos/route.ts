// Banco de fotos do Marketing (26/11/2026). Ver lib/marketing/fotos.
// GET ?q=texto&etiqueta=a,b&origem=envio|youtube&ruins=1&pagina=0  → fotos + quantas de cada etiqueta
// POST multipart arquivo (1 a 10 fotos)                            → guarda e etiqueta pela IA
// PATCH { id, etiquetas?, descricao?, modelo? } ou { id, refazer: true } (IA lê de novo)
// DELETE ?id=
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { ETIQUETAS, iaPronta } from '@/lib/marketing/fotos/ia'
import { MSG_SQL, apagarFoto, etiquetar, faltaTabela, salvarFoto } from '@/lib/marketing/fotos/salvar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const POR_PAGINA = 60
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')
const erro = (m: string, status = 500) => NextResponse.json({ ok: false, erro: faltaTabela(m) ? MSG_SQL : m }, { status: faltaTabela(m) ? 503 : status })

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const pagina = Math.max(0, Number(q.get('pagina')) || 0)
  const etiquetas = (q.get('etiqueta') || '').split(',').map((s) => s.trim()).filter((s) => (ETIQUETAS as readonly string[]).includes(s))
  const texto = (q.get('q') || '').trim().slice(0, 60).replace(/[%,()]/g, ' ')

  let busca = sb.from('mkt_fotos').select('*', { count: 'exact' })
  if (etiquetas.length) busca = busca.contains('etiquetas', etiquetas)
  if (texto) busca = busca.or(`descricao.ilike.%${texto}%,modelo.ilike.%${texto}%,origem_titulo.ilike.%${texto}%`)
  const origem = q.get('origem')
  if (origem === 'envio' || origem === 'youtube') busca = busca.eq('origem', origem)
  const { data, count, error } = await busca.order('nota', { ascending: false, nullsFirst: false }).order('criado_em', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
  if (error) return erro(error.message)

  // quantas fotos de cada etiqueta (para os filtros mostrarem o número)
  const { data: todas } = await sb.from('mkt_fotos').select('etiquetas').limit(5000)
  const contagem: Record<string, number> = {}
  for (const f of (todas || []) as { etiquetas: string[] }[]) for (const e of f.etiquetas || []) contagem[e] = (contagem[e] || 0) + 1

  return NextResponse.json({ ok: true, fotos: data || [], total: count || 0, porPagina: POR_PAGINA, contagem, etiquetas: ETIQUETAS, ia: iaPronta(), podeEditar: podeEditar(g.user) })
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const form = await req.formData().catch(() => null)
  const arquivos = (form?.getAll('arquivo') || []).filter((a): a is File => a instanceof File).slice(0, 10)
  if (!arquivos.length) return NextResponse.json({ ok: false, erro: 'nenhuma foto enviada' }, { status: 400 })
  const por = g.user.nome || g.user.email || 'Portal'
  const fotos: unknown[] = []
  const falhas: string[] = []
  for (const a of arquivos) {
    if (!TIPOS.includes(a.type)) { falhas.push(`${a.name}: use JPG, PNG ou WebP`); continue }
    if (a.size > 20 * 1024 * 1024) { falhas.push(`${a.name}: acima de 20 MB`); continue }
    try { fotos.push(await salvarFoto(Buffer.from(await a.arrayBuffer()), { origem: 'envio' }, por)) }
    catch (e) {
      const m = (e as Error).message
      if (m === MSG_SQL) return erro(m)
      falhas.push(`${a.name}: ${m}`)
    }
  }
  return NextResponse.json({ ok: fotos.length > 0, fotos, falhas, erro: fotos.length ? undefined : falhas[0] })
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as { id?: string; refazer?: boolean; etiquetas?: unknown; descricao?: unknown; modelo?: unknown }
  const id = String(b.id || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, erro: 'foto inválida' }, { status: 400 })

  if (b.refazer) {
    if (!iaPronta()) return NextResponse.json({ ok: false, erro: 'IA não configurada (ANTHROPIC_API_KEY)' }, { status: 503 })
    const { data: f } = await sb.from('mkt_fotos').select('url').eq('id', id).maybeSingle()
    if (!f) return NextResponse.json({ ok: false, erro: 'foto não encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, foto: await etiquetar(id, (f as { url: string }).url) })
  }

  const v: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (Array.isArray(b.etiquetas)) v.etiquetas = [...new Set(b.etiquetas.map(String).filter((e) => (ETIQUETAS as readonly string[]).includes(e)))].slice(0, 12)
  if ('descricao' in b) v.descricao = String(b.descricao ?? '').trim().slice(0, 300) || null
  if ('modelo' in b) v.modelo = String(b.modelo ?? '').trim().slice(0, 60) || null
  const { data, error } = await sb.from('mkt_fotos').update(v).eq('id', id).select('*').single()
  if (error) return erro(error.message, 400)
  return NextResponse.json({ ok: true, foto: data })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, erro: 'foto inválida' }, { status: 400 })
  try { await apagarFoto(id) } catch (e) { return erro((e as Error).message) }
  return NextResponse.json({ ok: true })
}
