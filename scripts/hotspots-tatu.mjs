// Cria as BOLINHAS (hotspots) das folhas da TATU/MARCHESAN.
//
// A Marchesan não publica coordenadas: os números dos itens vêm DESENHADOS na imagem.
// Mas vêm em AZUL, e o desenho é preto — dá pra achá-los:
//   1) isola os pixels azuis (máscara)                -> só sobram os números
//   2) junta os pixels em caracteres, e os caracteres em etiquetas (mesma linha, colados)
//   3) lê a etiqueta por OCR, usando SÓ a máscara (sem as linhas do desenho atravessando)
//   4) confere contra as refs reais da figura (catalogo_pecas): o que não bate, descarta
//      — "01A"/"01B" (sub-itens do desenho) apontam pro item "01" da lista.
// A bolinha fica no centro da etiqueta, em pixels da imagem — que é como o portal desenha.
//
// Rodar:  node scripts/hotspots-tatu.mjs            (todas as figuras da Tatu sem hotspot)
//         node scripts/hotspots-tatu.mjs --todas    (refaz mesmo as que já têm)
//         node scripts/hotspots-tatu.mjs <modelo>   (só um modelo)

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

const args = process.argv.slice(2)
const REFAZ = args.includes('--todas')
const MODELO = args.find((a) => !a.startsWith('--')) || null

// ---------- visão ----------
async function etiquetas(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = data[i * C], g = data[i * C + 1], b = data[i * C + 2]
    if (b > 90 && b - r > 40 && b - g > 40) mask[i] = 1 // azul do rótulo
  }

  // caracteres = componentes conexas da máscara
  const vis = new Uint8Array(W * H), chars = []
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || vis[i]) continue
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
        if (mask[q] && !vis[q]) { vis[q] = 1; st.push(q) }
      }
    }
    if (n >= 8 && y1 - y0 >= 6 && y1 - y0 < H / 6) chars.push({ x0, y0, x1, y1 })
  }

  // etiquetas = caracteres da mesma linha, colados
  chars.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const labels = []
  for (const c of chars) {
    const alt = c.y1 - c.y0 + 1
    const alvo = labels.find((l) => {
      const ov = Math.min(l.y1, c.y1) - Math.max(l.y0, c.y0)
      return ov > alt * 0.6 && c.x0 - l.x1 < 14 && c.x0 >= l.x0 - 2
    })
    if (alvo) { alvo.x1 = Math.max(alvo.x1, c.x1); alvo.y0 = Math.min(alvo.y0, c.y0); alvo.y1 = Math.max(alvo.y1, c.y1) }
    else labels.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 })
  }
  return { labels, mask, W, H }
}

// recorte binário (só o azul) pro OCR: o traço do desenho não entra
async function recorte({ mask, W, H }, l) {
  const pad = 6
  const lw = l.x1 - l.x0 + 1 + pad * 2, lh = l.y1 - l.y0 + 1 + pad * 2
  const px = Buffer.alloc(lw * lh, 255)
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const gx = l.x0 - pad + x, gy = l.y0 - pad + y
    if (gx >= 0 && gy >= 0 && gx < W && gy < H && mask[gy * W + gx]) px[y * lw + x] = 0
  }
  return sharp(px, { raw: { width: lw, height: lh, channels: 1 } })
    .resize({ width: lw * 4, kernel: 'nearest' })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#fff' })
    .png().toBuffer()
}

// ---------- casar o que o OCR leu com as refs reais da figura ----------
const CONF = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', T: '1', S: '5', Z: '2', G: '6' }
function normalizar(txt, refs) {
  let t = String(txt || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!t) return null
  // sufixo do desenho (01A, 01B…): guarda, mas o item da lista é o número
  const m = t.match(/^([0-9A-Z]+?)([A-H])?$/)
  let base = m ? m[1] : t
  base = base.split('').map((c) => (/[0-9]/.test(c) ? c : (CONF[c] || ''))).join('')
  if (!base) return null
  const num = String(parseInt(base, 10))
  if (Number.isNaN(+num)) return null
  // a lista pode ter "01", "001" ou "1" — compara pelo número
  return refs.find((r) => String(parseInt(String(r).replace(/\D/g, ''), 10)) === num) || null
}

async function main() {
  let q = sb.from('catalogo_modelos').select('nome').eq('marca', 'Tatu Marchesan')
  if (MODELO) q = q.eq('nome', MODELO)
  const { data: modelos } = await q
  if (!modelos?.length) { console.error('Nenhum modelo da Tatu.'); return }

  const worker = await createWorker('eng')
  await worker.setParameters({ tessedit_char_whitelist: '0123456789ABCDEFGH', tessedit_pageseg_mode: '7' })

  let totF = 0, totH = 0, semNada = 0
  for (const mod of modelos) {
    const { data: figuras } = await sb.from('catalogo_figuras').select('id, code, name, hotspots').eq('modelo', mod.nome)
    console.log(`\n=== ${mod.nome} (${figuras?.length || 0} figuras) ===`)
    for (const f of figuras || []) {
      if (!REFAZ && Array.isArray(f.hotspots) && f.hotspots.length) continue
      const { data: pecas } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', f.id)
      const refs = [...new Set((pecas || []).map((p) => p.reference).filter(Boolean))]
      if (!refs.length) continue

      let buf
      try {
        const r = await fetch(`http://catalogo.marchesan.com.br/LibImage/${f.code}.jpg`)
        if (!r.ok) { console.log(`  ${f.code}: sem imagem (HTTP ${r.status})`); continue }
        buf = Buffer.from(await r.arrayBuffer())
      } catch (e) { console.log(`  ${f.code}: erro imagem (${e.message})`); continue }

      const vis = await etiquetas(buf)
      const hotspots = []
      for (const l of vis.labels) {
        const png = await recorte(vis, l)
        const { data: { text } } = await worker.recognize(png)
        const ref = normalizar(text, refs)
        if (!ref) continue
        hotspots.push({ reference: ref, x: Math.round((l.x0 + l.x1) / 2), y: Math.round((l.y0 + l.y1) / 2) })
      }
      totF++
      totH += hotspots.length
      if (!hotspots.length) semNada++
      await sb.from('catalogo_figuras').update({ hotspots }).eq('id', f.id)
      console.log(`  ${f.code} ${f.name.slice(0, 34).padEnd(34)} ${String(hotspots.length).padStart(3)} bolinhas (de ${vis.labels.length} etiquetas, ${refs.length} itens)`)
    }
  }
  await worker.terminate()
  console.log(`\n✅ ${totF} figuras, ${totH} bolinhas${semNada ? ` — ${semNada} figuras ficaram sem nenhuma` : ''}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
