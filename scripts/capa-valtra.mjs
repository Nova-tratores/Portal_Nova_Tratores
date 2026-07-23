// Capa dos modelos VALTRA — a foto de CADA modelo.
//
// O catálogo offline traz a foto de cada trator em telas/m_<codigo>.1024.jpg
// (ex.: m_585.1024.jpg). O código do modelo sai de VERSAO_POR.TXT e é o mesmo
// usado no slug (valtra-<codigo>).
//
// Rodar: node scripts/capa-valtra.mjs [--dry]

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CV = 'C:/Users/José Ortiz- Pós Vend/Downloads/Catalogo Valtra/cat_valt'
const TELAS = `${CV}/telas`
const DADOS = 'catalogos/valtra-dados'
const BUCKET = 'catalogo'
const dry = process.argv.includes('--dry')

function env(k) {
  const t = readFileSync('.env.local', 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })

const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

const arqs = readdirSync(TELAS).filter((a) => /1024\.jpg$/i.test(a) && /^m_/i.test(a))
const semExt = (a) => a.replace(/\.(1024|800|640)\.jpg$/i, '')

// Acha a foto do modelo: exato -> prefixo -> aparando o fim (BH140HI -> m_bh140h)
function acharFoto(cod) {
  let alvo = norm('m_' + cod)
  let f = arqs.find((a) => norm(semExt(a)) === alvo)
  if (f) return f
  f = arqs.find((a) => norm(semExt(a)).startsWith(alvo))
  if (f) return f
  let base = norm('m_' + cod)
  while (base.length > 3) {
    base = base.slice(0, -1)
    const c = arqs.filter((a) => norm(semExt(a)) === base)
    if (c.length === 1) return c[0]
  }
  return null
}

const modelos = []
for (const l of readFileSync(`${DADOS}/VERSAO_POR.TXT`, 'latin1').split(/\r?\n/)) {
  const c = l.split('\t')
  if (c[0]) modelos.push({ cod: c[0].trim(), nome: (c[1] || c[0]).trim() })
}

let ok = 0, sem = 0
for (const m of modelos) {
  const slug = slugify('Valtra-' + m.cod)
  const foto = acharFoto(m.cod)
  if (!foto) { sem++; console.log(`  ⚠ ${m.nome}: sem foto`); continue }
  if (dry) { console.log(`  ${m.nome.padEnd(14)} <- ${foto}`); ok++; continue }

  const buf = readFileSync(`${TELAS}/${foto}`)
  const path = `valtra/capas/${slug}.jpg`
  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
  if (up.error) { console.log(`  ! ${m.nome}: upload ${up.error.message}`); sem++; continue }
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { error } = await sb.from('catalogo_modelos').update({ image_url: url }).eq('slug', slug)
  if (error) { console.log(`  ! ${m.nome}: ${error.message}`); sem++; continue }
  ok++
}
console.log(`\n✅ ${ok} capas${dry ? ' (dry)' : ''} | sem foto: ${sem}`)
