// Garante que TODA peça tem bolinha na imagem: para cada figura, as refs que não têm
// hotspot ganham uma bolinha "estacionada" em fila no topo do desenho. Assim aparecem no
// modo normal também; depois é só arrastar no modo edição para o lugar certo.
//
// Rodar:  node scripts/preencher-bolinhas.mjs "550 LandForce" "T-BOSS 550" ...
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
const env = (k) => { const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); const m = t.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : '' }
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const num = (s) => { const t = String(s || '').replace(/\D/g, ''); return t ? String(parseInt(t, 10)) : null }
const MODS = process.argv.slice(2)

for (const modelo of MODS) {
  const { data: figs } = await sb.from('catalogo_figuras').select('id,code,name,image_url,hotspots').eq('modelo', modelo)
  let tocadas = 0, add = 0
  for (const f of figs || []) {
    if (!f.image_url) continue
    const { data: pecas } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', f.id)
    const refs = [...new Set((pecas || []).map((p) => num(p.reference)).filter(Boolean))]
    if (!refs.length) continue
    const atual = new Map((f.hotspots || []).map((h) => [num(h.reference), { reference: String(h.reference), x: h.x, y: h.y }]))
    const faltam = refs.filter((r) => !atual.has(r))
    if (!faltam.length) continue
    // dimensões da imagem pra estacionar em pixels
    let W = 1000, H = 700
    try { const m = await sharp(Buffer.from(await (await fetch(f.image_url)).arrayBuffer())).metadata(); W = m.width || W; H = m.height || H } catch { /* usa default */ }
    faltam.forEach((r, i) => {
      const col = i % 18, row = Math.floor(i / 18)
      atual.set(r, { reference: r, x: Math.round(W * (0.035 + col * 0.052)), y: Math.round(H * (0.03 + row * 0.045)) })
    })
    await sb.from('catalogo_figuras').update({ hotspots: [...atual.values()] }).eq('id', f.id)
    tocadas++; add += faltam.length
  }
  console.log(`${modelo}: ${tocadas} figuras completadas, ${add} bolinhas estacionadas`)
}
