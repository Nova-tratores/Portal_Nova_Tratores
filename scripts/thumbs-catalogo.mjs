// Gera miniaturas ESTÁTICAS no storage (sem usar a transformação do Supabase,
// que é cobrada por imagem/mês). Encolhe pra 480px de largura, JPEG q60.
//
// - Figuras dos catálogos antigos: o thumb ficava em `thumbs/<id>.jpg` como uma
//   CÓPIA da imagem cheia (~238 KB). Reencolhe no lugar (upsert) → ~30 KB.
//   (A Valtra já tem thumb pronto em `valtra/thumb/`, então é pulada.)
// - Capas dos modelos: `catalogo_modelos.image_url` servia a imagem cheia (algumas
//   com 4210px!). Reencolhe no lugar → card leve na home.
//
// Rodar: node scripts/thumbs-catalogo.mjs [--dry]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const LARGURA = 480
const dry = process.argv.includes('--dry')

function env(k) {
  const t = readFileSync('.env.local', 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const SBURL = env('NEXT_PUBLIC_SUPABASE_URL')
const sb = createClient(SBURL, env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
const BUCKET = 'catalogo'

async function comRetry(rotulo, fn, tentativas = 4) {
  let ultimo
  for (let i = 1; i <= tentativas; i++) {
    try { return await fn() } catch (e) { ultimo = e }
    if (i < tentativas) await new Promise((r) => setTimeout(r, 400 * i * i))
  }
  console.log(`  ! ${rotulo}: ${ultimo?.message || ultimo}`)
  return null
}

// caminho dentro do bucket a partir da URL pública
const caminhoDe = (url) => {
  const i = String(url || '').indexOf('/object/public/' + BUCKET + '/')
  return i < 0 ? null : url.slice(i + ('/object/public/' + BUCKET + '/').length)
}

async function encolher(caminho, contentType) {
  const pub = `${SBURL}/storage/v1/object/public/${BUCKET}/${caminho}`
  const buf = await comRetry(`baixar ${caminho}`, async () => {
    const r = await fetch(pub); if (!r.ok) throw new Error('HTTP ' + r.status)
    return Buffer.from(await r.arrayBuffer())
  })
  if (!buf) return false
  const meta = await sharp(buf).metadata().catch(() => null)
  if (meta && meta.width && meta.width <= LARGURA + 20) return 'ok-pequena' // já é pequena
  const out = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: LARGURA, withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer()
  if (dry) return 'ok'
  const up = await comRetry(`upload ${caminho}`, () => sb.storage.from(BUCKET).upload(caminho, out, { contentType: contentType || 'image/jpeg', upsert: true }))
  return up && !up.error ? 'ok' : false
}

async function paginar(tabela, filtro) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('id, thumb_url, image_url').order('id', { ascending: true }).range(de, de + 999)
    if (error) { console.log('erro:', error.message); break }
    for (const r of data || []) if (filtro(r)) out.push(r)
    if (!data || data.length < 1000) break
  }
  return out
}

// ---- 1) figuras dos catálogos antigos (thumb em /thumbs/, cópia da cheia) ----
const figs = await paginar('catalogo_figuras', (r) => /\/thumbs\//.test(r.thumb_url || ''))
console.log(`Figuras (thumbs antigos): ${figs.length}`)
let okF = 0, jaF = 0, erroF = 0
let lote = []
const rodarLote = async () => {
  const rs = await Promise.all(lote.map((f) => encolher(caminhoDe(f.thumb_url), 'image/jpeg')))
  rs.forEach((r) => { if (r === 'ok') okF++; else if (r === 'ok-pequena') jaF++; else erroF++ })
  lote = []
}
for (const f of figs) { lote.push(f); if (lote.length >= 8) { await rodarLote(); if ((okF + jaF + erroF) % 200 < 8) console.log(`  ${okF + jaF + erroF}/${figs.length}`) } }
if (lote.length) await rodarLote()
console.log(`  figuras: ${okF} encolhidas | ${jaF} já pequenas | ${erroF} erro`)

// ---- 2) capas dos modelos (image_url servia a imagem cheia) ----
const { data: modelos } = await sb.from('catalogo_modelos').select('slug, image_url').not('image_url', 'is', null)
console.log(`Capas de modelo: ${(modelos || []).length}`)
let okC = 0, jaC = 0, erroC = 0
for (const m of modelos || []) {
  const cam = caminhoDe(m.image_url)
  if (!cam) continue
  const ct = /\.png$/i.test(cam) ? 'image/png' : /\.webp$/i.test(cam) ? 'image/webp' : 'image/jpeg'
  // capa reencolhe SEMPRE pra jpeg leve, mas mantém o caminho/extensão original
  const r = await encolher(cam, ct)
  if (r === 'ok') okC++; else if (r === 'ok-pequena') jaC++; else erroC++
}
console.log(`  capas: ${okC} encolhidas | ${jaC} já pequenas | ${erroC} erro`)
console.log(`\n✅ Concluído${dry ? ' (dry)' : ''}.`)
