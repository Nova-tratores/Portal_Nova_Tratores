// Importa o catálogo VALTRA (decodificado do catálogo offline da OIC) pro Supabase.
//
// Diferente dos outros catálogos, na Valtra UMA FIGURA SERVE VÁRIOS MODELOS.
// Por isso a figura entra UMA vez e a aplicação vai em `catalogo_figura_modelos`
// (1.590 figuras em vez de ~8.450 duplicadas).
//
// Traz de brinde os HOTSPOTS de fábrica (bolinhas já posicionadas) — os outros
// catálogos não têm isso.
//
// Rodar:  node scripts/importar-valtra.mjs [--limite N] [--dry]
// Requer: sql/catalogo-figura-modelos.sql aplicado + .env.local com SERVICE_ROLE_KEY.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DADOS = 'catalogos/valtra-dados'
const TELAS = 'C:/Users/José Ortiz- Pós Vend/Downloads/Catalogo Valtra/cat_valt/telas'
const BUCKET = 'catalogo'
const MARCA = 'Valtra'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const limite = (() => { const i = args.indexOf('--limite'); return i >= 0 ? parseInt(args[i + 1]) : 0 })()

function env(k) {
  const t = readFileSync('.env.local', 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })

const ler = (f) => readFileSync(`${DADOS}/${f}`, 'latin1').split(/\r?\n/).filter(Boolean)
// uuid estável a partir do número da página → re-rodar não duplica
const uuidFig = (pag) => {
  const h = createHash('sha1').update('valtra:fig:' + pag).digest('hex')
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`
}
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------- dimensões do JPEG (pra converter hotspot 0-10000 -> pixel) ----------
function dimensoesJPEG(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

// ---------- 1. tabelas de apoio ----------
console.log('Lendo tabelas de apoio...')
const desc = new Map()   // LX00000018 -> "Prolongador da engraxadeira"
for (const l of ler('TRAD_PECA_POR.STB.TXT')) { const [k, v] = l.split('\t'); if (k) desc.set(k.trim(), (v || '').trim()) }

const modelos = new Map() // BH140 -> "BH140"
for (const l of ler('VERSAO_POR.TXT')) { const c = l.split('\t'); if (c[0]) modelos.set(c[0].trim(), (c[1] || c[0]).trim()) }

const secoes = new Map()  // "20" -> "Motor"
for (const l of ler('GRP_POR.txt')) { const c = l.split('\t'); if (c[0]) secoes.set(c[0].trim(), (c[1] || '').trim()) }

console.log(`  descrições: ${desc.size} | modelos: ${modelos.size} | seções: ${secoes.size}`)

// ordem das seções (mesma lógica dos outros catálogos: número do grupo)
const ordemSecao = [...secoes.keys()].sort((a, b) => Number(a) - Number(b))

// ---------- 2. índice de figuras ----------
const figuras = []
for (const l of ler('PAG_POR.IND.txt')) {
  const c = l.split('\t')
  const [pag, versoes] = (c[0] || '').split('@')
  if (!pag) continue
  const mods = (versoes || '').split('|').map(v => v.replace(/^VERSAO=/, '').trim()).filter(Boolean)
  figuras.push({
    pag: pag.trim(),
    ilust: (c[1] || '').trim(),
    code: (c[2] || '').trim(),
    name: (c[3] || '').trim(),
    grupo: (c[4] || '').trim(),
    modelos: [...new Set(mods)],
  })
}
console.log(`  figuras no índice: ${figuras.length}`)

// ---------- 3. importar ----------
const alvo = limite ? figuras.slice(0, limite) : figuras
console.log(`\nImportando ${alvo.length} figuras${dry ? ' (DRY RUN)' : ''}...\n`)

// marca + modelos
if (!dry) {
  await sb.from('catalogo_marcas').upsert({ nome: MARCA, slug: slugify(MARCA), ordem: 5 }, { onConflict: 'slug' })
  const rowsMod = [...modelos.entries()].map(([cod, nome]) => ({
    slug: slugify(MARCA + '-' + cod), nome, marca: MARCA, tipo: 'Trator', ordem: 0,
  }))
  const { error: em } = await sb.from('catalogo_modelos').upsert(rowsMod, { onConflict: 'slug' })
  if (em) console.log('  ! modelos:', em.message)
  else console.log(`  modelos cadastrados: ${rowsMod.length}`)
}

let okFig = 0, okPecas = 0, okHot = 0, semImg = 0, erros = 0
const cacheImg = new Map()

for (const f of alvo) {
  try {
    const fid = uuidFig(f.pag)

    // ---- imagem (telas/<pag>.<largura>.jpg — pega a maior) ----
    let imageUrl = null, dim = null
    for (const larg of ['1024', '800', '640']) {
      const p = `${TELAS}/${f.pag}.${larg}.jpg`
      if (!existsSync(p)) continue
      const buf = readFileSync(p)
      dim = dimensoesJPEG(buf)
      const path = `valtra/${f.pag}.jpg`
      if (cacheImg.has(path)) { imageUrl = cacheImg.get(path) }
      else if (!dry) {
        const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
        if (!up.error) { imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; cacheImg.set(path, imageUrl) }
      } else { imageUrl = `(dry)${path}` }
      break
    }
    if (!imageUrl) semImg++

    // ---- hotspots (CLI) ----
    const hotspots = []
    const balaoPorCodigo = new Map()
    const fCli = `${DADOS}/${f.pag}.CLI.txt`
    if (existsSync(fCli)) {
      for (const l of ler(`${f.pag}.CLI.txt`)) {
        const c = l.split('\t')
        const code = (c[0] || '').split('@')[0].trim()
        const x = Number(c[2]), y = Number(c[3]), w = Number(c[4]), h = Number(c[5])
        const ref = (c[7] || '').trim()
        if (!code || !Number.isFinite(x)) continue
        if (ref && !balaoPorCodigo.has(code)) balaoPorCodigo.set(code, ref)
        if (dim) {
          hotspots.push({
            id: randomUUID(), reference: ref || '',
            x: Math.round(((x + w / 2) / 10000) * dim.w),
            y: Math.round(((y + h / 2) / 10000) * dim.h),
          })
        }
      }
    }

    // ---- peças (LTP) ----
    const pecas = []
    if (existsSync(`${DADOS}/${f.pag}.LTP.txt`)) {
      for (const l of ler(`${f.pag}.LTP.txt`)) {
        const c = l.split('\t')
        const code = (c[2] || (c[0] || '').split('@')[0] || '').trim()
        if (!code) continue
        const lx = (c[3] || '').match(/LX\d+/)?.[0]
        const qtd = Number((c[4] || '').match(/,(\d+)\??>?$/)?.[1] || (c[4] || '').split(',')[2] || 1) || 1
        pecas.push({
          figura_id: fid, code, name: (lx && desc.get(lx)) || '',
          reference: balaoPorCodigo.get(code) || '', qtd, unit: 'un', compravel: true, modelo: null,
        })
      }
    }

    if (dry) { okFig++; okPecas += pecas.length; okHot += hotspots.length; continue }

    // ---- grava figura ----
    const secaoNome = secoes.get(f.grupo) || 'Geral'
    const { error: ef } = await sb.from('catalogo_figuras').upsert({
      id: fid, code: f.code || f.pag, name: f.name, secao: secaoNome,
      secao_ordem: Math.max(0, ordemSecao.indexOf(f.grupo)), ordem: Number(f.pag) || 0,
      image_url: imageUrl, thumb_url: imageUrl, hotspots,
      path: [`Valtra`, secaoNome, f.name].join(','), modelo: f.modelos[0] ? modelos.get(f.modelos[0]) || f.modelos[0] : null,
    }, { onConflict: 'id' })
    if (ef) { erros++; console.log(`  ! figura ${f.pag}: ${ef.message}`); continue }
    okFig++; okHot += hotspots.length

    // ---- aplicação (figura serve N modelos) ----
    const apps = f.modelos.map(m => ({ figura_id: fid, modelo: modelos.get(m) || m }))
    if (apps.length) {
      const { error: ea } = await sb.from('catalogo_figura_modelos').upsert(apps, { onConflict: 'figura_id,modelo' })
      if (ea) console.log(`  ! aplicação ${f.pag}: ${ea.message}`)
    }

    // ---- peças (limpa e reinsere) ----
    await sb.from('catalogo_pecas').delete().eq('figura_id', fid)
    for (let i = 0; i < pecas.length; i += 500) {
      const { error: ep } = await sb.from('catalogo_pecas').insert(pecas.slice(i, i + 500))
      if (ep) { console.log(`  ! peças ${f.pag}: ${ep.message}`); break }
    }
    okPecas += pecas.length

    if (okFig % 100 === 0) console.log(`  ${okFig}/${alvo.length} figuras | ${okPecas} peças | ${okHot} hotspots`)
  } catch (e) {
    erros++; console.log(`  ! ${f.pag}: ${e.message}`)
  }
}

console.log(`\n✅ Valtra: ${okFig} figuras, ${okPecas} peças, ${okHot} hotspots. Sem imagem: ${semImg}. Erros: ${erros}.`)
