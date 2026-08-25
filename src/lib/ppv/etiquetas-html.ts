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

/** Tetos do ajuste automático de fonte (pt).
 *
 *  A etiqueta tem duas zonas com objetivos opostos: a LOCAÇÃO precisa ser lida
 *  do outro lado do corredor (teto alto), e os DADOS só são conferidos com a
 *  peça na mão (teto baixo, pra não roubar espaço de quem importa mais).
 *  A dupla divide tudo entre duas empresas, então cede nos dois. */
const MAX_PT_DADOS = 10
const MAX_PT_LOC = 34
const MAX_PT_DUPLA = 7.5
const MAX_PT_LOC_DUPLA = 18
/** Altura da barra na etiqueta única (mm), quando o código de barras está
 *  ligado. Fixa: a sobra de altura agora vira TEXTO MAIOR, que é o que o balcão
 *  precisa — antes ela era gasta engordando a barra. */
const ALTURA_BARRA_MM = 5.6

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
  /** Imprime TAMBÉM o código de barras Code 128 (padrão: NÃO).
   *
   *  Desligado desde 25/08/2026 a pedido do balcão: a barra comia até 9mm dos
   *  20,4mm úteis da etiqueta e o texto ficava pequeno demais pra ler. O QR faz
   *  o papel dela ocupando um canto.
   *
   *  ⚠ Só religue sabendo que pistola 1D (laser comum) lê barra e NÃO lê QR —
   *  se a leitura do balcão for por pistola dessas, a barra é a única que serve.
   *  O encoder Code 128 continua testado e pronto justamente por isso. */
  comBarra?: boolean
  /** Papel SELECIONADO NA IMPRESSORA (não o tamanho da folha adesiva, que é
   *  sempre Carta). Com 'a4' a página sai 210×297 e a impressora não precisa
   *  encaixar nada — é o que evita o encolhimento de 2,7%. Default: carta. */
  papel?: 'carta' | 'a4'
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

// Os tamanhos de fonte não são mais calculados no servidor: cada zona é medida
// e ajustada no navegador (ajustarFontes), porque só lá se sabe quanto o texto
// realmente ocupa. O que o servidor manda é um PISO conservador no CSS
// (.dados / .loc-grande), pra etiqueta sair legível mesmo se o script não rodar.

// Locação com o VALOR em NEGRITO: "PRATELEIRA 3 · ANDAR A · CAIXA 01" mantém os
// rótulos normais e destaca o número/letra (3 / A / 01). Devolve HTML (não
// re-escapar).
//
// Cada trecho vai num <span class="seg"> que NÃO QUEBRA por dentro: "CAIXA" e
// "04" precisam ficar na mesma linha. Quando quebravam, a etiqueta parecia
// cortada — o número órfão na linha de baixo não se lê como parte do endereço.
// A quebra acontece ENTRE os trechos, no separador, que leva espaços de verdade
// em volta justamente pra oferecer esse ponto de quebra.
export function locHtml(loc: string): string {
  return String(loc || '').split('·').map(seg => {
    const s = seg.trim()
    if (!s) return ''
    const m = s.match(/^(\S+)\s+(.+)$/)
    const html = m ? `${esc(m[1])} <strong>${esc(m[2])}</strong>` : esc(s)
    return `<span class="seg">${html}</span>`
  }).filter(Boolean).join(' <span class="sep">·</span> ')
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
/**
 * URL da unidade EM MAIÚSCULAS, de propósito.
 *
 * O QR tem um modo "alfanumérico" que empacota 2 caracteres a cada 11 bits, mas
 * ele só aceita A-Z, 0-9 e alguns símbolos — uma única minúscula joga a string
 * inteira pro modo byte, com 8 bits por caractere. Só de subir a caixa, o QR
 * desta URL cai de 37 pra 33 módulos, o que faz cada módulo passar de 0,26 pra
 * 0,30mm no mesmo espaço físico. É a diferença entre ler e não ler.
 *
 * Seguro nos dois lados: esquema e domínio são case-insensitive por definição,
 * e a rota /p/[id] valida o UUID com regex /i e compara com coluna `uuid` do
 * Postgres, que também ignora a caixa.
 */
export function urlDaUnidade(origem: string, unidadeId: string): string {
  return `${origem}/p/${unidadeId}`.toUpperCase()
}

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

// ── Conteúdo da etiqueta em DUAS ZONAS (desenho do usuário, 25/08/2026) ─────
//
//   ┌───────────────────────────────┬──────┐
//   │ CÓDIGO · DESCRIÇÃO   (menor)  │ NO   │  ← sigla e data empilhadas à
//   │                               │08/26 │    direita: matam duas linhas
//   ├───────────────────────────────┴──────┤
//   │ PRATELEIRA 8 · ANDAR A      (ENORME) │  ← é o que se lê de longe
//   └──────────────────────────────────────┘
//
// A locação ganhou zona própria porque é ela que a pessoa procura atravessando
// o corredor; código e descrição só importam depois, com a peça na mão. Antes
// tudo dividia a mesma frase corrida e a locação herdava o tamanho do conjunto.
//
// Os espaços em volta do separador NÃO são decoração: sem eles o navegador lê
// "RP-006517047Y1·BOMBA" como uma palavra só de 20 caracteres (o ponto médio
// não é ponto de quebra), a linha não quebra, transborda, e o ajuste de fonte
// trava pequeno pra não estourar a largura.
const SEP = ' <span class="sep">·</span> '

function zonaDados(e: BlocoEtiqueta): string {
  const dupla = e.linhas.length > 1
  return e.linhas.map(l => {
    const desc = String(l.descricao || '').trim()
    const partes = [`<span class="cod">${esc(l.codigo)}</span>`]
    if (desc) partes.push(`<span class="desc">${esc(desc)}</span>`)
    // na dupla a sigla vem junto da linha (são empresas diferentes); na simples
    // ela sobe pra coluna da direita, junto da data
    const sigla = dupla ? `<span class="emp-inline">${esc(empresaCurta(l.empresa))}</span> ` : ''
    return `        <div class="linha-dados">${sigla}${partes.join(SEP)}</div>`
  }).join('\n')
}

/** Locação exibida: iguais entre as empresas viram UMA; diferentes, as duas. */
export function locacaoDaEtiqueta(e: BlocoEtiqueta): string {
  const locs = e.linhas.map(l => String(l.locacao || '').trim()).filter(Boolean)
  const unicas = [...new Set(locs)]
  return unicas.join('  /  ')
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

  // TAMANHO DA PÁGINA = o papel que a IMPRESSORA está usando, não o tamanho da
  // folha adesiva. Parece contraintuitivo, mas é o ponto todo: se a impressora
  // está em A4 e mandamos uma página Carta, o Chrome encaixa uma na outra —
  // ENCOLHE 2,7% e centraliza. O encolhimento é fatal, porque erro de escala
  // cresce a cada linha (~7mm da 1ª à 10ª) e nenhum ajuste fino corrige.
  // Emitindo a página no tamanho do papel da impressora não há encaixe, as
  // etiquetas saem em tamanho REAL, e o que sobra é deslocamento constante —
  // esse sim o ajuste fino resolve.
  const pagLarg = off.papel === 'a4' ? 210 : 215.9
  const pagAlt = off.papel === 'a4' ? 297 : 279.4
  const gradeLarg = 3 * 66.675 + 2 * vaoCol
  // ONDE a grade fica na página:
  // · folha ADESIVA → na posição do PICOTE, que é sempre da folha Carta
  //   (12,7mm do topo, 4,76mm da lateral). A folha é Carta mesmo quando a
  //   impressora está em A4 — o tamanho da página só serve pra dizer à
  //   impressora que ela não precisa encaixar (e encolher) nada. Impressora
  //   começa a imprimir na borda de entrada do papel, então medir a partir do
  //   topo vale nos dois tamanhos de página.
  // · papel COMUM → centrada na página de verdade: não há picote pra casar.
  const ladoBase = off.tracejado ? (pagLarg - gradeLarg) / 2 : (215.9 - gradeLarg) / 2
  const topoBase = off.tracejado ? (pagAlt - 10 * 25.4) / 2 : 12.7
  // Deslocamento da folha inteira por TRANSLATE, não por margem: mexer no
  // padding limitava a correção ao tamanho da própria margem (12,7mm), e
  // padding negativo é CSS inválido — derrubaria o shorthand inteiro e
  // estouraria o layout. Impressora que joga a página 12mm pra baixo precisa
  // de -12mm, ou seja, EXATAMENTE o limite que a margem não alcançava.
  // Translate não tem esse teto e não mexe no tamanho da etiqueta.
  const ox = Math.max(-15, Math.min(15, off.x || 0))
  const oy = Math.max(-25, Math.min(25, off.y || 0))
  const desloc = ox || oy ? `transform: translate(${ox}mm, ${oy}mm);` : ''
  const padV = topoBase.toFixed(2), padH = ladoBase.toFixed(2)

  const comBarra = !!off.comBarra
  const cel = (e: BlocoEtiqueta | null) => {
    if (e === null) return '    <div class="cel"></div>'
    const dupla = e.linhas.length > 1
    const loc = locacaoDaEtiqueta(e)

    // Coluna da direita: sigla (só na simples — na dupla ela vai junto de cada
    // linha) e data, empilhadas. Duas informações curtas que gastavam uma linha
    // inteira cada quando ficavam no fluxo do texto.
    // O número da unidade vem PRA CÁ, e não sob o QR: lá embaixo ele não cabia
    // na zona de cima (QR de 8,6mm + número passavam dos 45% da etiqueta) e
    // saía cortado pela régua. Aqui ele é só mais uma linha curta de metadado.
    const lado = `        <div class="lado">${dupla ? '' : `
          <div class="emp">${esc(empresaCurta(e.linhas[0].empresa))}</div>`}
          <div class="dt-lado">${dataRef}</div>${e.numero ? `
          <div class="un">${esc(e.numero)}</div>` : ''}
        </div>`

    const qr = e.qrSvg ? `        <div class="qr">${e.qrSvg}</div>` : ''

    const barra = comBarra
      ? '\n' + e.linhas.map(l => `      <div class="rodape">${code128Svg(l.codigo, dupla ? 3 : ALTURA_BARRA_MM)}</div>`).join('\n')
      : ''

    return `    <div class="cel duaszonas${dupla ? ' dupla' : ''}${e.qrSvg ? ' comqr' : ''}${loc ? '' : ' semloc'}${comBarra ? ' combarra' : ''}">
      <div class="sup">
        <div class="dados">
${zonaDados(e)}
        </div>
${lado}
      </div>
      <div class="baixo">${loc ? `
        <div class="loc-grande"><span>${locHtml(loc)}</span></div>` : '<div class="loc-grande"></div>'}${qr ? '\n' + qr : ''}
      </div>${barra}
    </div>`
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças (folha 3×10)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: ${pagLarg}mm ${pagAlt}mm; margin: 0; }
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
    width: ${pagLarg}mm; height: ${pagAlt}mm; padding: ${padV}mm ${padH}mm;
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
  .regua { position: absolute; left: ${padH}mm; bottom: 3.6mm; display: flex; align-items: flex-end; gap: 2.5mm; }
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
  /* ── DUAS ZONAS ──────────────────────────────────────────────────────────
     .sup   = dados (código/descrição) + coluna da direita (sigla, data, QR).
              Altura CONTIDA: no máximo 45% da etiqueta, pra locação sempre
              ficar com a maior metade.
     .loc-grande = locação, ocupa TODO o resto e é a maior coisa da etiqueta.
     A régua entre as duas é o que separa "o que se lê de longe" de "o que se
     confere com a peça na mão". */
  /* Altura FIXA (não max-height): com teto percentual a altura da zona dependia
     do próprio texto que eu estava medindo, e o ajuste chegava a um tamanho que
     "cabia" na medição e mesmo assim saía cortado pela régua. Fixa, o alvo do
     ajuste é um número estável. */
  /* 38%: a locação é a razão de ser da etiqueta a três metros, e cada ponto
     percentual tirado daqui vira altura de fonte lá embaixo. Os dados encolhem
     junto — foi o que o usuário pediu ao dizer que em cima "pode diminuir". */
  .sup {
    flex: 0 0 38%; overflow: hidden;
    display: flex; align-items: flex-start; gap: 1.6mm; width: 100%;
  }
  /* dupla tem duas linhas de dados (uma por empresa): precisa de mais em cima,
     e a locação delas costuma ser curta — normalmente é a mesma peça */
  .cel.dupla .sup { flex: 0 0 52%; }
  /* dupla COM QR: a zona de baixo precisa caber o QR sem espremer, então a de
     cima cede — os dados da dupla já são pequenos e aguentam */
  .cel.dupla.comqr .sup { flex: 0 0 45%; }
  /* font-size aqui é PISO: o ajuste no navegador sobe a partir dele. Se o
     script não rodar, a etiqueta ainda sai legível em vez de herdar o tamanho
     do body e estourar. */
  .dados { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 7pt; }
  .linha-dados { line-height: 1.2; overflow: hidden; color: #111; }
  .linha-dados + .linha-dados { margin-top: 0.4mm; }
  /* coluna da direita: sigla e data empilhadas — juntas gastam a altura de UMA
     linha de texto, no lugar de duas linhas soltas no fluxo */
  .lado { flex: 0 0 auto; text-align: right; line-height: 1.15; }
  .emp { font-size: 6.5pt; font-weight: 800; letter-spacing: .8px; color: #555; }
  .dt-lado { font-size: 5pt; color: #999; letter-spacing: .2px; }
  .emp-inline { font-size: .72em; font-weight: 800; color: #666; letter-spacing: .6px; }
  /* Zona de baixo: locação + QR lado a lado.
     O QR mora AQUI, e não no topo, porque esta é a zona ALTA (62% da etiqueta):
     cabem 11,5mm de QR, contra 9,8mm lá em cima — e cada milímetro vira módulo
     maior, que é o que decide se o leitor enxerga. De quebra a locação para de
     ceder altura pro QR e cresce: 17pt em vez de 11,5pt. */
  .baixo {
    flex: 1 1 auto; min-height: 0; width: 100%;
    display: flex; align-items: stretch; gap: 2mm;
    border-top: 0.35mm solid #111; margin-top: 0.8mm; padding-top: 0.8mm;
  }
  /* LOCAÇÃO: a razão de ser da etiqueta a três metros de distância */
  .loc-grande {
    flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden;
    display: flex; align-items: center;
    font-weight: 800; line-height: 1.08; color: #000;
    font-size: 11pt; /* piso — o ajuste no navegador sobe daqui */
  }
  .loc-grande > span { display: block; width: 100%; }
  .loc-grande strong { font-weight: 800; }
  /* "CAIXA 04" nunca se parte no meio (ver locHtml) */
  .seg { white-space: nowrap; }
  /* sem locação cadastrada não há régua nem zona de baixo: os dados usam tudo */
  .cel.semloc .sup { max-height: none; flex: 1 1 auto; align-items: center; }
  .rodape { flex: 0 0 auto; width: 100%; }
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
  /* sem margem: o respiro vem dos espaços reais em volta (ver comentário no
     blocosTexto — eles são o que permite a linha quebrar) */
  .sep { color: #aaa; font-weight: 400; }
  .barra { display: block; margin: 0.7mm auto 0; max-width: 100%; }
  .dupla .barra { margin: 0.35mm auto 0; }
  /* QR: canto superior direito, ao lado da sigla/data. Zona de silêncio vem do
     gap de 1,6mm somado à área de segurança da etiqueta. */
  .qr { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  /* QR PEQUENO (25/08/2026): 13mm roubavam quase um quarto da largura útil, e a
     queixa do balcão era não conseguir ler o TEXTO. 9,5mm ainda dá ~0,26mm por
     módulo num QR de 37 módulos — celular lê de perto sem drama, e sobram ~6mm
     de largura pro texto, que é onde eles fazem falta. */
  /* 11,5mm na zona de baixo. Não é estética: com a URL em MAIÚSCULAS o QR tem
     33 módulos, e 11,5mm dão 0,348mm por módulo — bem acima do piso prático de
     leitura (0,25mm). Antes eram 0,232mm E cortado, que foi o que quebrou. */
  /* flex:0 0 auto é OBRIGATÓRIO: como item de um flex em coluna, o SVG encolhia
     só na ALTURA pra caber na linha — saía retangular. QR fora de esquadro não
     lê, e o defeito é invisível a olho nu. */
  .qr svg { width: 10.5mm; height: 10.5mm; display: block; flex: 0 0 auto; }
  .dupla .qr svg { width: 9.2mm; height: 9.2mm; }
  .un { font-size: 4.6pt; color: #666; letter-spacing: .1px; white-space: nowrap; }
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
// Busca BINÁRIA do maior tamanho que cabe. A relação é monotônica (fonte maior
// = texto mais alto = cabe menos), e busca linear custaria centenas de
// recálculos de layout por folha, travando a janela de impressão.
function maiorQueCabe(lo, hi, passo, aplicar, cabe) {
  var best = lo;
  aplicar(lo);
  if (!cabe()) return null;              // nem o mínimo cabe
  for (var k = 0; k < 9 && hi - lo > passo; k++) {
    var mid = Math.round(((lo + hi) / 2) / passo) * passo;
    mid = Math.round(mid * 100) / 100;
    if (mid <= lo || mid >= hi) break;
    aplicar(mid);
    if (cabe()) { best = mid; lo = mid; } else { hi = mid; }
  }
  aplicar(best);
  return best;
}

// Encolhe em degraus quando nem o piso coube (texto excepcionalmente longo).
function encolherAteCaber(aplicar, cabe, piso) {
  var pt = piso;
  for (var d = 0; d < 14 && !cabe() && pt > 3.4; d++) {
    pt = Math.round((pt - 0.3) * 100) / 100;
    aplicar(pt);
  }
}

function ajustarFontes() {
  document.querySelectorAll('.cel.duaszonas').forEach(function (cel) {
    var sup = cel.querySelector('.sup');
    var dados = cel.querySelector('.dados');
    var loc = cel.querySelector('.loc-grande');
    if (!sup || !dados) return;
    var dupla = cel.classList.contains('dupla');

    // ── 1) DADOS (código/descrição) ────────────────────────────────────────
    // A zona de cima tem altura FIXA no CSS e não pode roubar da locação, que é
    // o que se lê de longe. O alvo é a altura real dela, medida agora.
    var cabeDados = function () {
      return dados.scrollHeight <= sup.clientHeight && dados.scrollWidth <= dados.clientWidth + 1;
    };
    var aplicarDados = function (v) { dados.style.fontSize = v + 'pt'; };
    if (maiorQueCabe(4.2, dupla ? ${MAX_PT_DUPLA} : ${MAX_PT_DADOS}, 0.25, aplicarDados, cabeDados) === null) {
      encolherAteCaber(aplicarDados, cabeDados, 4.2);
    }

    // ── 2) LOCAÇÃO ─────────────────────────────────────────────────────────
    // Só depois de a zona de cima assentar: a locação fica com TODO o resto,
    // e é aqui que a fonte vai o mais alto que a etiqueta permitir.
    if (!loc) return;
    var cabeLoc = function () {
      return loc.scrollHeight <= loc.clientHeight && loc.scrollWidth <= loc.clientWidth + 1;
    };
    var aplicarLoc = function (v) { loc.style.fontSize = v + 'pt'; };
    if (maiorQueCabe(5, dupla ? ${MAX_PT_LOC_DUPLA} : ${MAX_PT_LOC}, 0.25, aplicarLoc, cabeLoc) === null) {
      encolherAteCaber(aplicarLoc, cabeLoc, 5);
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
