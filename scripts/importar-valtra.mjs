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
// Desenhos das peças: os .PHF de ilust/full (PCX modificado da OiC) convertidos
// pra PNG por scripts/valtra-phf-para-png.mjs. NÃO é a pasta `telas`, que só tem
// as telas do próprio programa (menus/ajuda).
// HD = decodificado de ilust/zoom (1,76x maior que ilust/full). Como as
// coordenadas do CLI estão em pixels da versão `full`, ao usar a HD é preciso
// escalar os hotspots pelo fator real de cada figura (ver `fator` abaixo).
const IMGS_HD = 'catalogos/valtra-img-hd'
const IMGS = 'catalogos/valtra-img'
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
// A rede cai no meio de importações longas (fetch failed). Tenta de novo antes
// de desistir — sem isso, a figura ficava sem imagem e era preciso re-rodar tudo.
async function comRetry(rotulo, fn, tentativas = 4) {
  let ultimo
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fn()
      if (!r?.error) return r
      ultimo = r.error
    } catch (e) { ultimo = e }
    if (i < tentativas) await new Promise((r) => setTimeout(r, 400 * i * i))
  }
  console.log(`  ! ${rotulo}: ${ultimo?.message || ultimo} (após ${tentativas} tentativas)`)
  return { error: ultimo }
}

// Coordenada do CLI vem com zeros à esquerda suprimidos; o original repõe até 4 dígitos.
const pad4 = (s) => { let t = String(s ?? '').trim(); while (t.length < 4) t = '0' + t; return t }

// PNG: largura/altura ficam no chunk IHDR, sempre nos bytes 16..23.
function dimensoesPNG(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
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

    // ---- imagem: casa pela coluna ILUST do índice (não pela página!) ----
    // ilust "00000690" -> catalogos/valtra-img/00000690.png. Várias páginas
    // podem apontar pra MESMA ilustração — daí o cache por caminho.
    let imageUrl = null, dim = null, fator = { x: 1, y: 1 }
    // Prefere a HD; se faltar, usa a normal.
    const pHd = `${IMGS_HD}/${f.ilust}.png`
    const pSd = `${IMGS}/${f.ilust}.png`
    const p = f.ilust && existsSync(pHd) ? pHd : pSd
    if (f.ilust && existsSync(p)) {
      const buf = readFileSync(p)
      dim = dimensoesPNG(buf)
      // Hotspots vêm em pixels da imagem `full`: se a imagem servida for a HD,
      // escala pela razão real entre as duas (varia ~1,759–1,766 por figura).
      if (p === pHd && existsSync(pSd) && dim) {
        const dSd = dimensoesPNG(readFileSync(pSd))
        if (dSd && dSd.w > 0 && dSd.h > 0) fator = { x: dim.w / dSd.w, y: dim.h / dSd.h }
      }
      const path = `valtra/${f.ilust}.png`
      if (cacheImg.has(path)) { imageUrl = cacheImg.get(path) }
      else if (!dry) {
        const up = await comRetry(`upload ${f.ilust}`, () =>
          sb.storage.from(BUCKET).upload(path, buf, { contentType: 'image/png', upsert: true }))
        if (!up.error) { imageUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; cacheImg.set(path, imageUrl) }
      } else { imageUrl = `(dry)${path}` }
    }
    if (!imageUrl) semImg++

    // ---- hotspots (CLI) ----
    // As 4 colunas de coordenada NÃO são x/y/w/h em escala 0-10000: os dígitos
    // vêm EMBARALHADOS entre elas e o resultado já é o CENTRO em PIXELS da
    // imagem. Receita extraída do bytecode do próprio catálogo
    // (oic.mmt.Ilustracao.addItem, em _oic_mmt.jar):
    //   campos A=c[2] B=c[3] C=c[4] D=c[5], cada um preenchido com '0' à esquerda até 4 dígitos
    //   centroX = C[0] C[2] A[3] A[1]
    //   centroY = D[0] D[2] B[3] B[1]
    //   (a bolinha é um círculo de raio fixo 9 — largura/altura 18 no original)
    const hotspots = []
    const vistosHot = new Set()
    const balaoPorCodigo = new Map()
    const fCli = `${DADOS}/${f.pag}.CLI.txt`
    if (existsSync(fCli)) {
      for (const l of ler(`${f.pag}.CLI.txt`)) {
        const c = l.split('\t')
        const code = (c[0] || '').split('@')[0].trim()
        const ref = (c[7] || '').trim()
        if (!code) continue
        if (ref && !balaoPorCodigo.has(code)) balaoPorCodigo.set(code, ref)
        const A = pad4(c[2]), B = pad4(c[3]), C = pad4(c[4]), D = pad4(c[5])
        const cxSd = parseInt(C[0] + C[2] + A[3] + A[1], 10)
        const cySd = parseInt(D[0] + D[2] + B[3] + B[1], 10)
        if (!Number.isFinite(cxSd) || !Number.isFinite(cySd)) continue
        const cx = Math.round(cxSd * fator.x)
        const cy = Math.round(cySd * fator.y)
        // fora da imagem = linha inválida; várias peças dividem o mesmo balão
        if (dim && (cx > dim.w || cy > dim.h)) continue
        const k = `${cx},${cy},${ref}`
        if (vistosHot.has(k)) continue
        vistosHot.add(k)
        hotspots.push({ id: randomUUID(), reference: ref || '', x: cx, y: cy })
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
    // O LTP repete o mesmo código+balão em algumas figuras. Mantém a 1ª ocorrência
    // (o índice único catalogo_pecas_figura_code_ref_uidx recusa a repetição).
    if (pecas.length) {
      const vistos = new Set()
      const unicas = []
      for (const p of pecas) {
        const k = `${p.code}|${p.reference}`
        if (vistos.has(k)) continue
        vistos.add(k)
        unicas.push(p)
      }
      pecas.length = 0
      pecas.push(...unicas)
    }

    if (dry) { okFig++; okPecas += pecas.length; okHot += hotspots.length; continue }

    // ---- grava figura ----
    const secaoNome = secoes.get(f.grupo) || 'Geral'
    const linha = {
      id: fid, code: f.code || f.pag, name: f.name, secao: secaoNome,
      secao_ordem: Math.max(0, ordemSecao.indexOf(f.grupo)), ordem: Number(f.pag) || 0,
      hotspots,
      path: [`Valtra`, secaoNome, f.name].join(','), modelo: f.modelos[0] ? modelos.get(f.modelos[0]) || f.modelos[0] : null,
    }
    // Só toca na imagem quando conseguimos uma URL: se o upload falhou (rede),
    // gravar null APAGARIA a imagem boa de uma rodada anterior.
    if (imageUrl) { linha.image_url = imageUrl; linha.thumb_url = imageUrl }
    const { error: ef } = await comRetry(`figura ${f.pag}`, () =>
      sb.from('catalogo_figuras').upsert(linha, { onConflict: 'id' }))
    if (ef) { erros++; continue }
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
