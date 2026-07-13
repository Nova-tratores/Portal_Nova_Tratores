// Extrai VÁRIOS catálogos KUHN de uma vez, usando a SUA sessão (cookie).
// Roda na sua máquina (não no servidor). Gera catalogos/catalogo_<slug>.json por catálogo,
// com as imagens embutidas em base64 (as imagens da KUHN exigem login).
//
// Rodar:
//   1) Cole seu cookie atual em  catalogos/.kuhn-cookie.txt   (gitignored)
//   2) Cole as URLs dos catálogos (uma por linha) em  catalogos/kuhn-urls.txt   (gitignored)
//      (ou passe as URLs como argumentos)
//   3) node scripts/extrair-kuhn.mjs
//   4) Depois:  node scripts/importar-catalogo.mjs catalogo_<slug>.json   (para cada um)
//
// Como pegar o cookie: no navegador logado -> F12 -> Network -> clique numa requisição ->
//   Headers -> Request Headers -> copie o valor de "cookie:".

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const here = (p) => new URL(p, import.meta.url)
const BASE = 'https://e-techdoc.extranet.kuhn.com'
// Tamanho da imagem do <map> (zoom=1) — é a base das coords dos balões na KUHN.
const MAP_W = 1053, MAP_H = 744

if (!existsSync(here('../catalogos/.kuhn-cookie.txt'))) {
  console.error('Faltou catalogos/.kuhn-cookie.txt (cole seu cookie da KUHN nele).'); process.exit(1)
}
const COOKIE = readFileSync(here('../catalogos/.kuhn-cookie.txt'), 'utf8').trim()

let urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
if (!urls.length && existsSync(here('../catalogos/kuhn-urls.txt'))) {
  urls = readFileSync(here('../catalogos/kuhn-urls.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('http'))
}
if (!urls.length) { console.error('Nenhuma URL. Passe como argumento ou preencha catalogos/kuhn-urls.txt'); process.exit(1) }

const H = { Cookie: COOKIE, 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest', 'Accept-Language': 'pt-BR,pt;q=0.9' }

const decodeEntities = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
const strip = (s) => decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function extrairCatalogo(url) {
  const u = new URL(url)
  const catalogCode = u.searchParams.get('catalogCode') || ''
  const docID = u.searchParams.get('etechdocDOCID') || ''
  const keyID = u.searchParams.get('etechdocKEYID') || ''
  const MODELO = (u.searchParams.get('dstec') || 'KUHN').trim()
  const SLUG = slugify(MODELO)
  console.log(`\n=== ${MODELO} (${catalogCode}) docID=${docID} keyID=${keyID} ===`)
  if (!docID || !keyID) { console.error('  URL sem etechdocDOCID/KEYID — pulando'); return }

  // Página do catálogo -> lista de desenhos (menu_drawing / data-drawing-id)
  const pageHtml = await (await fetch(url, { headers: H })).text()
  if (/name="password"|Efetuar login|LoginForm/i.test(pageHtml) && !/data-drawing-id/.test(pageHtml)) {
    throw new Error('Parece página de login — cookie inválido/expirado. Atualize catalogos/.kuhn-cookie.txt')
  }
  const drawings = []
  const re = /data-drawing-id="(\d+)"[^>]*>([\s\S]{0,220}?)<\/(?:a|li|span|div)>/gi
  let m
  while ((m = re.exec(pageHtml))) {
    const id = m[1], txt = strip(m[2])
    if (id && !drawings.some((d) => d.id === id)) drawings.push({ id, txt })
  }
  console.log(`  desenhos encontrados: ${drawings.length}`)
  if (!drawings.length) { console.error('  ⚠ Nenhum desenho no HTML (menu pode carregar por AJAX). Me avise.'); return }

  const figuras = [], pecas = []
  let idx = 0, nImg = 0
  for (const d of drawings) {
    idx++
    const body = new URLSearchParams({ drawingID: d.id, serialNumberSelected: '', catalogCode: '', dstec: '', keyID, docID })
    let html = ''
    try {
      html = await (await fetch(`${BASE}/SparePartsCatalog/LoadDrawing`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body,
      })).text()
    } catch (e) { console.warn('  LoadDrawing falhou', d.id, e.message); continue }

    // Nome do desenho: vem do título dentro do próprio LoadDrawing (h4/span), que é
    // confiável. O <span class="hidden-md hidden-lg"> traz só "NOME: nº série".
    let nome = null
    const mSpan = html.match(/<span class="hidden-md hidden-lg">([\s\S]*?)<\/span>/i)
    if (mSpan) nome = strip(mSpan[1]).split(':')[0].trim()
    if (!nome) {
      const mh4 = html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)
      if (mh4) nome = strip(mh4[1]).replace(/^E-?Catalog\s+\S+\s*-\s*/i, '').split(':')[0].trim()
    }
    if (!nome) nome = (d.txt || '').replace(/^\d+\s*-\s*/, '').trim() || `Desenho ${d.id}`
    const ordem = idx

    // imagem (codep) -> base64 (guardamos o zoom=3, alta resolução)
    const mImg = html.match(/GetDrawing\/([^?"'\\ ]+)\?zoom=/)
    const codep = mImg ? mImg[1] : null
    let imageB64 = null, imgW = 0, imgH = 0
    if (codep) {
      try {
        const ir = await fetch(`${BASE}/SparePartsCatalog/GetDrawing/${codep}?zoom=3`, { headers: H })
        if (ir.ok) {
          const b = Buffer.from(await ir.arrayBuffer())
          if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') { imgW = b.readUInt32BE(16); imgH = b.readUInt32BE(20) }
          imageB64 = `data:${ir.headers.get('content-type') || 'image/png'};base64,${b.toString('base64')}`
          nImg++
        }
      } catch (e) { console.warn('  img falhou', codep, e.message) }
    }

    // Hotspots (balões). ATENÇÃO: as coords do <map> são em pixels da imagem do
    // usemap (zoom=1 = 1053x744). Como guardamos a imagem em zoom=3 (4210x2975),
    // escalamos as coords pro espaço da imagem guardada — senão os balões saem do lugar
    // (a tela posiciona por x / larguraNaturalDaImagem).
    const escX = imgW ? imgW / MAP_W : 1
    const escY = imgH ? imgH / MAP_H : 1
    const hotspots = []
    const areaRe = /<area[^>]*data-bubble="([^"]*)"[^>]*coords="([^"]*)"/gi
    let a
    while ((a = areaRe.exec(html))) {
      const c = a[2].split(',').map(Number)
      hotspots.push({
        reference: a[1],
        x: c[0] != null ? Math.round(c[0] * escX) : null,
        y: c[1] != null ? Math.round(c[1] * escY) : null,
        r: c[2] != null ? Math.round(c[2] * escX) : null,
      })
    }

    figuras.push({ id: d.id, code: codep || d.id, name: nome, secao: nome, secao_ordem: ordem, ordem: 1, imageUrl: codep ? `/SparePartsCatalog/GetDrawing/${codep}?zoom=3` : null, imageB64, hotspots, path: [MODELO, nome] })

    // peças (tabela de nomenclatura)
    let nP = 0
    const rowRe = /<tr[^>]*class="[^"]*row_detail[^"]*"[^>]*data-item_code="([^"]*)"[^>]*data-bubble="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi
    let tr
    while ((tr = rowRe.exec(html))) {
      const code = (tr[1] || '').trim()
      if (!code) continue
      const inner = tr[3]
      const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => strip(x[1]))
      const marca = tds[0] || ''
      const qtd = parseFloat((tds[2] || '').replace(',', '.'))
      const desiM = inner.match(/class="desi"[^>]*>([\s\S]*?)<\/span>/i)
      const desi = strip(desiM ? desiM[1] : (tds[3] || ''))
      pecas.push({ figura_id: d.id, code, name: desi, reference: marca || tr[2], qtd: isNaN(qtd) ? null : qtd, unit: null, compravel: true })
      nP++
    }
    console.log(`  ${idx}/${drawings.length} ${nome}: ${nP} peças${imageB64 ? ' +img' : ''}`)
    await sleep(250)
  }

  const out = { modelo: MODELO, modeloSlug: SLUG, catalogCode, docID, keyID, fonte: 'kuhn', figuras, pecas }
  writeFileSync(here(`../catalogos/catalogo_${SLUG}.json`), JSON.stringify(out))
  console.log(`  ✅ ${MODELO}: ${figuras.length} desenhos (${nImg} c/img), ${pecas.length} peças -> catalogo_${SLUG}.json`)
}

for (const url of urls) {
  try { await extrairCatalogo(url) } catch (e) { console.error('  ✗', e.message); if (/login|cookie/i.test(e.message)) break }
}
console.log('\nFim.')
