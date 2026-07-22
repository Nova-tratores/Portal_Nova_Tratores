// Sobe as MINIATURAS das figuras Valtra e aponta catalogo_figuras.thumb_url.
//
// A grade de figuras usava o PNG inteiro (~50 KB cada) como miniatura: uma seção
// com 30 figuras baixava ~1,5 MB. As miniaturas (320px, JPEG) têm ~18 KB.
// Gerar: java Thumbs catalogos/valtra-img catalogos/valtra-thumb 320
//
// Rodar: node scripts/thumbs-valtra.mjs [--dry]

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DIR = 'catalogos/valtra-thumb'
const BUCKET = 'catalogo'
const dry = process.argv.includes('--dry')

function env(k) {
  const t = readFileSync('.env.local', 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })

async function comRetry(rotulo, fn, tentativas = 4) {
  let ultimo
  for (let i = 1; i <= tentativas; i++) {
    try { const r = await fn(); if (!r?.error) return r; ultimo = r.error } catch (e) { ultimo = e }
    if (i < tentativas) await new Promise((r) => setTimeout(r, 400 * i * i))
  }
  console.log(`  ! ${rotulo}: ${ultimo?.message || ultimo}`)
  return { error: ultimo }
}

if (!existsSync(DIR)) { console.error('Gere as miniaturas primeiro em', DIR); process.exit(1) }

// figuras Valtra: image_url aponta pra valtra/<ilust>.png
// (PostgREST devolve no máx. 1000 por página — pagina até acabar)
const figs = []
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb
    .from('catalogo_figuras')
    .select('id, image_url')
    .like('image_url', '%/valtra/%')
    .order('id', { ascending: true })
    .range(de, de + 999)
  if (error) { console.error(error.message); process.exit(1) }
  figs.push(...(data || []))
  if (!data || data.length < 1000) break
}
console.log(`Figuras Valtra: ${figs.length}`)

let ok = 0, sem = 0
const cache = new Map()
for (const f of figs) {
  const ilust = String(f.image_url).split('/').pop().replace(/\.png$/i, '')
  const arq = `${DIR}/${ilust}.jpg`
  if (!existsSync(arq)) { sem++; continue }
  const path = `valtra/thumb/${ilust}.jpg`
  let url = cache.get(path)
  if (!url) {
    if (dry) { url = `(dry)${path}` }
    else {
      const up = await comRetry(`upload ${ilust}`, () =>
        sb.storage.from(BUCKET).upload(path, readFileSync(arq), { contentType: 'image/jpeg', upsert: true }))
      if (up.error) { sem++; continue }
      url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }
    cache.set(path, url)
  }
  if (!dry) {
    const r = await comRetry(`thumb ${f.id}`, () => sb.from('catalogo_figuras').update({ thumb_url: url }).eq('id', f.id))
    if (r.error) { sem++; continue }
  }
  ok++
  if (ok % 200 === 0) console.log(`  ${ok}/${figs.length}`)
}
console.log(`\n✅ ${ok} miniaturas${dry ? ' (dry)' : ''} | sem arquivo/erro: ${sem}`)
