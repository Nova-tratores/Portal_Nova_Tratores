// Promoções da página inicial do site (portal, módulo Site → Promoções). José, 12/11/2026: "coloca a foto da
// promoção, ou seleciona uma máquina do site, para aparecer como nos outros sites"; só aparece quando houver promoção.
// GET lista · POST cria · PATCH muda (ou { ordem: [ids] } reordena) · DELETE ?id= apaga. Aparece no site depois do Publicar.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/marketing/redes/server'
import { ehRede } from '@/lib/marketing/redes/redes'
import { postDaPromocao, type PostDaPromo } from '@/lib/marketing/redes/promo-post'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Rode sql/site-produtos-promocoes.sql e sql/site-redes.sql no projeto do portal (citrhumdkfivdzbmayde).'
const falta = (m: string) => /site_promocoes|arte_feed|arte_vertical|legenda|redes|does not exist|schema cache/i.test(m)
type Linha = Record<string, unknown>

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:promocoes:editar')

function limpar(b: Linha): { ok: true; v: Linha } | { ok: false; erro: string } {
  const v: Linha = {}
  const t = (x: unknown, n: number) => { const s = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n); return s || null }
  if ('titulo' in b) { v.titulo = t(b.titulo, 80); if (!v.titulo || String(v.titulo).length < 2) return { ok: false, erro: 'Escreva o título da promoção' } }
  if ('texto' in b) v.texto = t(b.texto, 240)
  if ('botao' in b) v.botao = t(b.botao, 30)
  if ('imagem' in b) { v.imagem = t(b.imagem, 500); if (v.imagem && !/^https:\/\//.test(String(v.imagem))) return { ok: false, erro: 'Foto inválida' } }
  if ('imagem_celular' in b) { v.imagem_celular = t(b.imagem_celular, 500); if (v.imagem_celular && !/^https:\/\//.test(String(v.imagem_celular))) return { ok: false, erro: 'Foto do celular inválida' } }
  if ('produto_slug' in b) { v.produto_slug = t(b.produto_slug, 120); if (v.produto_slug && !/^[a-z0-9-]+$/.test(String(v.produto_slug))) return { ok: false, erro: 'Máquina inválida' } }
  if ('link' in b) { v.link = t(b.link, 500); if (v.link && !/^(https?:\/\/|\/)/.test(String(v.link))) return { ok: false, erro: 'Link: comece com https:// ou /' } }
  for (const c of ['inicio', 'fim'] as const) if (c in b) { v[c] = t(b[c], 10); if (v[c] && !/^\d{4}-\d{2}-\d{2}$/.test(String(v[c]))) return { ok: false, erro: 'Data inválida' } }
  if (v.inicio && v.fim && String(v.fim) < String(v.inicio)) return { ok: false, erro: 'A data de fim é antes do começo' }
  if ('ativo' in b) v.ativo = b.ativo === true
  // redes (12/11): artes de cada tamanho + texto do post
  for (const c of ['arte_feed', 'arte_vertical', 'video'] as const) if (c in b) { v[c] = t(b[c], 600); if (v[c] && !/^https:\/\//.test(String(v[c]))) return { ok: false, erro: 'Arquivo inválido' } }
  if ('legenda' in b) v.legenda = String(b.legenda ?? '').trim().slice(0, 5000) || null
  if ('redes' in b) { const r = (Array.isArray(b.redes) ? b.redes : []).filter(ehRede); v.redes = r.length ? [...new Set(r)] : ['site'] }
  return { ok: true, v }
}

export async function GET(req: Request) {
  const g = await guardarSite(req, 'promocoes')
  if (g.resposta) return g.resposta
  const { data, error } = await sb.from('site_promocoes').select('*').order('ordem').order('criado_em')
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message }, { status: falta(error.message) ? 503 : 500 })
  // 25/11/2026: cada promoção leva o id do post dela no calendário (o botão abre esse post, não cria outro)
  const ids = (data || []).map((p) => p.id)
  const { data: ps } = ids.length ? await sb.from('site_posts').select('id, promocao_id').in('promocao_id', ids) : { data: [] }
  const postDe = new Map(((ps || []) as { id: string; promocao_id: string }[]).map((x) => [x.promocao_id, x.id]))
  return NextResponse.json({ ok: true, promocoes: (data || []).map((p) => ({ ...p, post_id: postDe.get(p.id) || null })), podeEditar: podeEditar(g.user) })
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'promocoes', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as Linha
  const l = limpar({ titulo: '', ...b })
  if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
  if (!l.v.imagem && !l.v.produto_slug && !l.v.arte_feed && !l.v.arte_vertical && !l.v.video) return NextResponse.json({ ok: false, erro: 'Envie a foto da promoção ou escolha uma máquina do site' }, { status: 400 })
  // Fase 2 do plano do Marketing (23/11/2026): promoção sem fim ficava no ar para sempre
  if (!l.v.fim) return NextResponse.json({ ok: false, erro: 'Informe até quando vale a promoção (data de fim)' }, { status: 400 })
  const { data: ult } = await sb.from('site_promocoes').select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await sb.from('site_promocoes').insert({
    ...l.v, ordem: ((ult as { ordem?: number } | null)?.ordem ?? -1) + 1, atualizado_por: g.user.nome || g.user.email || 'Portal',
  }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, promocao: data, post: await postSemQuebrar(data, g.user.nome || g.user.email || 'Portal') })
}

/** 25/11/2026: gravar a promoção já cria/atualiza o post dela no calendário. Erro aqui não desfaz a promoção. */
async function postSemQuebrar(promo: unknown, por: string): Promise<PostDaPromo | { erro: string }> {
  try { return await postDaPromocao(promo as Parameters<typeof postDaPromocao>[0], por) }
  catch (e) { console.warn('[promocoes] post da promoção:', (e as Error).message); return { erro: (e as Error).message } }
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'promocoes', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as Linha
  const por = g.user.nome || g.user.email || 'Portal'
  const agora = new Date().toISOString()
  if (Array.isArray(b.ordem)) {
    const ids = (b.ordem as unknown[]).map(String).slice(0, 100)
    await Promise.all(ids.map((id, i) => sb.from('site_promocoes').update({ ordem: i, atualizado_em: agora, atualizado_por: por }).eq('id', id)))
    return NextResponse.json({ ok: true })
  }
  const id = String(b.id || '')
  if (!id) return NextResponse.json({ ok: false, erro: 'promoção inválida' }, { status: 400 })
  const l = limpar(b)
  if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
  // Fase 2 (23/11/2026): promoção que continua LIGADA precisa de data de fim (as antigas sem fim pedem na próxima edição).
  // Só desligar não pede data.
  const { data: atual } = await sb.from('site_promocoes').select('fim, ativo').eq('id', id).maybeSingle()
  const ficaLigada = 'ativo' in l.v ? l.v.ativo === true : (atual as { ativo?: boolean } | null)?.ativo !== false
  const fimFinal = 'fim' in l.v ? l.v.fim : (atual as { fim?: string | null } | null)?.fim
  if (ficaLigada && !fimFinal) return NextResponse.json({ ok: false, erro: 'Informe até quando vale a promoção (data de fim). Promoção sem fim ficava no ar para sempre.' }, { status: 400 })
  const { data, error } = await sb.from('site_promocoes').update({ ...l.v, atualizado_em: agora, atualizado_por: por }).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: /check/i.test(error.message) ? 'A promoção precisa de foto ou de uma máquina' : falta(error.message) ? MSG_SQL : error.message }, { status: 400 })
  // só liga/desliga ou reordena não mexe no post; edição de verdade (artes, texto, redes) atualiza
  const mexeuNoPost = ['titulo', 'texto', 'legenda', 'arte_feed', 'arte_vertical', 'video', 'redes', 'inicio'].some((k) => k in l.v)
  return NextResponse.json({ ok: true, promocao: data, post: mexeuNoPost ? await postSemQuebrar(data, por) : undefined })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'promocoes', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const { data: antes } = await sb.from('site_promocoes').select('titulo').eq('id', id).maybeSingle()
  const { error } = await sb.from('site_promocoes').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  // marca o site como "com mudança para publicar" (a promoção apagada ainda está no site até publicar)
  await sb.from('site_conteudo_hist').insert({ grupo: 'promocoes', antes: antes ?? null, depois: null, por: g.user.nome || g.user.email || 'Portal' })
  return NextResponse.json({ ok: true })
}
