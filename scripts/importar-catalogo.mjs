// Importa um catálogo de trator (catalogos/<arquivo>.json) pro Supabase:
//  - baixa as imagens (vista explodida) pro bucket "catalogo"
//  - popula catalogo_figuras e catalogo_pecas (marcadas com o modelo/trator)
//  - cadastra o trator em catalogo_modelos (com a foto catalogos/<slug>.jpg, se houver)
//
// Rodar:  node scripts/importar-catalogo.mjs [arquivo.json] [--pecas]
//   ex:   node scripts/importar-catalogo.mjs catalogo_jivo.json
//   --pecas: refaz só as peças (não re-baixa imagens)
// Requer: sql/catalogo.sql + sql/catalogo-modelos.sql rodados; .env.local com SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function env(k) {
  try {
    const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}
const URL_SB = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!URL_SB || !KEY) { console.error('Faltou URL/KEY no .env.local'); process.exit(1) }
const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } })

const BUCKET = 'catalogo'
const args = process.argv.slice(2)
const pecasOnly = args.includes('--pecas')
const arquivo = args.find((a) => !a.startsWith('--')) || 'catalogo_completo.json'
const dados = JSON.parse(readFileSync(new URL(`../catalogos/${arquivo}`, import.meta.url), 'utf8'))

const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const MODELO = dados.modelo || 'Jivo 2025'
const SLUG = dados.modeloSlug || slugify(MODELO)
const ROOT_ID = dados.root || null
const BU = dados.businessUnit || null

async function baixarESubir(url, path) {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) { console.warn('  imagem falhou', r.status, path); return null }
    const buf = Buffer.from(await r.arrayBuffer())
    const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
    if (up.error) { console.warn('  upload falhou', path, up.error.message); return null }
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch (e) { console.warn('  erro img', path, e.message); return null }
}

async function main() {
  console.log(`Trator: ${MODELO} (${SLUG}) | arquivo: ${arquivo}${pecasOnly ? ' | só peças' : ''}`)

  // Cadastra/atualiza o trator (com a foto catalogos/<slug>.jpg, se existir)
  if (!pecasOnly) {
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {})
    let modeloImg = null
    try {
      const buf = readFileSync(new URL(`../catalogos/${SLUG}.jpg`, import.meta.url))
      const up = await sb.storage.from(BUCKET).upload(`modelo/${SLUG}.jpg`, buf, { contentType: 'image/jpeg', upsert: true })
      if (!up.error) modeloImg = sb.storage.from(BUCKET).getPublicUrl(`modelo/${SLUG}.jpg`).data.publicUrl
    } catch { /* sem foto do modelo */ }
    const mrow = { slug: SLUG, nome: MODELO, root_id: ROOT_ID, business_unit: BU, atualizado_em: new Date().toISOString() }
    if (modeloImg) mrow.image_url = modeloImg
    const { error: me } = await sb.from('catalogo_modelos').upsert(mrow, { onConflict: 'slug' })
    if (me) console.warn('modelo falhou', me.message)
  }

  const contadorOrdem = {}
  let nFig = 0, nImg = 0

  if (!pecasOnly) {
    const ordemSecao = {}
    let si = 0
    for (const f of dados.figuras) if (!(f.secao in ordemSecao)) ordemSecao[f.secao] = si++

    for (const f of dados.figuras) {
      const ordem = (contadorOrdem[f.secao] = (contadorOrdem[f.secao] || 0) + 1)
      const image_url = await baixarESubir(f.imageUrl, `figuras/${f.id}.jpg`)
      const thumb_url = await baixarESubir(f.thumbUrl, `thumbs/${f.id}.jpg`)
      if (image_url) nImg++

      const row = {
        id: f.id, modelo: MODELO, code: f.code, name: f.name, secao: f.secao,
        secao_ordem: ordemSecao[f.secao] ?? 0, ordem,
        hotspots: f.hotspots || [], path: f.path || [],
        atualizado_em: new Date().toISOString(),
      }
      if (image_url) row.image_url = image_url   // não sobrescreve imagem boa se o download falhar
      if (thumb_url) row.thumb_url = thumb_url

      const { error } = await sb.from('catalogo_figuras').upsert(row, { onConflict: 'id' })
      if (error) console.warn('figura falhou', f.code, error.message)
      nFig++
      if (nFig % 10 === 0) console.log(`  ${nFig}/${dados.figuras.length} figuras…`)
    }
  }

  // Peças: id automático → apaga só as DESTE trator e reinsere
  const todasPecas = dados.pecas.map((p) => ({
    figura_id: p.figura_id, modelo: MODELO, code: p.code, name: p.name,
    reference: p.reference, qtd: p.qtd ?? null, unit: p.unit || null,
    compravel: p.compravel !== false,
  }))
  await sb.from('catalogo_pecas').delete().eq('modelo', MODELO)
  let nPecas = 0
  for (let i = 0; i < todasPecas.length; i += 500) {
    const lote = todasPecas.slice(i, i + 500)
    const { data, error } = await sb.from('catalogo_pecas').insert(lote).select('id')
    if (error) console.warn('peças lote falhou:', error.message)
    else nPecas += (data ? data.length : 0)
    console.log(`  peças ${Math.min(i + 500, todasPecas.length)}/${todasPecas.length}`)
  }

  console.log(`\n✅ ${MODELO}: ${pecasOnly ? '(só peças)' : nFig + ' figuras (' + nImg + ' com imagem),'} ${nPecas} peças inseridas (de ${todasPecas.length}).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
