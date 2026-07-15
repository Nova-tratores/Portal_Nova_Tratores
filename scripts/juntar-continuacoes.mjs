// Junta as folhas de CONTINUAÇÃO num modelo: quando a fonte parte um conjunto em duas
// folhas (mesma seção, mesmo nome, e a 2ª começa onde a 1ª acabou — ex.: 1-26 depois 27-31),
// fundimos numa figura só, com a lista completa. O desenho mantido é o que, por OCR, mostra
// mais números do conjunto todo. As bolinhas são refeitas sobre esse desenho.
//
// Rodar:  node scripts/juntar-continuacoes.mjs "T-BOSS 550" ["M570" ...]
//         node scripts/juntar-continuacoes.mjs --dry "T-BOSS 550"   (só mostra, não altera)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

const env = (k) => { const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); const m = t.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : '' }
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const MODS = argv.filter((a) => !a.startsWith('--'))
const CONF_MIN = 65
const num = (s) => { const t = String(s || '').replace(/\D/g, ''); return t ? String(parseInt(t, 10)) : null }

// ---- OCR (igual ao hotspots-ocr) ----
function componentes(gray, W, H) {
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
  return { dark, comps }
}
function candidatos(comps, H) {
  const hMin = Math.max(8, Math.round(H * 0.012)), hMax = Math.max(18, Math.round(H * 0.045))
  return comps.filter((c) => { const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1, d = c.n / (w * h); return h >= hMin && h <= hMax && w >= 3 && w <= h * 1.15 && d > 0.22 && d < 0.88 })
}
function etiquetas(cand) {
  const out = []
  for (const c of [...cand].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const h = c.y1 - c.y0 + 1
    const alvo = out.find((l) => { const ov = Math.min(l.y1, c.y1) - Math.max(l.y0, c.y0); const gap = c.x0 - l.x1; return ov > h * 0.55 && gap < h * 1.2 && gap > -4 && c.x0 >= l.x0 - 2 })
    if (alvo) { alvo.x1 = Math.max(alvo.x1, c.x1); alvo.y0 = Math.min(alvo.y0, c.y0); alvo.y1 = Math.max(alvo.y1, c.y1); alvo.px.push(c) }
    else out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, px: [c] })
  }
  return out
}
async function ocrImagem(worker, buf, refs) {
  const { data: gray, info } = await sharp(buf).flatten({ background: '#fff' }).grayscale().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const { dark, comps } = componentes(gray, W, H)
  const achados = []
  const grande = await sharp(buf).flatten({ background: '#fff' }).grayscale().resize({ width: W * 2, kernel: 'lanczos3' }).normalise().threshold(170).png().toBuffer()
  const r = await worker.recognize(grande, {}, { blocks: true })
  for (const b of (r.data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const w of (l.words || [])) {
    const tt = num(w.text); if (!tt || w.confidence < CONF_MIN || !refs.includes(tt)) continue
    achados.push({ reference: tt, x: Math.round((w.bbox.x0 + w.bbox.x1) / 4), y: Math.round((w.bbox.y0 + w.bbox.y1) / 4), conf: w.confidence })
  }
  for (const l of etiquetas(candidatos(comps, H))) {
    const pad = 5, lw = l.x1 - l.x0 + 1 + pad * 2, lh = l.y1 - l.y0 + 1 + pad * 2
    const px = Buffer.alloc(lw * lh, 255)
    for (const c of l.px) for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (dark[y * W + x]) px[(y - l.y0 + pad) * lw + (x - l.x0 + pad)] = 0
    const png = await sharp(px, { raw: { width: lw, height: lh, channels: 1 } }).resize({ width: lw * 5, kernel: 'nearest' }).extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#fff' }).png().toBuffer()
    const { data: { text, confidence } } = await worker.recognize(png)
    const tt = num(text); if (!tt || confidence < CONF_MIN || !refs.includes(tt)) continue
    achados.push({ reference: tt, x: Math.round((l.x0 + l.x1) / 2), y: Math.round((l.y0 + l.y1) / 2), conf: confidence })
  }
  achados.sort((a, b) => b.conf - a.conf)
  const finais = []
  for (const h of achados) { if (finais.some((f) => f.reference === h.reference && Math.abs(f.x - h.x) < 30 && Math.abs(f.y - h.y) < 30)) continue; finais.push(h) }
  return finais.map(({ reference, x, y }) => ({ reference, x, y }))
}

async function refsDe(id) {
  const { data } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', id)
  return [...new Set((data || []).map((p) => num(p.reference)).filter(Boolean))].map(Number).sort((a, b) => a - b)
}

async function main() {
  const worker = await createWorker('eng')
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '11' })

  for (const modelo of MODS) {
    // Ordena por SEÇÃO e depois ordem: a "ordem" é numerada por seção (VEÍCULO e MOTOR
    // têm ambos 1,2,3…), então ordenar só por ordem interleaçava as seções e quebrava a
    // adjacência das continuações (ex.: MOTOR 16/17 ficavam separados por figuras do VEÍCULO).
    const { data: figs } = await sb.from('catalogo_figuras').select('id,code,name,secao,ordem,image_url').eq('modelo', modelo).order('secao', { ascending: true }).order('ordem', { ascending: true })
    // refs por figura
    for (const f of figs) f._refs = await refsDe(f.id)

    // encadeia continuações: mesma seção + mesmo nome + a próxima começa acima do máx atual
    const chains = []
    let chain = null
    for (const f of figs) {
      // >= (não só >) para apanhar continuações onde a última ref de uma folha se repete
      // como a primeira da seguinte (sobreposição de 1). Quem recomeça na ref 1 (peça
      // diferente com o mesmo nome, ex.: CHAPA, OPCIONAIS) não entra.
      if (chain && f.secao === chain.secao && f.name === chain.name && f._refs.length && f._refs[0] >= chain.max && f._refs[0] > 1) {
        chain.membros.push(f); chain.max = Math.max(chain.max, ...f._refs)
      } else {
        if (chain && chain.membros.length > 1) chains.push(chain)
        chain = { secao: f.secao, name: f.name, max: f._refs.length ? Math.max(...f._refs) : 0, membros: [f] }
      }
    }
    if (chain && chain.membros.length > 1) chains.push(chain)

    console.log(`\n=== ${modelo}: ${chains.length} conjuntos a juntar ===`)
    for (const ch of chains) {
      const refsTodas = [...new Set(ch.membros.flatMap((m) => m._refs))].map(String)
      console.log(`  ${ch.name} (${ch.secao}) — ${ch.membros.length} folhas, refs até ${ch.max}`)
      if (DRY) continue
      const sobrevivente = ch.membros[0]
      const outros = ch.membros.slice(1)
      // escolhe o melhor desenho: OCR de cada candidato contra TODAS as refs
      let melhor = { url: sobrevivente.image_url, hs: [], id: sobrevivente.id }
      for (const m of ch.membros) {
        try {
          const r = await fetch(m.image_url); if (!r.ok) continue
          const hs = await ocrImagem(worker, Buffer.from(await r.arrayBuffer()), refsTodas)
          if (hs.length > melhor.hs.length) melhor = { url: m.image_url, hs, id: m.id }
        } catch { /* ignora */ }
      }
      // move as peças dos outros para o sobrevivente
      for (const o of outros) await sb.from('catalogo_pecas').update({ figura_id: sobrevivente.id }).eq('figura_id', o.id)
      // atualiza o sobrevivente com o melhor desenho + bolinhas
      await sb.from('catalogo_figuras').update({ image_url: melhor.url, hotspots: melhor.hs }).eq('id', sobrevivente.id)
      // apaga as folhas extra
      for (const o of outros) await sb.from('catalogo_figuras').delete().eq('id', o.id)
      console.log(`     -> juntado em 1 folha, ${refsTodas.length} peças, desenho com ${melhor.hs.length} bolinhas`)
    }
  }
  await worker.terminate()
}
main().catch((e) => { console.error(e); process.exit(1) })
