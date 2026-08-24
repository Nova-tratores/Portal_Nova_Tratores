// Geração do HTML de impressão das ETIQUETAS DE PEÇAS (extraído da tela
// /ppv/etiquetas pra fila de rastreio /ppv/unidades reusar na reimpressão).
//
// UM motor pros dois papéis (unificado em 21/08/2026): a folha 3×10 (Pimaco/
// Avery 6180, Carta, 66,675×25,4mm) e o papel comum, que é a MESMA folha com
// `tracejado` (linha de corte na borda) — recorta em vez de descolar. O gerador
// antigo de papel comum tinha layout próprio de 2 colunas grandes e foi
// removido: o usuário quis as 3 colunas iguais às da etiqueta, e manter dois
// desenhos da mesma etiqueta só multiplicava o conserto de cada detalhe.
//
// Cada bloco pode levar QR de rastreio, Code 128, ou os DOIS (`barraComQr`):
// celular lê o QR e vai pra página da unidade; a pistola do balcão lê a barra
// e enxerga o código da peça.
//
// Layout da célula (correção 19/08/2026): cada bloco é dividido em CORPO (texto,
// que encolhe/corta se sobrar pouco espaço) + RODAPÉ (barcode, com espaço FIXO
// garantido). Antes o barcode ficava por último numa coluna de altura fixa com
// overflow:hidden, então descrição de 2 linhas EMPURRAVA e CORTAVA o barcode —
// era por isso que a altura do código de barras variava com o nº de linhas.

export interface LinhaEtiqueta {
  empresa: string
  codigo: string
  descricao: string
  locacao: string
}

export interface BlocoEtiqueta {
  linhas: LinhaEtiqueta[]
  /** SVG do QR de rastreio (montado por qrSvg) — presente = unidade rastreada */
  qrSvg?: string | null
  /** número legível da unidade (UN-000123), impresso sob o QR */
  numero?: string | null
}

/** Tetos do ajuste automático de fonte (pt): acima disso o texto fica grande
 *  demais pro barcode e pra locação respirarem. A dupla divide a altura em
 *  duas, então o teto dela é bem menor. */
const MAX_PT_LINHA = 14
const MAX_PT_DUPLA = 7
/** Altura da barra na etiqueta única: valor de partida e teto do ajuste (mm). */
const ALTURA_BARRA_MM = 5.6
const MAX_BARRA_MM = 9

export interface OpcoesFolha {
  /** Deslocamento fino (mm) da folha p/ calibrar impressoras que puxam torto.
   *  x>0 empurra p/ direita, y>0 empurra p/ baixo. Mantém o tamanho das etiquetas
   *  (só realoca as margens), então não estraga o casamento com a folha pré-cortada. */
  x?: number
  y?: number
  /** Imprime o tracejado de corte na BORDA de cada etiqueta (papel comum).
   *  Na folha adesiva não se usa: ela já vem picotada, e a linha impressa cairia
   *  em cima do vinco (ou, com a impressora puxando torto, dentro da etiqueta). */
  tracejado?: boolean
  /** Etiqueta rastreada com os DOIS códigos: QR (celular → página da unidade)
   *  e Code 128 (pistola do balcão → código da peça). Sem isto o QR entra no
   *  lugar do barcode, e a etiqueta rastreada não serve pro leitor do balcão. */
  barraComQr?: boolean
}
/** @deprecated nome de quando a opção era só o offset — use OpcoesFolha. */
export type OffsetFolha = OpcoesFolha

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Empresa abreviada na etiqueta (2 letras) — libera largura p/ o código caber
// inteiro. Aplicado no RENDER (não na origem) p/ valer também nas reimpressões
// do histórico (snapshots antigos guardam o nome por extenso).
export function empresaCurta(nome: string): string {
  const s = String(nome || '').trim().toUpperCase()
  if (/NOVA/.test(s)) return 'NO'
  if (/CASTRO/.test(s)) return 'CA'
  return s.replace(/[^A-Z0-9]/g, '').slice(0, 2) || s.slice(0, 2)
}

// Tamanho (pt) do TEXTO CORRIDO da etiqueta (código + descrição + locação numa
// frase só, layout do papel de recorte trazido pra folha adesiva em 21/08/2026).
// Escala pelo TOTAL de caracteres: texto curto sai grande e legível, texto longo
// encolhe até caber nas 3 linhas — em vez de cortar no "…". `dupla` = 2 empresas
// na mesma etiqueta (metade da altura pra cada uma).
export function fonteLinha(len: number, dupla: boolean): number {
  // PISO seguro: tamanho que cabe mesmo sem Arial Narrow instalada e sem o
  // ajuste do navegador rodar. Em cima disso, o script `ajustarFontes` cresce
  // cada etiqueta até encostar no espaço real que ela tem (etiqueta única) —
  // por isso aqui a escala é conservadora de propósito.
  let pt = len <= 60 ? 9 : len <= 85 ? 8.2 : len <= 110 ? 7.4 : len <= 140 ? 6.6 : 6
  if (dupla) pt = Math.max(5, +(pt * 0.78).toFixed(1))
  return pt
}

// Mantida por compatibilidade com quem importar (o layout novo usa fonteLinha).
export function fonteCodigo(len: number, dupla: boolean): number {
  let pt = len <= 12 ? 13 : len <= 15 ? 11.5 : len <= 18 ? 10 : 8.5
  if (dupla) pt = Math.max(7, +(pt * 0.8).toFixed(1))
  return pt
}

// Locação com o VALOR em NEGRITO: "PRATELEIRA 3 · ANDAR A · CAIXA 01" mantém os
// rótulos normais e destaca o número/letra (3 / A / 01). Devolve HTML (não
// re-escapar). Cada trecho separado por "·" vira "RÓTULO <strong>VALOR</strong>".
export function locHtml(loc: string): string {
  return String(loc || '').split('·').map(seg => {
    const s = seg.trim()
    if (!s) return ''
    const m = s.match(/^(\S+)\s+(.+)$/)
    return m ? `${esc(m[1])} <strong>${esc(m[2])}</strong>` : esc(s)
  }).filter(Boolean).join(' · ')
}

// ── Código de barras Code 128 (subset B) em SVG puro, sem lib externa ───────
// Tabela padrão: larguras de barra/espaço de cada símbolo (0-106).
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

// Largura FIXA de cada módulo (mm). Constante → todo barcode tem a MESMA
// densidade de barra (antes era esticado p/ 94% da célula, então SKU curto
// saía com barra grossa e SKU longo com barra fina). ~0,33mm é confortável p/
// leitor de balcão; `max-width:100%` (no CSS) só comprime um SKU muito longo.
const MODULO_MM = 0.33
// Quiet zone: o Code 128 exige ~10 módulos claros de cada lado pro leitor achar
// início/fim. Ela NÃO precisa ser desenhada dentro do SVG — quem a fornece é o
// branco da própria etiqueta: o barcode fica centrado dentro da área de
// segurança, com 3,4mm livres de cada lado (>10 módulos de 0,33mm). Desenhar
// mais 10 módulos aqui dentro só roubava largura útil e obrigava a espremer as
// barras. Ficam 2 módulos como folga contra corte de impressão.
const QUIET = 2

// Símbolos de controle do Code 128
const START_B = 104, START_C = 105, SWITCH_B = 100, SWITCH_C = 99, STOP = 106

/**
 * Code words do texto usando os subsets B e C misturados.
 *
 * O subset C codifica DOIS dígitos num símbolo só — num código tipo
 * "RP-007702018C91" isso derruba a barra em ~25%. Antes era tudo em B, e a
 * barra saía mais larga que a etiqueta: o `max-width` espremia as barras
 * (módulo fino demais, leitor sofrendo). Com C a barra CABE no tamanho cheio.
 *
 * Regra da troca: entra em C quando aparecem 6+ dígitos seguidos (ou 4+ se
 * forem o fim do código), sempre em quantidade par — dígito ímpar sai em B
 * antes da troca. Exportado pra poder testar a leitura de volta.
 */
export function codewords128(texto: string): number[] {
  const t = String(texto).replace(/[^\x20-\x7E]/g, '').slice(0, 40)
  if (!t) return []
  const out: number[] = []
  let i = 0
  const digitosIniciais = (t.match(/^\d+/) || [''])[0].length
  // começa em C se o código abre com bloco numérico longo (ou é só dígitos)
  let modo: 'B' | 'C' = (digitosIniciais >= 4 && digitosIniciais % 2 === 0) || (digitosIniciais === t.length && t.length % 2 === 0 && t.length >= 2)
    ? 'C' : 'B'
  out.push(modo === 'C' ? START_C : START_B)

  while (i < t.length) {
    if (modo === 'C') {
      if (/^\d\d/.test(t.slice(i))) { out.push(Number(t.slice(i, i + 2))); i += 2; continue }
      out.push(SWITCH_B); modo = 'B'; continue // acabaram os pares
    }
    const run = (t.slice(i).match(/^\d+/) || [''])[0].length
    const valeC = run >= 6 || (run >= 4 && i + run === t.length)
    if (valeC) {
      if (run % 2 === 1) { out.push(t.charCodeAt(i) - 32); i += 1 } // alinha o par
      out.push(SWITCH_C); modo = 'C'; continue
    }
    out.push(t.charCodeAt(i) - 32); i += 1
  }

  let soma = out[0] // start tem peso 1
  for (let k = 1; k < out.length; k++) soma += out[k] * k
  out.push(soma % 103, STOP)
  return out
}

// Gera o SVG do Code 128 do texto (só ASCII imprimível; vazio = sem barra).
export function code128Svg(texto: string, alturaMm: number): string {
  const codes = codewords128(texto)
  if (codes.length === 0) return ''
  let x = QUIET
  const rects: string[] = []
  for (const code of codes) {
    const padrao = C128[code]
    for (let i = 0; i < padrao.length; i++) {
      const w = Number(padrao[i])
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="10"/>`) // índice par = barra
      x += w
    }
  }
  const modulos = x + QUIET // largura total (com quiet zone dos dois lados)
  const larguraMm = (modulos * MODULO_MM).toFixed(2)
  // width proporcional aos módulos (densidade constante); preserveAspectRatio
  // none só escala a ALTURA (irrelevante p/ 1D). max-width vem do CSS.
  return `<svg class="barra" viewBox="0 0 ${modulos} 10" preserveAspectRatio="none" style="height:${alturaMm}mm;width:${larguraMm}mm" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`
}

/**
 * QR em SVG de RETÂNGULOS PREENCHIDOS, a partir da matriz da lib `qrcode`
 * (`QRCode.create(texto).modules`).
 *
 * A lib desenha cada fileira de módulos como um TRAÇO (`stroke`) de espessura
 * 1, e no papel isso sai LAVADO: a impressora rasteriza linha fina como
 * hairline/antialias e o QR fica cinza — enquanto o Code 128, que sempre foi
 * `rect` preenchido, sai preto sólido na MESMA folha e na mesma impressora.
 * Fill não tem esse problema. Na tela a diferença não aparece, por isso o
 * visual enganava.
 *
 * Junta módulos escuros vizinhos numa tirada só (menos nós → HTML bem menor
 * numa folha de 30 etiquetas).
 */
export function qrSvg(modules: { size: number; data: ArrayLike<number> } | null | undefined): string {
  const n = modules?.size || 0
  if (!n || !modules) return ''
  const partes: string[] = []
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!modules.data[y * n + x]) { x++; continue }
      let w = 1
      while (x + w < n && modules.data[y * n + x + w]) w++
      partes.push(`M${x} ${y}h${w}v1h-${w}z`)
      x += w
    }
  }
  if (partes.length === 0) return ''
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="${partes.join('')}"/></svg>`
}

function dataRefAtual(): string {
  const agora = new Date()
  return `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`
}

// Blocos de UMA etiqueta, no layout do papel de recorte (o que o usuário
// aprovou em 21/08/2026): EMPRESA numa linha e, embaixo, uma FRASE corrida
// "CÓDIGO - DESCRIÇÃO - PRATELEIRA 4 · ANDAR A · CAIXA 01" alinhada à esquerda,
// com o barcode centrado no rodapé. Aproveita muito melhor a largura da
// etiqueta do que o formato centralizado em 3 blocos (código/descrição/locação),
// que estourava a altura e obrigava a cortar a descrição.
//
// .corpo encolhe/corta se faltar espaço; .rodape (barcode) tem espaço FIXO —
// nunca é empurrado pra fora. `comBarra` = etiqueta comum (a rastreada leva QR).
function blocosTexto(e: BlocoEtiqueta, comBarra: boolean): string {
  const dupla = e.linhas.length > 1
  return e.linhas.map(l => {
    const desc = String(l.descricao || '').trim()
    const loc = String(l.locacao || '').trim()
    // tamanho pelo texto INTEIRO da frase (é ele que decide quantas linhas dá)
    const total = String(l.codigo).length + desc.length + loc.length
    // separador leve entre as partes (cinza) — a frase respira sem virar
    // uma parede de texto preto
    const sep = '<span class="sep">·</span>'
    const partes = [`<span class="cod">${esc(l.codigo)}</span>`]
    if (desc) partes.push(`<span class="desc">${esc(desc)}</span>`)
    if (loc) partes.push(`<span class="loc">${locHtml(loc)}</span>`)
    return `      <div class="bloco">
        <div class="corpo">
          <div class="emp">${esc(empresaCurta(l.empresa))}</div>
          <div class="linha" style="font-size:${fonteLinha(total, dupla)}pt">${partes.join(sep)}</div>
        </div>${comBarra ? `
        <div class="rodape">${code128Svg(l.codigo, dupla ? 3 : ALTURA_BARRA_MM)}</div>` : ''}
      </div>`
  }).join('\n')
}

// ── Impressão em FOLHA ADESIVA pré-cortada 3×10 (Pimaco/Avery 6180) ─────────
// Geometria EXATA do padrão US Letter / Avery 5160·6180 (o mesmo do papel
// "Carta 216×279mm" da impressora): página 215,9×279,4mm · margem 12,7mm topo/base
// e 4,76mm laterais · 3,175mm entre colunas, 0 entre linhas → etiqueta 66,675mm ×
// 25,4mm (1 pol). Antes usávamos 215×280 / 25,5mm (medida à mão); a diferença
// altura-página (280 vs 279) fazia o Chrome "ajustar pra caber" e ENCOLHER a folha,
// acumulando desalinhamento linha a linha. Casando com Carta, imprime 1:1 (Escala 100%).
// `usadas` = posições (0-29) da 1ª folha já descoladas — saem em branco.
// `off` = calibração fina + tracejado de corte, ver OpcoesFolha.
export function htmlFolha(blocos: BlocoEtiqueta[], usadas: Set<number>, off: OpcoesFolha = {}): string {
  const paginas: (BlocoEtiqueta | null)[][] = []
  const fila = [...blocos]
  let primeira = true
  while (fila.length > 0) {
    const celulas: (BlocoEtiqueta | null)[] = []
    for (let p = 0; p < 30; p++) {
      if (primeira && usadas.has(p)) { celulas.push(null); continue }
      celulas.push(fila.shift() ?? null)
    }
    paginas.push(celulas)
    primeira = false
  }
  const dataRef = dataRefAtual()
  // No papel comum não existe picote pra casar: as 3 colunas se encostam (uma
  // tesourada vertical serve às duas vizinhas) e os 6,35mm do vão viram MARGEM.
  // Isso tira o tracejado das colunas da ponta da faixa que quase nenhuma
  // impressora imprime (~5mm da borda) — senão a linha de corte sumia justo
  // onde ela é necessária. A etiqueta continua 66,675×25,4mm nos dois modos.
  const vaoCol = off.tracejado ? 0 : 3.175
  const ladoBase = off.tracejado ? 7.93 : 4.76
  // Deslocamento da folha inteira por TRANSLATE, não por margem: mexer no
  // padding limitava a correção ao tamanho da própria margem (12,7mm), e
  // padding negativo é CSS inválido — derrubaria o shorthand inteiro e
  // estouraria o layout. Impressora que joga a página 12mm pra baixo precisa
  // de -12mm, ou seja, EXATAMENTE o limite que a margem não alcançava.
  // Translate não tem esse teto e não mexe no tamanho da etiqueta.
  const ox = Math.max(-15, Math.min(15, off.x || 0))
  const oy = Math.max(-25, Math.min(25, off.y || 0))
  const desloc = ox || oy ? `transform: translate(${ox}mm, ${oy}mm);` : ''
  const padTop = '12.70', padBot = '12.70'
  const padLeft = ladoBase.toFixed(2), padRight = ladoBase.toFixed(2)

  const barraComQr = !!off.barraComQr
  const cel = (e: BlocoEtiqueta | null) => {
    if (e === null) return '    <div class="cel"></div>'
    const dupla = e.linhas.length > 1
    const comQr = !!e.qrSvg
    if (!comQr) {
      return `    <div class="cel${dupla ? ' dupla' : ''}">
${blocosTexto(e, true)}
      <div class="dt">${dataRef}</div>
    </div>`
    }
    // Rastreada com os DOIS códigos: a barra atravessa a etiqueta INTEIRA em
    // baixo e o topo é dividido entre texto e QR. Tentar espremer a barra na
    // coluna do texto (ao lado do QR) derrubava o módulo do código mais longo
    // pra 0,23mm, abaixo do piso de leitura de 0,25mm — o teste pega isso.
    // Aqui ela fica com os mesmos 59,9mm da etiqueta comum.
    if (barraComQr) {
      return `    <div class="cel comqr combarra${dupla ? ' dupla' : ''}">
      <div class="topo">
        <div class="txt">
${blocosTexto(e, false)}
        </div>
        <div class="qr">
          ${e.qrSvg}${e.numero ? `
          <div class="un">${esc(e.numero)}</div>` : ''}
          <div class="dt inline">${dataRef}</div>
        </div>
      </div>
${e.linhas.map(l => `      <div class="rodape">${code128Svg(l.codigo, dupla ? 3 : ALTURA_BARRA_MM)}</div>`).join('\n')}
    </div>`
    }
    // Só QR (ele substitui a barra): texto à esquerda, QR à direita. A data sai
    // do canto absoluto e vai pra baixo do QR, junto do número da unidade.
    return `    <div class="cel comqr${dupla ? ' dupla' : ''}">
      <div class="txt">
${blocosTexto(e, false)}
      </div>
      <div class="qr">
        ${e.qrSvg}${e.numero ? `
        <div class="un">${esc(e.numero)}</div>` : ''}
        <div class="dt inline">${dataRef}</div>
      </div>
    </div>`
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças (folha 3×10)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 215.9mm 279.4mm; margin: 0; }
  /* Tipografia da etiqueta: CONDENSADA (Arial Narrow e equivalentes) — mesma
     altura de letra ocupando menos largura, então o texto sai maior e continua
     cabendo. font-stretch cobre as fontes variáveis; Arial é o fallback seguro
     de qualquer máquina/impressora. */
  body {
    font-family: 'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue Condensed', Arial, Helvetica, sans-serif;
    font-stretch: semi-condensed;
    -webkit-font-smoothing: antialiased;
  }
  .pagina {
    position: relative;
    width: 215.9mm; height: 279.4mm; padding: ${padTop}mm ${padRight}mm ${padBot}mm ${padLeft}mm;
    ${desloc}
    display: grid; grid-template-columns: repeat(3, 66.675mm);
    grid-auto-rows: 25.4mm; column-gap: ${vaoCol}mm; row-gap: 0;
    page-break-after: always;
  }
  .pagina:last-child { page-break-after: auto; }
  /* RÉGUA DE 100mm na margem de baixo (só no papel comum, onde não custa
     adesivo). É o que separa as duas causas de desalinhamento: se a régua
     impressa medir 100mm, a impressora está em 1:1 e o problema é só
     deslocamento (resolve no ajuste fino); se medir menos — 97,3mm é o que dá
     quando o papel está em A4 —, a impressora está REDUZINDO a folha, e aí
     nenhum ajuste resolve: o erro cresce a cada linha. Feita de BORDAS porque
     borda imprime mesmo com "gráficos de fundo" desligado. */
  .regua { position: absolute; left: ${ladoBase}mm; bottom: 3.6mm; display: flex; align-items: flex-end; gap: 2.5mm; }
  .regua .tiques { display: flex; width: 100mm; height: 2.6mm; border: 0.3mm solid #111; border-top: none; }
  .regua i { flex: 1 1 0; border-left: 0.3mm solid #111; }
  .regua i:first-child { border-left: none; }
  .regua b { font: 700 6pt/1 Arial, sans-serif; color: #111; }
  .regua u { font: 400 6pt/1 Arial, sans-serif; color: #555; text-decoration: none; }
  /* ÁREA DE SEGURANÇA (margem de erro de impressão): o conteúdo respira 2,6mm
     do corte de cima, 2,4mm de baixo e 3,4mm das laterais — folha entrando
     torta ou impressora puxando o papel alguns milímetros continua imprimindo
     DENTRO da etiqueta, sem cortar texto nem barra. overflow:hidden garante
     que nada invada a etiqueta vizinha. */
  .cel {
    position: relative; overflow: hidden; padding: 2.6mm 3.4mm 2.4mm; text-align: left;
    display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
  }
  /* bloco = corpo (texto corrido, ocupa o espaço que sobra) + rodapé (barcode,
     espaço garantido). .corpo com flex:1 é o que dá ao ajuste de fonte uma
     ALTURA REAL pra medir (clientHeight = espaço livre da etiqueta). */
  .bloco { width: 100%; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .dupla .bloco + .bloco { margin-top: 0.6mm; }
  /* conteúdo centrado na vertical: o que sobra vira respiro em cima E embaixo,
     em vez de um buraco entre o texto e o código de barras */
  .corpo { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
  .rodape { flex: 0 0 auto; width: 100%; }
  /* empresa: caixa-alta espaçada, cinza — identifica sem competir com o código */
  .emp { font-size: 6pt; font-weight: 700; letter-spacing: 1.1px; line-height: 1; color: #666; }
  .dupla .emp { font-size: 5pt; letter-spacing: .8px; }
  /* frase corrida: CÓDIGO · DESCRIÇÃO · LOCAÇÃO (corpo vem do fonteLinha) */
  .linha {
    line-height: 1.22; margin-top: 0.5mm; overflow: hidden; color: #111;
    display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical;
  }
  .dupla .linha { -webkit-line-clamp: 2; margin-top: 0.2mm; }
  /* código: monoespaçada de verdade (Consolas/DejaVu) — 0 vs O e 1 vs I sem
     dúvida na hora de conferir a peça. Courier New só como último recurso. */
  .cod {
    font-family: Consolas, 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace;
    font-stretch: normal; font-weight: 700; font-size: 1.06em; letter-spacing: -.1px; color: #000;
    /* NUNCA quebrar o código no meio: "RP-005555207R1" partia no hífen e virava
       "RP-" numa linha e o resto na outra — quem confere a peça lê errado. Se
       não couber na largura, quem cede é a FONTE (o ajuste abaixo mede a
       largura também e encolhe até o código caber inteiro numa linha). */
    white-space: nowrap;
  }
  .desc { font-weight: 600; }
  .loc { color: #444; }
  .linha .loc strong { font-weight: 700; color: #000; }
  .sep { color: #aaa; font-weight: 400; margin: 0 .28em; }
  .barra { display: block; margin: 0.7mm auto 0; max-width: 100%; }
  .dupla .barra { margin: 0.35mm auto 0; }
  /* data discreta no canto inferior direito (fora do fluxo, como no recorte) —
     recuada junto com a área de segurança */
  .dt { position: absolute; bottom: 1.2mm; right: 3.2mm; font-size: 4.8pt; color: #999; letter-spacing: .2px; line-height: 1; }
  /* na etiqueta rastreada a data entra no fluxo, sob o QR (ver comentário no
     cel(): no canto ela encavalaria o barcode quando os dois códigos convivem) */
  .dt.inline { position: static; margin-top: 0.3mm; text-align: center; }
  /* Rastreada: texto corrido à esquerda + QR fixo à direita (sem Code 128).
     o "align-items: stretch" é OBRIGATÓRIO: com "center" a coluna de texto ficava
     com altura automática, e aí o .bloco (flex-basis 0) colapsava pra ZERO —
     o overflow:hidden do corpo apagava o texto inteiro e a etiqueta saía só com
     o QR. Quem centraliza na vertical é o .txt/.qr, cada um dentro da sua
     coluna já esticada. */
  /* gap = ZONA DE SILÊNCIO do QR (o padrão pede 4 módulos claros em volta):
     2mm > 4 × 0,35mm do módulo de um QR de 13mm. Do outro lado quem fornece é
     a área de segurança da etiqueta. */
  .cel.comqr { flex-direction: row; align-items: stretch; gap: 2mm; }
  .cel.comqr .txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .cel.comqr .bloco { justify-content: center; }
  /* QR + barcode: topo (texto | QR) em cima, barra de ponta a ponta embaixo.
     O .topo tem altura DEFINIDA (flex do que sobra depois da barra), que é o
     que o ajuste de fonte mede — por isso o texto nunca invade o barcode. */
  .cel.comqr.combarra { flex-direction: column; gap: 0; }
  .cel.comqr.combarra .topo { flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: stretch; gap: 2mm; }
  /* clamp ALTO de propósito: ele é só a rede de segurança. Quem decide o
     tamanho é o ajuste de fonte, que ENCOLHE até caber — com clamp baixo o
     texto era cortado no "…" (a locação sumia) antes de a fonte tentar. */
  .cel.comqr .linha { -webkit-line-clamp: 5; }
  .cel.comqr.dupla .linha { -webkit-line-clamp: 2; }
  .qr { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr svg { width: 13mm; height: 13mm; display: block; }
  .dupla .qr svg { width: 12mm; height: 12mm; }
  .un { font-size: 5pt; color: #555; margin-top: 0.2mm; letter-spacing: .2px; }
  /* TRACEJADO DE CORTE (papel comum, body.cortar): linha na borda EXTERNA de
     cada etiqueta, pra recortar com tesoura. Vai num ::before com border de
     verdade — o tracejado da prévia é um "outline" dentro de @media screen e por
     isso NUNCA saía no papel; e border imprime mesmo com "gráficos de fundo"
     desligado no diálogo de impressão (background/box-shadow não). Só nas
     células com conteúdo: não faz sentido recortar etiqueta em branco. */
  body.cortar .cel:not(:empty)::before {
    content: ''; position: absolute; pointer-events: none;
    top: 0; right: 0; bottom: 0; left: 0;
    border: 1px dashed #9ca3af;
  }
  /* lembrete das opções do diálogo de impressão: é o que mais desalinha folha
     pré-cortada (papel A4 com folha Carta = o Chrome encolhe 2,7% e centraliza,
     empurrando tudo ~12,6mm pra baixo). Só na tela — nunca no papel. */
  .dica { display: none; }
  @media screen {
    body { background: #e5e7eb; }
    .dica {
      display: block; max-width: 215.9mm; margin: 10px auto -4px; padding: 9px 12px;
      background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px;
      font: 700 12px/1.5 -apple-system, 'Segoe UI', Arial, sans-serif; color: #7c2d12;
    }
    .dica span { font-weight: 400; }
    .pagina { background: #fff; margin: 10px auto; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
    /* tracejado = corte da etiqueta física (só guia de tela; o que sai no papel
       é o body.cortar acima, quando o usuário pede papel comum) */
    .cel { outline: 1px dashed #d1d5db; }
    /* guia AZUL = área de segurança (só na tela): tudo que a impressora pode
       deslocar sem cortar conteúdo. Não aparece no papel. */
    .cel:not(:empty)::after {
      content: ''; position: absolute; pointer-events: none;
      top: 2.6mm; bottom: 2.4mm; left: 3.4mm; right: 3.4mm;
      outline: 0.5px dotted rgba(37, 99, 235, .35);
    }
  }
</style></head><body${off.tracejado ? ' class="cortar"' : ''}>
<div class="dica">No diálogo de impressão: Papel = <u>Carta</u> · Margens = <u>Nenhuma</u> · Escala = <u>100%</u>
  <span>— com papel A4 a folha sai 2,7% menor e ~12,6mm mais baixa, e o texto cai na etiqueta de baixo.</span></div>
${paginas.map(cels => `  <div class="pagina">
${cels.map(cel).join('\n')}${off.tracejado ? `
    <div class="regua"><span class="tiques">${'<i></i>'.repeat(10)}</span><b>100 mm</b><u>meça com régua: menos que isso = a impressora está reduzindo a folha</u></div>` : ''}
  </div>`).join('\n')}
<script>
// AJUSTE FINO DA FONTE: o servidor manda um tamanho de partida e aqui o
// navegador MEDE cada etiqueta e acerta o tamanho nos DOIS sentidos — diminui
// se o texto não coube, cresce enquanto sobrar espaço. Assim cada peça sai na
// maior fonte que cabe (em vez de todas no menor denominador comum) e nenhuma
// sai cortada. A medida é contra o .bloco, que tem altura FIXA (a da etiqueta);
// medir contra o texto não serve, porque ele cresce junto.
function ajustarFontes() {
  document.querySelectorAll('.bloco').forEach(function (bloco) {
    var linha = bloco.querySelector('.linha');
    if (!linha) return;
    var emp = bloco.querySelector('.emp');
    var rodape = bloco.querySelector('.rodape');
    var dupla = !!bloco.closest('.cel.dupla');
    var teto = dupla ? ${MAX_PT_DUPLA} : ${MAX_PT_LINHA};
    var piso = 4.4;
    // Espaço que sobra pro texto = altura da etiqueta − empresa − barcode − folga.
    // Cálculo EXPLÍCITO em vez de detectar transbordo: com o conteúdo centrado,
    // o que vaza pra cima não aparece no scrollHeight e a medição mentia (ora
    // deixava crescer até cortar, ora travava cedo deixando espaço morto).
    var espaco = function () {
      var h = bloco.clientHeight;
      if (emp) h -= emp.offsetHeight;
      if (rodape) h -= rodape.offsetHeight;
      return h - 3; // folga: margem do texto + arredondamento de impressão
    };
    // Altura E largura: o código não quebra (white-space:nowrap), então numa
    // etiqueta de texto curto a fonte podia crescer até o código vazar pela
    // lateral — e overflow:hidden cortaria justamente o que mais importa.
    var cabe = function () {
      return linha.scrollHeight <= espaco() && linha.scrollWidth <= linha.clientWidth + 1;
    };

    // Busca BINÁRIA do maior valor que cabe (texto mais alto = cabe menos, a
    // relação é monotônica). Linear custaria centenas de recálculos de layout
    // por folha e travaria a janela de impressão; assim são ~7.
    var maiorQueCabe = function (lo, hi, passo, aplicar) {
      var best = lo;
      aplicar(lo);
      if (!cabe()) return null;            // nem o mínimo cabe
      for (var k = 0; k < 8 && hi - lo > passo; k++) {
        var mid = Math.round(((lo + hi) / 2) / passo) * passo;
        mid = Math.round(mid * 100) / 100;
        if (mid <= lo || mid >= hi) break;
        aplicar(mid);
        if (cabe()) { best = mid; lo = mid; } else { hi = mid; }
      }
      aplicar(best);
      return best;
    };

    // 1) fonte: maior tamanho que cabe (encolhe abaixo do piso se precisar)
    var aplicarPt = function (v) { linha.style.fontSize = v + 'pt'; };
    if (maiorQueCabe(piso, teto, 0.25, aplicarPt) === null) {
      // nem no piso coube: desce em degraus até caber (texto muito longo)
      var pt = piso;
      for (var d = 0; d < 12 && !cabe() && pt > 3.6; d++) {
        pt = Math.round((pt - 0.3) * 100) / 100;
        aplicarPt(pt);
      }
    }

    // 2) o que ainda sobrar vai pra ALTURA DA BARRA. O texto só cresce em
    // degraus (uma linha a mais ou nada), então quase sempre fica um resto —
    // e barra mais alta é barra mais fácil de ler de qualquer ângulo.
    var svg = rodape && rodape.querySelector('svg');
    if (svg && !dupla && cabe()) {
      maiorQueCabe(${ALTURA_BARRA_MM}, ${MAX_BARRA_MM}, 0.2, function (v) { svg.style.height = v + 'mm'; });
    }
  });
}
window.addEventListener('load', function () {
  ajustarFontes();
  // #previa (usado na conferência de layout) abre sem chamar a impressão
  if (location.hash.indexOf('previa') === -1) window.print();
});
</script>
</body></html>`
}
