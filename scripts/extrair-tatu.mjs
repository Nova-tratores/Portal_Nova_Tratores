// Extrai o catálogo de peças da TATU / MARCHESAN (catalogo.marchesan.com.br).
//
// O site é uma ÁRVORE, não uma lista de figuras:
//   /CatPecas.dll/ListaItens?Codigo=XXXX  ->  a "folha" (imagem /LibImage/XXXX.jpg)
//                                             + a tabela de itens
//   Nas linhas: quando a coluna CÓDIGO está vazia e a DENOMINAÇÃO é um link,
//   aquilo é um CONJUNTO (dá pra descer). Quando tem código, é uma PEÇA — e ela
//   ainda pode ter folha própria (ex.: "MACACO COMPLETO"), então também descemos.
//
// Cada nó com imagem vira uma FIGURA; as peças da figura são as linhas com código.
// A SEÇÃO de uma figura é o conjunto de 1º nível de onde ela desceu (a raiz vira "GERAL").
// Não há hotspots: os números dos itens já vêm desenhados na imagem.
//
// Rodar:  node scripts/extrair-tatu.mjs <url ou código> [...]
//   ex:   node scripts/extrair-tatu.mjs "http://catalogo.marchesan.com.br/CatPecas.dll/ListaItens?Codigo=0501090780"
//         node scripts/extrair-tatu.mjs 0501090780
// Gera catalogos/catalogo_<slug>.json (mesmo formato do KUHN) -> importar com
//   node scripts/importar-catalogo.mjs catalogo_<slug>.json

import { writeFileSync } from 'node:fs'

const BASE = 'http://catalogo.marchesan.com.br'
const H = { 'User-Agent': 'Mozilla/5.0' }
const MAX_PROF = 8 // trava contra recursão infinita

const dec = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
const strip = (s) => dec(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A página é ISO-8859-1 (latin1) — se ler como utf8, os acentos viram lixo.
async function pagina(codigo) {
  const r = await fetch(`${BASE}/CatPecas.dll/ListaItens?Codigo=${codigo}`, { headers: H })
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${codigo}`)
  return Buffer.from(await r.arrayBuffer()).toString('latin1')
}

// Existe imagem da folha? (nem todo nó tem)
async function temImagem(codigo) {
  try {
    const r = await fetch(`${BASE}/LibImage/${codigo}.jpg`, { method: 'HEAD', headers: H })
    return r.ok && !/text\/html/i.test(r.headers.get('content-type') || '')
  } catch { return false }
}

function parsear(html, codigo) {
  const nome = strip((html.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '')
    .replace(new RegExp('\\s*-\\s*' + codigo + '\\s*$'), '').trim()
  const temFolha = new RegExp(`LibImage/${codigo}\\.jpg`, 'i').test(html)
  const tabela = (html.match(/<table[^>]*id="catitens"[\s\S]*?<\/table>/i) || [])[0] || ''

  const itens = []
  for (const linha of tabela.split(/<tr\b/i).slice(1)) {
    const celulas = [...linha.matchAll(/<td[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((m) => m[1])
    if (celulas.length < 3) continue
    const ref = strip(celulas[0])
    if (!/^\d+$/.test(ref)) continue // pula o cabeçalho
    const cod = (strip(celulas[1]).match(/\d{6,}/) || [])[0] || ''
    const den = strip(celulas[2])
    const qtdTxt = strip(celulas[3] || '')
    const qtd = /^\d+(?:[.,]\d+)?$/.test(qtdTxt) ? Number(qtdTxt.replace(',', '.')) : null
    // link (pra descer): pode estar na coluna do código OU na da denominação
    const filho = (linha.match(/ListaItens\?Codigo=(\d+)/) || [])[1] || ''
    itens.push({ ref, cod, nome: den, qtd, filho })
  }
  return { nome, temFolha, itens }
}

async function extrair(codigoRaiz) {
  const raiz = parsear(await pagina(codigoRaiz), codigoRaiz)
  const MODELO = raiz.nome || codigoRaiz
  const SLUG = slugify(MODELO)
  console.log(`\n=== ${MODELO} (${codigoRaiz}) ===`)

  const figuras = []
  const pecas = []
  const visitados = new Set()

  // fila: cada nó carrega a seção herdada (o conjunto de 1º nível)
  const fila = [{ codigo: codigoRaiz, nome: MODELO, secao: 'GERAL', prof: 0, dados: raiz, path: [] }]

  while (fila.length) {
    const no = fila.shift()
    if (visitados.has(no.codigo)) continue
    visitados.add(no.codigo)

    const d = no.dados || parsear(await pagina(no.codigo), no.codigo)
    if (!no.dados) await sleep(120)

    const comImagem = d.temFolha || (await temImagem(no.codigo))
    const id = `tatu-${SLUG}-${no.codigo}` // id único por modelo: conjuntos são compartilhados entre máquinas

    if (comImagem || d.itens.length) {
      figuras.push({
        id, code: no.codigo, name: no.nome || d.nome || no.codigo, secao: no.secao,
        imageUrl: comImagem ? `${BASE}/LibImage/${no.codigo}.jpg` : null,
        // A folha é a mesma em todas as máquinas que usam o conjunto (as variantes de
        // plantadeira repetem quase tudo). Guardar por código evita subir a mesma imagem
        // dezenas de vezes pro storage.
        imageKey: `tatu-${no.codigo}`,
        hotspots: [], path: no.path,
      })
      for (const it of d.itens) {
        if (!it.cod) continue // linha de conjunto: não é peça comprável
        pecas.push({ figura_id: id, code: it.cod, name: it.nome, reference: it.ref, qtd: it.qtd, unit: null, compravel: true })
      }
    }

    if (no.prof >= MAX_PROF) continue
    for (const it of d.itens) {
      if (!it.filho || visitados.has(it.filho)) continue
      // no 1º nível, cada filho abre uma seção nova; abaixo disso herda a do pai
      const secao = no.prof === 0 ? (it.nome || 'GERAL') : no.secao
      fila.push({ codigo: it.filho, nome: it.nome, secao, prof: no.prof + 1, path: [...no.path, no.codigo] })
    }
    if (figuras.length % 10 === 0) console.log(`  ${figuras.length} figuras, ${pecas.length} peças… (fila: ${fila.length})`)
  }

  const out = {
    modelo: MODELO, modeloSlug: SLUG, marca: 'Tatu Marchesan', fonte: 'marchesan',
    familia: FAMILIA || null, // linha de produto (PST DUO, KAPINA CITRUS…): agrupa as variantes
    root: codigoRaiz, figuras, pecas,
  }
  const arq = `catalogo_${SLUG}.json`
  writeFileSync(new URL(`../catalogos/${arq}`, import.meta.url), JSON.stringify(out))
  const comImg = figuras.filter((f) => f.imageUrl).length
  console.log(`  ✅ ${MODELO}: ${figuras.length} figuras (${comImg} c/img), ${pecas.length} peças -> ${arq}`)
  return arq
}

// --familia "PST DUO" -> todas as máquinas desta rodada entram na mesma linha de produto
const argv = process.argv.slice(2)
const iFam = argv.indexOf('--familia')
const FAMILIA = iFam >= 0 ? (argv[iFam + 1] || '').trim() : ''
const alvos = argv
  .filter((a, i) => i !== iFam && i !== iFam + 1)
  .map((a) => (a.match(/Codigo=(\d+)/) || [null, a])[1])
  .filter((a) => /^\d+$/.test(a || ''))
if (!alvos.length) { console.error('Passe a URL (ou o código) do produto no catálogo da Marchesan.'); process.exit(1) }
for (const c of alvos) {
  try { await extrair(c) } catch (e) { console.error(`  ✗ ${c}: ${e.message}`) }
}
console.log('\nFim.')
