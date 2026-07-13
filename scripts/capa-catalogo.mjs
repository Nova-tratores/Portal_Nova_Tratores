// Sobe a FOTO DE CAPA dos modelos do catálogo (sem reimportar peças/figuras).
// Procura catalogos/<slug>.(jpg|jpeg|png|webp), manda pro bucket "catalogo"
// e grava a URL em catalogo_modelos.image_url.
//
// Rodar:
//   node scripts/capa-catalogo.mjs                 -> todos os modelos que TÊM arquivo
//   node scripts/capa-catalogo.mjs accura-1200 ... -> só os slugs passados

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const here = (p) => new URL(p, import.meta.url)
function env(k) {
  try {
    const t = readFileSync(here('../.env.local'), 'utf8')
    const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}
const URL_SB = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!URL_SB || !KEY) { console.error('Faltou URL/KEY no .env.local'); process.exit(1) }
const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } })

const BUCKET = 'catalogo'
const EXTS = [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]

const alvos = process.argv.slice(2).filter((a) => !a.startsWith('--'))

const { data: modelos, error } = await sb.from('catalogo_modelos').select('slug, nome, image_url').order('nome')
if (error) { console.error('Erro ao ler modelos:', error.message); process.exit(1) }

let ok = 0, semArq = 0
for (const m of modelos) {
  if (alvos.length && !alvos.includes(m.slug)) continue

  // acha o arquivo da capa (qualquer extensão suportada)
  let achado = null
  for (const [ext, ct] of EXTS) {
    const p = here(`../catalogos/${m.slug}.${ext}`)
    if (existsSync(p)) { achado = { p, ext, ct }; break }
  }
  if (!achado) {
    if (alvos.length) console.warn(`  ⚠ ${m.nome}: não achei catalogos/${m.slug}.(jpg|png|webp)`)
    semArq++
    continue
  }

  const buf = readFileSync(achado.p)
  const path = `modelo/${m.slug}.${achado.ext}`
  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: achado.ct, upsert: true })
  if (up.error) { console.warn(`  ✗ ${m.nome}: upload falhou — ${up.error.message}`); continue }
  const image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: ue } = await sb.from('catalogo_modelos').update({ image_url }).eq('slug', m.slug)
  if (ue) { console.warn(`  ✗ ${m.nome}: update falhou — ${ue.message}`); continue }
  console.log(`  ✅ ${m.nome} <- ${m.slug}.${achado.ext} (${Math.round(buf.length / 1024)} KB)`)
  ok++
}
console.log(`\n${ok} capa(s) atualizada(s).${semArq ? ` ${semArq} modelo(s) sem arquivo local.` : ''}`)
