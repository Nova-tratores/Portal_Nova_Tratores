// Catálogo do site (portal, módulo Site → Catálogo).
// GET: a lista vem do PRÓPRIO site (SITE_URL/catalogo.json, gerado no build) + o que foi mudado aqui (site_catalogo)
//      + as máquinas criadas aqui que ainda não foram publicadas.
// PATCH: preço, mostrar preço, pronta entrega, selo, tirar do site, notas e (12/11) qualquer campo da máquina
//        (nome, textos, fotos, ficha) em `dados`; `desfazer: true` volta ao que está nos arquivos do site.
// POST: máquina nova (José, 12/11: "incluir, excluir ou alterar"). DELETE: apaga máquina criada aqui.
// Tudo o que não é preço/selo/ocultar só aparece no site depois do Publicar.
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, SITE_URL, guardarSite, sb, semMigration } from '@/lib/site/server'
import { CAMPOS_EDITAVEIS, limparDados, produtoNovo, slugDe, type DadosProduto } from '@/lib/site/produtos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ItemSite = {
  slug: string; titulo: string; categoria: string; marca: string; modelo: string; potencia_cv: number | null
  foto: string | null; link: string; padrao: { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean }
  origem?: 'arquivo' | 'portal'; publicar?: boolean
  descricao_site?: string; pontos?: string[]; ideal_para?: string[]; ideal_motivos?: string[]; specs?: Record<string, string>
  meta_description?: string; fotos?: { src: string; alt: string; url?: string }[]
}
type Linha = Record<string, unknown>
const CAMPOS = ['preco', 'exibir_preco', 'pronta_entrega', 'oculto', 'selo', 'notas'] as const
const MSG_SQL = 'Rode sql/site-produtos-promocoes.sql no projeto do portal (citrhumdkfivdzbmayde).'

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('site') || u.modulos.includes('site:catalogo:editar')

async function lerSite(): Promise<{ itens: ItemSite[]; erroSite: string }> {
  try {
    const r = await fetch(`${SITE_URL}/catalogo.json`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`)
    return { itens: ((await r.json()) as { itens: ItemSite[] }).itens, erroSite: '' }
  } catch (e) {
    return { itens: [], erroSite: `Não consegui ler ${SITE_URL}/catalogo.json (${e instanceof Error ? e.message : 'erro'}).` }
  }
}

export async function GET(req: Request) {
  const g = await guardarSite(req, 'catalogo')
  if (g.resposta) return g.resposta
  const [{ itens, erroSite }, { data, error }, { data: pub }] = await Promise.all([
    lerSite(),
    sb.from('site_catalogo').select('*'),
    sb.from('site_publicacoes').select('pedido_em').eq('ok', true).order('pedido_em', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (error && semMigration(error.message)) return NextResponse.json({ ok: false, erro: AVISO_MIGRATION }, { status: 503 })
  const linhas = (data || []) as Linha[]
  const mudancas = new Map(linhas.map((m) => [String(m.slug), m]))
  const doSite = new Set(itens.map((i) => i.slug))
  // Criadas aqui e ainda não publicadas (o catalogo.json do site ainda não tem): monta o item pelo que foi gravado.
  const aguardando = linhas.filter((m) => m.novo && !doSite.has(String(m.slug))).map((m) => {
    const d = (m.dados || {}) as DadosProduto
    return {
      slug: String(m.slug), titulo: d.categoria === 'tratores' ? `${d.marca} ${d.modelo}` : d.titulo, categoria: d.categoria, marca: d.marca,
      modelo: d.modelo, potencia_cv: d.potencia_cv ?? null, foto: d.fotos?.[0]?.src || null, link: `${SITE_URL}/${m.slug}/`,
      padrao: { preco: null, exibir_preco: false, pronta_entrega: false }, origem: 'portal' as const, publicar: true,
      descricao_site: d.descricao_site, pontos: d.pontos, ideal_para: d.ideal_para, ideal_motivos: d.ideal_motivos, specs: d.specs,
      meta_description: d.meta_description, fotos: d.fotos, aguardando: true,
    }
  })
  return NextResponse.json({
    ok: true, erroSite, site: SITE_URL, podeEditar: podeEditar(g.user),
    temColunaDados: !linhas.length || 'dados' in linhas[0],
    ultimaPublicacao: (pub as { pedido_em?: string } | null)?.pedido_em || null,
    itens: [...itens, ...aguardando].map((i) => ({ ...i, mudanca: mudancas.get(i.slug) || null })),
  })
}

async function gravarHist(slug: string, por: string, velho: Linha, depois: Linha, campos: string[]) {
  const txt = (v: unknown) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const vd = (velho.dados || {}) as Linha, dd = (depois.dados || {}) as Linha
  const hist = [
    ...CAMPOS.filter((c) => campos.includes(c) && txt(velho[c]) !== txt(depois[c])).map((c) => ({ slug, campo: c, de: txt(velho[c]), para: txt(depois[c]), por })),
    ...CAMPOS_EDITAVEIS.filter((c) => txt(vd[c]) !== txt(dd[c])).map((c) => ({ slug, campo: c, de: txt(vd[c])?.slice(0, 2000) ?? null, para: txt(dd[c])?.slice(0, 2000) ?? null, por })),
  ]
  if (hist.length) await sb.from('site_catalogo_hist').insert(hist)
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão para mudar o catálogo' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as ({ slug?: string; dados?: Record<string, unknown>; desfazer?: boolean } & Linha) | null
  const slug = String(b?.slug || '')
  if (!b || !/^[a-z0-9-]{2,120}$/.test(slug)) return NextResponse.json({ ok: false, erro: 'produto inválido' }, { status: 400 })

  const { data: antes } = await sb.from('site_catalogo').select('*').eq('slug', slug).maybeSingle()
  const velho = (antes || {}) as Linha
  const por = g.user.nome || g.user.email || 'Portal'
  const novo: Linha = { slug, atualizado_em: new Date().toISOString(), atualizado_por: por }
  for (const c of CAMPOS) {
    if (!(c in b)) continue
    const v = b[c]
    if (c === 'preco') novo.preco = v === null || v === '' ? null : Math.max(0, Math.round(Number(v) * 100) / 100)
    else if (c === 'selo') novo.selo = v ? String(v).trim().slice(0, 30) : null
    else if (c === 'notas') novo.notas = v ? String(v).slice(0, 1000) : null
    else novo[c] = v === true
  }
  if (b.desfazer && !velho.novo) novo.dados = {}
  else if (b.dados && typeof b.dados === 'object') {
    const l = limparDados(b.dados)
    if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
    novo.dados = { ...((velho.dados || {}) as Linha), ...l.dados }
  }
  const { data, error } = await sb.from('site_catalogo').upsert(novo).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: /dados|column/.test(error.message) ? MSG_SQL : semMigration(error.message) ? AVISO_MIGRATION : error.message }, { status: 500 })
  await gravarHist(slug, por, velho, data as Linha, Object.keys(b))
  return NextResponse.json({ ok: true, mudanca: data })
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão para incluir máquina' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as { dados?: Record<string, unknown> } | null
  const l = limparDados(b?.dados || {})
  if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
  if (!l.dados.titulo || !l.dados.categoria) return NextResponse.json({ ok: false, erro: 'Escolha o tipo e escreva o nome da máquina' }, { status: 400 })
  if (!l.dados.fotos?.length) return NextResponse.json({ ok: false, erro: 'Coloque pelo menos uma foto' }, { status: 400 })
  // slug único: nem no site nem aqui
  const base = slugDe(l.dados.titulo, l.dados.categoria)
  if (base.length < 3) return NextResponse.json({ ok: false, erro: 'Nome curto demais' }, { status: 400 })
  const [{ itens }, { data: existentes }] = await Promise.all([lerSite(), sb.from('site_catalogo').select('slug').like('slug', `${base}%`)])
  const usados = new Set([...itens.map((i) => i.slug), ...((existentes || []) as { slug: string }[]).map((e) => e.slug)])
  let slug = base
  for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`
  const por = g.user.nome || g.user.email || 'Portal'
  const dados = produtoNovo(slug, l.dados)
  const { data, error } = await sb.from('site_catalogo').insert({ slug, novo: true, dados, atualizado_por: por, atualizado_em: new Date().toISOString() }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: /dados|novo|column/.test(error.message) ? MSG_SQL : error.message }, { status: 500 })
  await sb.from('site_catalogo_hist').insert({ slug, campo: 'criou', de: null, para: dados.titulo, por })
  return NextResponse.json({ ok: true, slug, mudanca: data })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const slug = new URL(req.url).searchParams.get('slug') || ''
  const { data: linha } = await sb.from('site_catalogo').select('slug, novo, dados').eq('slug', slug).maybeSingle()
  if (!linha) return NextResponse.json({ ok: false, erro: 'máquina não encontrada' }, { status: 404 })
  if (!(linha as { novo: boolean }).novo) return NextResponse.json({ ok: false, erro: 'Máquina dos arquivos do site: use "Tirar do site" (dá para voltar depois).' }, { status: 400 })
  const { error } = await sb.from('site_catalogo').delete().eq('slug', slug)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  await sb.from('site_catalogo_hist').insert({ slug, campo: 'apagou', de: (linha as { dados?: { titulo?: string } }).dados?.titulo ?? slug, para: null, por: g.user.nome || g.user.email || 'Portal' })
  return NextResponse.json({ ok: true })
}
