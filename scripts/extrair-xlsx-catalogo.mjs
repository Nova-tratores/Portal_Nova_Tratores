// Extrai um catálogo de peças que veio num XLSX (ex.: "Catálogo de Peças - 550 LandForce").
//
// Layout do arquivo (é o padrão dos manuais chineses tipo Linhai):
//   - uma aba por grande grupo (VEICULO, MOTOR) -> vira a SEÇÃO
//   - dentro dela, cada conjunto começa numa linha "1  STEERING ASSY" -> vira a FIGURA
//   - o desenho vem ancorado logo abaixo do título (as imagens estão embutidas no .xlsx)
//   - depois a tabela: REF. No. | PART No. | DESCRIPTION | Q'TY | DESCRIÇÃO
//
// Não há hotspots: os números estão desenhados na imagem (em preto, junto do traço) —
// as bolinhas, se der, saem depois por OCR (scripts/hotspots-ocr.mjs).
//
// Rodar:  node scripts/extrair-xlsx-catalogo.mjs <arquivo.xlsx> --modelo "550 LandForce" --marca "LandForce" [--tipo Quadriciclo]
// Gera catalogos/catalogo_<slug>.json (formato do importador) -> node scripts/importar-catalogo.mjs catalogo_<slug>.json

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const opt = (n, d = '') => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] || d) : d }
const XLSX = argv.find((a) => !a.startsWith('--') && /\.xlsx$/i.test(a))
if (!XLSX) { console.error('Uso: node scripts/extrair-xlsx-catalogo.mjs <arquivo.xlsx> --modelo "..." --marca "..."'); process.exit(1) }
const MODELO = opt('modelo') || 'Modelo'
const MARCA = opt('marca') || ''
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const SLUG = opt('slug') || slugify(MODELO)

// --- descompacta o xlsx (é um zip) ---
// Expand-Archive do PowerShell recusa a extensão .xlsx, então copia como .zip.
const dir = mkdtempSync(join(tmpdir(), 'xlsxcat-'))
const zip = join(dir, 'pacote.zip')
writeFileSync(zip, readFileSync(XLSX))
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`], { stdio: 'ignore' })

const x = (p) => readFileSync(join(dir, p), 'utf8')
const dec = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#10;/g, ' ')

// --- textos compartilhados ---
const shared = [...x('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))

// --- abas ---
const wb = x('xl/workbook.xml')
const wbRels = x('xl/_rels/workbook.xml.rels')
const relTarget = {}
for (const m of wbRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget[m[1]] = 'xl/' + m[2].replace(/^\/?xl\//, '')
const abas = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ nome: dec(m[1]), path: relTarget[m[2]] }))

const colIdx = (ref) => {
  const l = (ref.match(/^([A-Z]+)/) || ['', ''])[1]
  let n = 0
  for (const c of l) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

function lerAba(path) {
  const sh = x(path)
  const linhas = []
  for (const m of sh.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const c of m[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tipo = (c[2].match(/t="(\w+)"/) || [])[1]
      const corpo = c[3] || ''
      const v = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
      const is = (corpo.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]
      let val = ''
      if (is !== undefined) val = dec(is)
      else if (v !== undefined) val = tipo === 's' ? (shared[+v] ?? '') : dec(v)
      cells[colIdx(c[1])] = String(val).trim()
    }
    linhas.push({ n: +m[1], cells })
  }
  return linhas
}

function lerDesenhos(path) {
  // sheetN.xml -> drawingN.xml (pelo rels da aba)
  const rel = join('xl/worksheets/_rels', path.split('/').pop() + '.rels')
  if (!existsSync(join(dir, rel))) return []
  const alvo = (x(rel).match(/Target="([^"]*drawing\d+\.xml)"/) || [])[1]
  if (!alvo) return []
  const dpath = 'xl/drawings/' + alvo.split('/').pop()
  const drels = x(join('xl/drawings/_rels', dpath.split('/').pop() + '.rels'))
  const midia = {}
  for (const m of drels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) midia[m[1]] = m[2].split('/').pop()
  const d = x(dpath)
  const out = []
  for (const m of d.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:\1>/g)) {
    const a = m[0]
    const row = +((a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? -1) + 1
    const img = midia[(a.match(/r:embed="([^"]+)"/) || [])[1]]
    if (img) out.push({ row, img })
  }
  return out
}

// "1  STEERING ASSY", mas também "5-1  FENDER" (o mesmo conjunto tem várias folhas)
const ehTitulo = (c) => /^\d+(?:-\d+)?\s+\S/.test(c || '')
const ehCabecalho = (c) => /^REF\.?\s*No/i.test(c || '')

const figuras = []
const pecas = []
let nFig = 0

for (const aba of abas) {
  const linhas = lerAba(aba.path)
  const desenhos = lerDesenhos(aba.path)
  // imagem que se repete em várias linhas = logo/rodapé, não é desenho
  const cont = {}
  for (const d of desenhos) cont[d.img] = (cont[d.img] || 0) + 1
  const repetida = new Set(Object.entries(cont).filter(([, c]) => c > 3).map(([i]) => i))

  const titulos = linhas.filter((l) => ehTitulo(l.cells[0]) && !l.cells[1])
  console.log(`\n=== ${aba.nome}: ${titulos.length} conjuntos ===`)

  titulos.forEach((t, i) => {
    const fim = titulos[i + 1] ? titulos[i + 1].n : Infinity
    const num = (t.cells[0].match(/^\d+(?:-\d+)?/) || ['0'])[0]
    const nome = t.cells[0].replace(/^\d+(?:-\d+)?\s+/, '').trim()
    const code = num // "5-1" — é assim que o manual chama a folha
    // O id tem de levar a aba E a ordem: o "1" do VEICULO e o "1" do MOTOR são folhas
    // diferentes, e "1 STEERING ASSY" e "1 STEERING ASSY(EPS)" também.
    const id = `xlsx-${SLUG}-${slugify(aba.nome)}-${i + 1}-${code}`

    // desenho: a imagem ancorada entre o título e a tabela (fora as repetidas)
    const cab = linhas.find((l) => l.n > t.n && l.n < fim && ehCabecalho(l.cells[0]))
    const limite = cab ? cab.n : t.n + 30
    const img = desenhos.find((d) => d.row >= t.n && d.row <= limite && !repetida.has(d.img))
      || desenhos.find((d) => d.row >= t.n && d.row < fim && !repetida.has(d.img))

    let imageB64 = null
    if (img) {
      const bin = readFileSync(join(dir, 'xl/media', img.img))
      const mime = /\.png$/i.test(img.img) ? 'image/png' : 'image/jpeg'
      imageB64 = `data:${mime};base64,${bin.toString('base64')}`
    }

    // peças: linhas com REF numérica e código
    let n = 0
    for (const l of linhas) {
      if (l.n <= (cab ? cab.n : t.n) || l.n >= fim) continue
      const ref = (l.cells[0] || '').trim()
      const cod = (l.cells[1] || '').trim()
      if (!/^\d+[A-Z]?$/i.test(ref) || !cod) continue
      const en = (l.cells[2] || '').trim()
      const qtd = parseFloat(String(l.cells[3] || '').replace(',', '.'))
      const pt = (l.cells[4] || '').trim()
      pecas.push({
        figura_id: id, code: cod, name: pt || en, reference: ref,
        qtd: Number.isFinite(qtd) ? qtd : null, unit: null, compravel: true,
      })
      n++
    }

    figuras.push({ id, code, name: nome, secao: aba.nome, imageB64, hotspots: [], path: [] })
    nFig++
    console.log(`  ${String(i + 1).padStart(2)}. ${nome.slice(0, 40).padEnd(40)} ${String(n).padStart(3)} peças ${imageB64 ? '+img' : '(sem imagem)'}`)
  })
}

const out = { modelo: MODELO, modeloSlug: SLUG, marca: MARCA || undefined, fonte: 'xlsx', figuras, pecas }
const arq = `catalogo_${SLUG}.json`
writeFileSync(new URL(`../catalogos/${arq}`, import.meta.url), JSON.stringify(out))
rmSync(dir, { recursive: true, force: true })
console.log(`\n✅ ${MODELO}: ${figuras.length} figuras (${figuras.filter((f) => f.imageB64).length} c/img), ${pecas.length} peças -> ${arq}`)
