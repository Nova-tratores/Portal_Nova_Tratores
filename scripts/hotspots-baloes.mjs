// Cria as BOLINHAS (hotspots) de catálogos cujos números vêm DENTRO DE UM CÍRCULO
// (balão) desenhado na folha — caso da Mahindra/Zeitten.
//
// Por que um script próprio: o hotspots-ocr.mjs foi feito pra números SOLTOS no
// traço (Ventura) e não acha nada aqui. Balão é bem mais fácil: o círculo é uma
// forma previsível, então em vez de OCR na folha inteira a gente:
//   1) acha os anéis (componentes escuros, quadrados, ocos, de tamanho parecido)
//   2) recorta SÓ o miolo de cada anel e manda ao OCR só o dígito
//   3) descarta o que não casar com as refs REAIS da figura
//      (melhor nenhuma bolinha do que uma bolinha errada)
//
// Rodar:
//   node scripts/hotspots-baloes.mjs --figura <id>                 (teste numa figura)
//   node scripts/hotspots-baloes.mjs --modelo "6075 P2"            (só as sem hotspot)
//   node scripts/hotspots-baloes.mjs --marca "Mahindra"            (idem, marca toda)
//   ...adicione --dry pra só mostrar, sem gravar
//   ...adicione --debug pra salvar um PNG com os balões marcados

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

const env = (k) => {
  const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const has = (n) => args.includes(n)
const DRY = has('--dry'), DEBUG = has('--debug')
// --solto: número SEM círculo em volta (Ventura). Em vez do anel, exige isolamento.
const SOLTO = has('--solto')
// Quanto do perímetro do círculo precisa ter traço. Alguns desenhos têm o balão
// fino/irregular e não passam nos 0.82 — daí poder afrouxar pela linha de comando.
const ANEL = Number(opt('--anel') || 0.82)
const CONF = Number(opt('--conf') || 75)   // confiança mínima do OCR
// --ids: lista de figuras específicas (processa mesmo que já tenham bolinhas)
const IDS = (opt('--ids') || '').split(',').map((s) => s.trim()).filter(Boolean)

// ---------- acha os anéis (balões) ----------
// Um balão é: componente escuro, caixa quase quadrada, de tamanho plausível e OCO
// (o traço é só a borda — o miolo é branco, com o dígito no meio).
function acharBaloes(bin, W, H) {
  const visto = new Uint8Array(W * H)
  const comps = []
  const fila = new Int32Array(W * H)
  for (let p0 = 0; p0 < W * H; p0++) {
    if (bin[p0] === 0 || visto[p0]) continue
    let ini = 0, fim = 0
    fila[fim++] = p0; visto[p0] = 1
    let minX = W, maxX = 0, minY = H, maxY = 0, n = 0
    while (ini < fim) {
      const p = fila[ini++]
      const x = p % W, y = (p / W) | 0
      n++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (n > 400000) break // não é balão, é o desenho todo
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (bin[q] && !visto[q]) { visto[q] = 1; fila[fim++] = q }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1
    comps.push({ minX, minY, maxX, maxY, w, h, n })
  }

  // NÃO dá pra procurar o círculo como componente: ele vem colado na LINHA que
  // aponta pra peça, então o conjunto círculo+linha não é nada quadrado.
  // Invertemos: achamos o DÍGITO (que é isolado, dentro do balão) e verificamos
  // se existe um ANEL em volta dele.
  const alt = (c) => c.h
  const digitos = comps.filter((c) =>
    c.h > H * 0.006 && c.h < H * 0.045 &&           // altura de dígito
    c.w > c.h * 0.12 && c.w < c.h * 1.5 &&          // "1" é fino, "8" é largo
    c.n / (c.w * c.h) > 0.12 &&                      // tem tinta de verdade
    // sem o balão em volta (--solto), o que sobra pra distinguir número de
    // parafusinho é a DENSIDADE: dígito é traço fino, rebite é mancha cheia.
    (!SOLTO || c.n / (c.w * c.h) < 0.6))

  const temAnel = (cx, cy, r) => {
    let dark = 0, tot = 0
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      // tolera espessura: procura traço numa casquinha ao redor do raio
      let achou = 0
      for (let d = -2; d <= 2; d++) {
        const x = Math.round(cx + Math.cos(a) * (r + d)), y = Math.round(cy + Math.sin(a) * (r + d))
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        if (bin[y * W + x]) { achou = 1; break }
      }
      tot++; dark += achou
    }
    return tot > 0 && dark / tot >= ANEL   // quase todo o perímetro tem traço
  }

  // Junta dígitos VIZINHOS num número só ("1"+"0" = "10"). Sem isso, o centro
  // usado no teste do anel fica deslocado (cada dígito está fora do centro do
  // círculo) e nenhum número de 2 dígitos é encontrado.
  const numeros = []
  const usadoD = new Set()
  for (const d of digitos) {
    if (usadoD.has(d)) continue
    usadoD.add(d)
    const grupo = [d]
    for (const o of digitos) {
      if (usadoD.has(o)) continue
      const mesmaLinha = Math.abs((o.minY + o.maxY) / 2 - (d.minY + d.maxY) / 2) < d.h * 0.45
      const alturaOk = o.h > d.h * 0.6 && o.h < d.h * 1.6
      const gap = Math.min(Math.abs(o.minX - d.maxX), Math.abs(d.minX - o.maxX))
      if (mesmaLinha && alturaOk && gap < d.h * 0.7) { grupo.push(o); usadoD.add(o) }
    }
    numeros.push({
      cx: (Math.min(...grupo.map((g) => g.minX)) + Math.max(...grupo.map((g) => g.maxX))) / 2,
      cy: (Math.min(...grupo.map((g) => g.minY)) + Math.max(...grupo.map((g) => g.maxY))) / 2,
      h: Math.max(...grupo.map((g) => g.h)),
    })
  }

  // Nem todo catálogo põe o número dentro de um círculo. Na Ventura, por exemplo,
  // ele fica SOLTO na ponta de uma linha. Nesse modo (--solto) exigimos, no lugar
  // do anel, que o número esteja ISOLADO — cercado de branco —, o que separa o
  // número do resto do traço do desenho.
  const isolado = (cx, cy, h) => {
    const r1 = h * 0.95, r2 = h * 1.6
    let dark = 0, tot = 0
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      for (const rr of [r1, (r1 + r2) / 2, r2]) {
        const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr)
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        tot++; if (bin[y * W + x]) dark++
      }
    }
    return tot > 0 && dark / tot < 0.16   // quase tudo branco em volta
  }

  const baloes = []
  for (const n of numeros) {
    let raio = 0
    if (SOLTO) {
      if (!isolado(n.cx, n.cy, n.h)) continue
      raio = Math.round(n.h * 0.85)
    } else {
      for (let r = Math.round(n.h * 0.7); r <= Math.round(n.h * 2.2); r++) {
        if (temAnel(n.cx, n.cy, r)) { raio = r; break }
      }
      if (!raio) continue
    }
    if (baloes.some((b) => Math.hypot(b.cx - n.cx, b.cy - n.cy) < raio * 0.9)) continue
    baloes.push({ cx: n.cx, cy: n.cy, raio })
  }
  return baloes.map((b) => ({
    minX: Math.round(b.cx - b.raio), maxX: Math.round(b.cx + b.raio),
    minY: Math.round(b.cy - b.raio), maxY: Math.round(b.cy + b.raio),
    w: b.raio * 2, h: b.raio * 2,
  }))
}

async function processarFigura(fig, worker) {
  const { data: pecas } = await sb.from('catalogo_pecas').select('reference').eq('figura_id', fig.id)
  const refsReais = new Set((pecas || []).map((p) => String(p.reference || '').trim()).filter(Boolean))
  if (!refsReais.size) { console.log(`  ${fig.code} — sem refs, pulado`); return 0 }
  // Ref numérica pode vir com zeros à frente ("004") no cadastro, mas o desenho
  // mostra "4". Normalizamos pelo número e guardamos o ORIGINAL, pra bolinha
  // linkar na peça certa. (KUHN usa "001".."010".)
  const refPorNum = new Map()
  for (const r of refsReais) { if (/^\d+$/.test(r)) refPorNum.set(String(parseInt(r, 10)), r) }

  const buf = Buffer.from(await (await fetch(fig.image_url)).arrayBuffer())
  const img = sharp(buf).grayscale()
  const { width: W, height: H } = await img.metadata()
  const raw = await img.threshold(150).raw().toBuffer()
  // threshold: 0 = preto (traço). Invertemos: 1 = traço.
  const bin = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) bin[i] = raw[i] < 128 ? 1 : 0

  const baloes = acharBaloes(bin, W, H)
  const nAneis = baloes.length
  const hotspots = []
  const usados = new Set()
  for (const b of baloes) {
    const pad = Math.round(b.w * 0.18) // tira a borda do círculo, deixa só o miolo
    const left = Math.max(0, b.minX + pad), top = Math.max(0, b.minY + pad)
    const wid = Math.min(W - left, b.w - pad * 2), hei = Math.min(H - top, b.h - pad * 2)
    if (wid < 6 || hei < 6) continue
    const recorte = await sharp(buf).extract({ left, top, width: wid, height: hei })
      .resize({ width: 160, kernel: 'cubic' }).grayscale().normalise()
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#fff' })
      .png().toBuffer()
    const { data } = await worker.recognize(recorte)
    const lido = String(data.text || '').replace(/\D/g, '')
    // Leitura duvidosa = bolinha no lugar errado (já vimos o OCR ler '2' como '5'
    // com confiança 51). Melhor nenhuma bolinha do que uma errada.
    if (Number(data.confidence || 0) < CONF) continue
    if (!lido) continue
    const num = String(parseInt(lido, 10))
    // Aceita tanto a forma crua quanto a normalizada (com/sem zeros à frente).
    const ref = refsReais.has(lido) ? lido : (refPorNum.get(num) || null)
    if (!ref || usados.has(ref)) continue   // só aceita ref que existe de verdade
    usados.add(ref)
    if (DEBUG) console.log('      dbg ref=' + ref + ' conf=' + Math.round(Number(data.confidence||0)) + ' h=' + b.h)
    hotspots.push({ reference: ref, x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) })
  }

  console.log(`  ${fig.code} ${String(fig.name || '').slice(0, 34).padEnd(34)} ${String(hotspots.length).padStart(3)}/${nAneis} aneis · ${hotspots.length}/${refsReais.size} refs`)

  if (DEBUG) {
    // Reduz a base ANTES de compor e escala as marcas junto — evita divergência
    // de dimensão (orientação EXIF) ao compor no tamanho original.
    const LARG = 1200, k = LARG / W, Hd = Math.round(H * k)
    const base = await sharp(buf).resize(LARG).grayscale().toBuffer()
    const marca = hotspots.map((h) => {
      const x = Math.round(h.x * k), y = Math.round(h.y * k)
      return `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#e11" stroke-width="3"/><text x="${x}" y="${y - 20}" font-size="22" fill="#e11" text-anchor="middle">${h.reference}</text>`
    }).join('')
    const svg = Buffer.from(`<svg width="${LARG}" height="${Hd}">${marca}</svg>`)
    await sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toFile(`debug-${fig.code}.png`)
    console.log(`     debug: debug-${fig.code}.png (achou: ${hotspots.map((h) => h.reference).join(', ') || 'nenhum'})`)
  }
  if (!DRY && hotspots.length) {
    await sb.from('catalogo_figuras').update({ hotspots }).eq('id', fig.id)
  }
  return hotspots.length
}

// ---------- seleção das figuras ----------
let q = sb.from('catalogo_figuras').select('id,code,name,image_url,hotspots,modelo').not('image_url', 'is', null)
const figuraId = opt('--figura'), modelo = opt('--modelo'), marca = opt('--marca')
if (IDS.length) q = q.in('id', IDS)
else if (figuraId) q = q.eq('id', figuraId)
else if (modelo) q = q.eq('modelo', modelo)
else if (marca) {
  const { data: mods } = await sb.from('catalogo_modelos').select('nome').eq('marca', marca)
  q = q.in('modelo', (mods || []).map((m) => m.nome))
} else if (!IDS.length) { console.error('Use --figura <id> | --ids a,b | --modelo "X" | --marca "Y"'); process.exit(1) }

let { data: figs } = await q
if (!figuraId && !IDS.length && !has('--todas')) figs = (figs || []).filter((f) => !Array.isArray(f.hotspots) || f.hotspots.length === 0)
console.log(`Figuras a processar: ${(figs || []).length}${DRY ? ' (DRY)' : ''}\n`)

const worker = await createWorker('eng')
await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '8' })  // 8 = uma palavra (aceita 2 dígitos)
let totalBol = 0, comBol = 0
for (const f of figs || []) {
  try {
    const n = await processarFigura(f, worker)
    totalBol += n; if (n > 0) comBol++
  } catch (e) { console.log(`  ! ${f.code}: ${e.message}`) }
}
await worker.terminate()
console.log(`\n✅ ${(figs || []).length} figuras · ${totalBol} bolinhas · ${comBol} com bolinha, ${(figs || []).length - comBol} sem`)
