// Baixa o MANUAL DE INSTRUÇÃO (PDN) de cada implemento KUHN e guarda no portal.
//
// Como funciona (API do e-techdoc, descoberta):
//   /Home/DetailKey/{keyID}            -> os documentos da máquina (tipo + docID)
//   /Home/Detail/{docID}?idKey={keyID} -> as versões/idiomas (idDoc de cada)
//   /Download/DownloadLanguage?idDoc={idDoc} -> o PDF
// Prioriza Português (Brasil); se não houver, cai pra Espanhol e depois Inglês.
//
// O PDF vai pro Storage do Supabase (bucket "catalogo", pasta manual/), e a URL fica
// em catalogo_modelos.manual_url — assim ninguém precisa do login da KUHN pra abrir.
//
// Rodar:  node scripts/manuais-kuhn.mjs            (todas as URLs de catalogos/kuhn-urls.txt)
//         node scripts/manuais-kuhn.mjs <url> ...  (só essas)
// Requer: catalogos/.kuhn-cookie.txt + .env.local
// Migration: ALTER TABLE catalogo_modelos ADD COLUMN IF NOT EXISTS manual_url text,
//            ADD COLUMN IF NOT EXISTS manual_nome text;

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const here = (p) => new URL(p, import.meta.url)
const BASE = 'https://e-techdoc.extranet.kuhn.com'
const BUCKET = 'catalogo'
const TIPO_MANUAL = /manual de instru/i        // o rótulo do tile (PDN)
const PREF_IDIOMA = [/portugu/i, /espa/i, /english/i]  // ordem de preferência

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

if (!existsSync(here('../catalogos/.kuhn-cookie.txt'))) {
  console.error('Faltou catalogos/.kuhn-cookie.txt (cole seu cookie da KUHN nele).'); process.exit(1)
}
const COOKIE = readFileSync(here('../catalogos/.kuhn-cookie.txt'), 'utf8').trim()
const H = { Cookie: COOKIE, 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-BR,pt;q=0.9' }

let urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
if (!urls.length && existsSync(here('../catalogos/kuhn-urls.txt'))) {
  urls = readFileSync(here('../catalogos/kuhn-urls.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('http'))
}
if (!urls.length) { console.error('Nenhuma URL.'); process.exit(1) }

const dec = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
const strip = (s) => dec(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function manualDoModelo(url) {
  const u = new URL(url)
  const keyID = u.searchParams.get('etechdocKEYID') || ''
  const MODELO = (u.searchParams.get('dstec') || '').trim()
  const SLUG = slugify(MODELO)
  console.log(`\n=== ${MODELO} (keyID=${keyID}) ===`)
  if (!keyID) { console.error('  sem keyID na URL'); return }

  // 1) documentos da máquina
  const page = await (await fetch(`${BASE}/Home/DetailKey/${keyID}`, { headers: H })).text()
  if (/ECatalog not available/i.test(page) || !/tileDocument/.test(page)) {
    console.error('  ⚠ página da máquina não disponível (cookie ou keyID errado)'); return
  }
  // cada tile = um TIPO de documento; dentro dele, os docIDs
  const tiles = page.split(/<div class="col-md-6 col-sm-12 tileDocument/).slice(1)
  const candidatos = []
  for (const t of tiles) {
    const tipo = strip((t.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1])
    if (!TIPO_MANUAL.test(tipo)) continue
    // Só o docID: tentar casar o nome até o </a> falhava (o bloco passa de 400 chars).
    // O nome vem do próprio detalhe do documento, mais abaixo.
    for (const m of t.matchAll(/data-urldetail="\/Home\/Detail\/(\d+)\?idKey=\d+"/g)) {
      candidatos.push({ docID: m[1], tipo })
    }
  }
  if (!candidatos.length) { console.error('  ⚠ nenhum "Manual de instrução" nesta máquina'); return }
  const doc = candidatos[0]

  // 2) detalhe: nome do documento + versões/idiomas
  const det = await (await fetch(`${BASE}/Home/Detail/${doc.docID}?idKey=${keyID}`, { headers: { ...H, 'X-Requested-With': 'XMLHttpRequest' } })).text()
  // O nome fica logo depois do tipo, antes do "Ref." (ex.: "MANUAL E INSTRUÇÕES - BOXER 2000 H")
  const txtDet = strip(det)
  const mNome = txtDet.match(/Manual de instru\S*\s+([\s\S]*?)\s+Ref\s*\.?\s*:/i)
  doc.nome = (mNome ? mNome[1] : doc.tipo).slice(0, 120)
  console.log(`  documento: ${doc.tipo} — ${doc.nome}`)

  const versoes = []
  for (const row of det.split(/<div class="row/).slice(1)) {
    const idDoc = (row.match(/DownloadLanguage\?idDoc=(\d+)/) || [])[1]
    if (!idDoc) continue
    versoes.push({ idDoc, label: strip(row).replace(/^"?>\s*/, '').slice(0, 60) })
  }
  if (!versoes.length) { console.error('  ⚠ sem versão pra baixar'); return }

  // escolhe o idioma preferido
  let escolhida = null
  for (const pref of PREF_IDIOMA) {
    escolhida = versoes.find((v) => pref.test(v.label))
    if (escolhida) break
  }
  if (!escolhida) escolhida = versoes[0]
  console.log(`  versão: ${escolhida.label}  (${versoes.length} disponíveis)`)

  // 3) baixa o PDF
  const r = await fetch(`${BASE}/Download/DownloadLanguage?idDoc=${escolhida.idDoc}`, { headers: H })
  if (!r.ok) { console.error(`  ✗ download falhou (HTTP ${r.status})`); return }
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.slice(0, 5).toString('latin1').startsWith('%PDF')) { console.error('  ✗ não veio um PDF'); return }
  const cd = r.headers.get('content-disposition') || ''
  const arquivo = (cd.match(/filename=([^;]+)/) || [])[1]?.trim() || `${SLUG}.pdf`
  console.log(`  PDF: ${arquivo} (${(buf.length / 1048576).toFixed(1)} MB)`)

  // 4) sobe pro storage e grava no modelo
  const path = `manual/${SLUG}.pdf`
  const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'application/pdf', upsert: true })
  if (up.error) { console.error('  ✗ upload falhou:', up.error.message); return }
  const manual_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error } = await sb.from('catalogo_modelos')
    .update({ manual_url, manual_nome: doc.nome || 'Manual de instrução' })
    .eq('slug', SLUG)
  if (error) { console.error('  ✗ não gravou no modelo:', error.message); return }
  console.log(`  ✅ manual salvo em ${MODELO}`)
}

for (const url of urls) {
  try { await manualDoModelo(url) } catch (e) { console.error('  ✗', e.message) }
  await sleep(500)
}
console.log('\nFim.')
