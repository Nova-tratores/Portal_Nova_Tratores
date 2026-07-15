// Bolinhas com HÍBRIDO CV+IA: a visão computacional acha a posição exata de cada
// número no desenho; a IA (OpenAI) lê os recortes (é muito melhor que o Tesseract).
// Só entra a bolinha cujo número existe mesmo na lista de peças da figura.
//
// Como: 1) acha os "blobs" escuros com forma de dígito e agrupa em etiquetas (posição exata)
//       2) monta os recortes numa grelha e pergunta à IA o número de cada célula
//       3) casa com as refs reais; posição = a da CV.
//
// Rodar:  node scripts/hotspots-ia.mjs --modelo "T-BOSS 550" [--figura <id>] [--todas]
// Precisa OPENAI_API_KEY no .env.local.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const env = (k) => { const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); const m = t.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : '' }
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const KEY = env('OPENAI_API_KEY')
const MODEL = env('OPENAI_MODEL') || 'gpt-4o-mini'
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null }
const MODELO = opt('modelo'); const FIGURA = opt('figura'); const REFAZ = argv.includes('--todas')
const num = (s) => { const t = String(s || '').replace(/\D/g, ''); return t ? String(parseInt(t, 10)) : null }

// ---- CV: acha etiquetas (posição exata) ----
function etiquetasDaImagem(gray, W, H) {
  const dark = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (gray[i] < 128) dark[i] = 1
  const vis = new Uint8Array(W * H), comps = []
  for (let i = 0; i < W * H; i++) {
    if (!dark[i] || vis[i]) continue
    const st = [i]; vis[i] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0
    while (st.length) { const p = st.pop(), x = p % W, y = (p - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (dark[q] && !vis[q]) { vis[q] = 1; st.push(q) } } }
    comps.push({ x0, y0, x1, y1, n })
  }
  const hMin = Math.max(8, Math.round(H * 0.011)), hMax = Math.max(20, Math.round(H * 0.05))
  const cand = comps.filter((c) => { const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1, d = c.n / (w * h); return h >= hMin && h <= hMax && w >= 3 && w <= h * 1.2 && d > 0.2 && d < 0.9 })
  const labels = []
  for (const c of cand.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const h = c.y1 - c.y0 + 1
    const alvo = labels.find((l) => { const ov = Math.min(l.y1, c.y1) - Math.max(l.y0, c.y0); const gap = c.x0 - l.x1; return ov > h * 0.55 && gap < h * 1.2 && gap > -4 && c.x0 >= l.x0 - 2 })
    if (alvo) { alvo.x1 = Math.max(alvo.x1, c.x1); alvo.y0 = Math.min(alvo.y0, c.y0); alvo.y1 = Math.max(alvo.y1, c.y1); alvo.px.push(c) }
    else labels.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, px: [c] })
  }
  return { dark, labels }
}

// monta os recortes numa grelha (cada célula = 1 etiqueta) para a IA ler de uma vez
async function montarGrade(dark, W, labels) {
  const CELL = 64, COLS = 8, GAP = 6
  const rows = Math.ceil(labels.length / COLS)
  const gw = COLS * CELL + (COLS + 1) * GAP, gh = rows * CELL + (rows + 1) * GAP
  const canvas = Buffer.alloc(gw * gh, 255)
  for (let li = 0; li < labels.length; li++) {
    const l = labels[li]
    const lw = l.x1 - l.x0 + 1, lh = l.y1 - l.y0 + 1
    const crop = Buffer.alloc(lw * lh, 255)
    for (const c of l.px) for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (dark[y * W + x]) crop[(y - l.y0) * lw + (x - l.x0)] = 0
    const scale = Math.min((CELL - 8) / lw, (CELL - 8) / lh)
    const rw = Math.max(1, Math.round(lw * scale)), rh = Math.max(1, Math.round(lh * scale))
    const resized = await sharp(crop, { raw: { width: lw, height: lh, channels: 1 } }).resize(rw, rh, { kernel: 'nearest' }).raw().toBuffer()
    const cx = GAP + (li % COLS) * (CELL + GAP), cy = GAP + Math.floor(li / COLS) * (CELL + GAP)
    const ox = cx + Math.round((CELL - rw) / 2), oy = cy + Math.round((CELL - rh) / 2)
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) canvas[(oy + y) * gw + (ox + x)] = resized[y * rw + x]
  }
  return { png: await sharp(canvas, { raw: { width: gw, height: gh, channels: 1 } }).png().toBuffer(), rows, COLS }
}

async function lerGradeIA(png, n, rows, cols) {
  const b64 = png.toString('base64')
  const body = { model: MODEL, temperature: 0, max_tokens: 2000, messages: [{ role: 'user', content: [
    { type: 'text', text: `A imagem é uma grade ${rows}x${cols} (${n} células preenchidas, lidas da esquerda para a direita, de cima para baixo). Cada célula tem um número de 1 a 3 dígitos. Responda só um array JSON com o número lido em cada célula, na ordem, usando null se a célula estiver vazia ou ilegível. Ex.: [1,2,null,14].` },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64, detail: 'high' } } ] }] }
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  const arr = JSON.parse(j.choices[0].message.content.replace(/```json|```/g, '').match(/\[[\s\S]*\]/)[0])
  return { arr, tokens: j.usage.total_tokens }
}

async function main() {
  let qf = sb.from('catalogo_figuras').select('id,code,name,image_url,hotspots').eq('modelo', MODELO)
  if (FIGURA) qf = qf.eq('id', FIGURA)
  const { data: figs } = await qf
  let totF = 0, totH = 0, tok = 0
  for (const f of figs || []) {
    if (!REFAZ && !FIGURA && Array.isArray(f.hotspots) && f.hotspots.length) continue
    if (!f.image_url) continue
    const { data: pecas } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', f.id)
    const refs = [...new Set((pecas || []).map((p) => num(p.reference)).filter(Boolean))]
    if (!refs.length) continue
    try {
      const buf = Buffer.from(await (await fetch(f.image_url)).arrayBuffer())
      const { data: gray, info } = await sharp(buf).flatten({ background: '#fff' }).grayscale().raw().toBuffer({ resolveWithObject: true })
      const { dark, labels } = etiquetasDaImagem(gray, info.width, info.height)
      if (!labels.length) { console.log(`  ${f.code} ${f.name.slice(0, 28)} — sem etiquetas`); continue }
      const { png, rows, COLS } = await montarGrade(dark, info.width, labels)
      const { arr, tokens } = await lerGradeIA(png, labels.length, rows, COLS)
      tok += tokens
      const hotspots = []
      for (let i = 0; i < labels.length; i++) {
        const t = num(arr[i]); if (!t || !refs.includes(t)) continue
        const l = labels[i]
        if (hotspots.some((h) => h.reference === t)) continue
        hotspots.push({ reference: t, x: Math.round((l.x0 + l.x1) / 2), y: Math.round((l.y0 + l.y1) / 2) })
      }
      await sb.from('catalogo_figuras').update({ hotspots }).eq('id', f.id)
      totF++; totH += hotspots.length
      const cob = new Set(hotspots.map((h) => h.reference)).size
      console.log(`  ${String(f.code).padEnd(6)} ${f.name.slice(0, 28).padEnd(28)} ${String(hotspots.length).padStart(3)} bolinhas · ${cob}/${refs.length} itens`)
    } catch (e) { console.log(`  ${f.code} — erro: ${e.message.slice(0, 50)}`) }
  }
  console.log(`\n✅ ${totF} figuras, ${totH} bolinhas · ${tok} tokens (~$${(tok / 1e6 * 0.3).toFixed(2)})`)
}
main().catch((e) => { console.error(e); process.exit(1) })
