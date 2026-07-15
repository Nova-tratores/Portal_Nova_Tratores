// Cria as BOLINHAS (hotspots) de catálogos cujos números estão DESENHADOS na folha,
// em preto, junto do traço — caso do manual da Ventura (Linhai). Aqui não dá pra
// isolar por cor, como na Tatu (que escreve os números em azul), então cruzam-se
// dois OCRs e só se aceita o que casa com as refs REAIS da figura:
//
//   passe A (página inteira, texto esparso): pega bem os números soltos, longe do traço
//   passe B (recorte da máscara): isola cada candidato a dígito (componente do tamanho
//           de texto) e manda ao OCR só ele, sem as linhas do desenho por perto
//
// União dos dois, sem repetir a mesma ref no mesmo lugar. O que o OCR ler e não existir
// na lista de peças da figura é descartado — melhor nenhuma bolinha do que uma errada.
//
// Rodar:  node scripts/hotspots-ocr.mjs --marca "Ventura"          (só as figuras sem hotspot)
//         node scripts/hotspots-ocr.mjs --modelo "550 LandForce" --todas
//         node scripts/hotspots-ocr.mjs --modelo "550 LandForce" --figura <id>   (teste)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

function env(k) {
  try {
    const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const MARCA = opt('marca')
const MODELO = opt('modelo')
const FIGURA = opt('figura')
const REFAZ = argv.includes('--todas')
const CONF_MIN = 65

// ---------- máscara + componentes ----------
function componentes(gray, W, H) {
  const dark = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (gray[i] < 128) dark[i] = 1
  const vis = new Uint8Array(W * H), comps = []
  for (let i = 0; i < W * H; i++) {
    if (!dark[i] || vis[i]) continue
    const st = [i]; vis[i] = 1
    let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0
    while (st.length) {
      const p = st.pop(), x = p % W, y = (p - x) / W
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (dark[q] && !vis[q]) { vis[q] = 1; st.push(q) }
      }
    }
    comps.push({ x0, y0, x1, y1, n })
  }
  return { dark, comps }
}

// candidatos a dígito: do tamanho de um texto, mais altos que largos, nem cheios nem vazios
function candidatos(comps, H) {
  const hMin = Math.max(8, Math.round(H * 0.012)), hMax = Math.max(18, Math.round(H * 0.045))
  return comps.filter((c) => {
    const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1, d = c.n / (w * h)
    return h >= hMin && h <= hMax && w >= 3 && w <= h * 1.15 && d > 0.22 && d < 0.88
  })
}

// junta dígitos vizinhos numa etiqueta ("1"+"8" = "18")
function etiquetas(cand) {
  const out = []
  for (const c of [...cand].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const h = c.y1 - c.y0 + 1
    const alvo = out.find((l) => {
      const ov = Math.min(l.y1, c.y1) - Math.max(l.y0, c.y0)
      const gap = c.x0 - l.x1
      return ov > h * 0.55 && gap < h * 1.2 && gap > -4 && c.x0 >= l.x0 - 2
    })
    if (alvo) { alvo.x1 = Math.max(alvo.x1, c.x1); alvo.y0 = Math.min(alvo.y0, c.y0); alvo.y1 = Math.max(alvo.y1, c.y1); alvo.px.push(c) }
    else out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, px: [c] })
  }
  return out
}

const num = (s) => { const t = String(s || '').replace(/\D/g, ''); return t ? String(parseInt(t, 10)) : null }

async function hotspotsDaImagem(worker, buf, refs) {
  const meta = await sharp(buf).metadata()
  const { data: gray, info } = await sharp(buf).flatten({ background: '#fff' }).grayscale().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const { dark, comps } = componentes(gray, W, H)
  const achados = []

  // passe A — página inteira, texto esparso
  const grande = await sharp(buf).flatten({ background: '#fff' }).grayscale()
    .resize({ width: W * 2, kernel: 'lanczos3' }).normalise().threshold(170).png().toBuffer()
  const r = await worker.recognize(grande, {}, { blocks: true })
  for (const b of (r.data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const w of (l.words || [])) {
    const t = num(w.text)
    if (!t || w.confidence < CONF_MIN || !refs.includes(t)) continue
    achados.push({ reference: t, x: Math.round((w.bbox.x0 + w.bbox.x1) / 4), y: Math.round((w.bbox.y0 + w.bbox.y1) / 4), conf: w.confidence })
  }

  // passe B — recorte limpo de cada etiqueta
  for (const l of etiquetas(candidatos(comps, H))) {
    const pad = 5, lw = l.x1 - l.x0 + 1 + pad * 2, lh = l.y1 - l.y0 + 1 + pad * 2
    const px = Buffer.alloc(lw * lh, 255)
    for (const c of l.px) for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      if (dark[y * W + x]) px[(y - l.y0 + pad) * lw + (x - l.x0 + pad)] = 0
    }
    const png = await sharp(px, { raw: { width: lw, height: lh, channels: 1 } })
      .resize({ width: lw * 5, kernel: 'nearest' })
      .extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#fff' }).png().toBuffer()
    const { data: { text, confidence } } = await worker.recognize(png)
    const t = num(text)
    if (!t || confidence < CONF_MIN || !refs.includes(t)) continue
    achados.push({ reference: t, x: Math.round((l.x0 + l.x1) / 2), y: Math.round((l.y0 + l.y1) / 2), conf: confidence })
  }

  // mesma ref no mesmo sítio (os dois passes acharam) → fica a de maior confiança
  achados.sort((a, b) => b.conf - a.conf)
  const finais = []
  for (const h of achados) {
    if (finais.some((f) => f.reference === h.reference && Math.abs(f.x - h.x) < 30 && Math.abs(f.y - h.y) < 30)) continue
    finais.push(h)
  }
  return { hotspots: finais.map(({ reference, x, y }) => ({ reference, x, y })), refs: refs.length, W, H }
}

async function main() {
  let qm = sb.from('catalogo_modelos').select('nome')
  if (MODELO) qm = qm.eq('nome', MODELO)
  else if (MARCA) qm = qm.eq('marca', MARCA)
  else { console.error('Passe --marca ou --modelo'); return }
  const { data: modelos } = await qm
  if (!modelos?.length) { console.error('Nenhum modelo.'); return }

  const worker = await createWorker('eng')
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '11' })

  let totF = 0, totH = 0, vazias = 0
  for (const mod of modelos) {
    let qf = sb.from('catalogo_figuras').select('id, code, name, image_url, hotspots').eq('modelo', mod.nome)
    if (FIGURA) qf = qf.eq('id', FIGURA)
    const { data: figuras } = await qf
    console.log(`\n=== ${mod.nome} (${figuras?.length || 0} figuras) ===`)
    for (const f of figuras || []) {
      if (!REFAZ && !FIGURA && Array.isArray(f.hotspots) && f.hotspots.length) continue
      if (!f.image_url) continue
      const { data: pecas } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', f.id)
      const refs = [...new Set((pecas || []).map((p) => num(p.reference)).filter(Boolean))]
      if (!refs.length) continue

      const r = await fetch(f.image_url)
      if (!r.ok) { console.log(`  ${f.code}: imagem não abriu`); continue }
      const buf = Buffer.from(await r.arrayBuffer())

      const { hotspots } = await hotspotsDaImagem(worker, buf, refs)
      await sb.from('catalogo_figuras').update({ hotspots }).eq('id', f.id)
      totF++; totH += hotspots.length
      const cobertas = new Set(hotspots.map((h) => h.reference)).size
      if (!hotspots.length) vazias++
      console.log(`  ${String(f.code).padEnd(6)} ${f.name.slice(0, 32).padEnd(32)} ${String(hotspots.length).padStart(3)} bolinhas · ${cobertas}/${refs.length} itens`)
    }
  }
  await worker.terminate()
  console.log(`\n✅ ${totF} figuras, ${totH} bolinhas${vazias ? ` — ${vazias} sem nenhuma` : ''}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
