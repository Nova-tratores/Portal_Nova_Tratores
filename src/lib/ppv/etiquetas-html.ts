// Geração do HTML de impressão das ETIQUETAS DE PEÇAS (extraído da tela
// /ppv/etiquetas pra fila de rastreio /ppv/unidades reusar na reimpressão).
//
// Dois formatos: folha adesiva pré-cortada 3×10 (Pimaco/Avery 6180, Carta,
// 66,675×25,4mm) e papel comum (2 colunas tracejadas pra recortar).
//
// Cada bloco pode vir com QR de rastreio (unidade rastreada — o QR SUBSTITUI
// o código de barras Code 128, decisão do usuário 11/08/2026) ou sem (etiqueta
// comum de prateleira, layout com Code 128 como sempre foi).
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
  /** SVG do QR de rastreio (QRCode.toString type:'svg') — presente = rastreada */
  qrSvg?: string | null
  /** número legível da unidade (UN-000123), impresso sob o QR */
  numero?: string | null
}

/** Deslocamento fino (mm) da folha p/ calibrar impressoras que puxam torto.
 *  x>0 empurra p/ direita, y>0 empurra p/ baixo. Mantém o tamanho das etiquetas
 *  (só realoca as margens), então não estraga o casamento com a folha pré-cortada. */
export interface OffsetFolha { x?: number; y?: number }

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

// Tamanho (pt) do código LEGÍVEL conforme o nº de caracteres, p/ nunca truncar
// (o Code128 já leva o código inteiro; isto é só o texto humano). `dupla` = 2
// empresas na mesma etiqueta (menos espaço → fonte menor).
export function fonteCodigo(len: number, dupla: boolean): number {
  let pt = len <= 9 ? 15 : len <= 12 ? 13 : len <= 15 ? 11 : 9
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

// Lado da badge da empresa na etiqueta: NOVA à ESQUERDA, CASTRO à DIREITA.
function empresaDireita(nome: string): boolean {
  return /CASTRO/i.test(String(nome || ''))
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
// Quiet zone (módulos claros) de cada lado — EXIGIDA pelo Code 128 p/ o leitor
// achar o início/fim. Antes as barras começavam coladas na borda (x=0).
const QUIET = 10

// Gera o SVG do Code 128 B do texto (só ASCII imprimível; vazio = sem barra).
export function code128Svg(texto: string, alturaMm: number): string {
  const t = String(texto).replace(/[^\x20-\x7E]/g, '').slice(0, 30)
  if (!t) return ''
  const vals = [...t].map(c => c.charCodeAt(0) - 32)
  let soma = 104 // Start B (peso 1)
  vals.forEach((v, i) => { soma += v * (i + 1) })
  const codes = [104, ...vals, soma % 103, 106] // start, dados, checksum, stop
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

function dataRefAtual(): string {
  const agora = new Date()
  return `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`
}

// Blocos de UMA etiqueta. Cada linha vira um .bloco = .corpo (empresa+código+
// descrição+locação, que encolhe/corta se faltar espaço) + .rodape (o barcode,
// com espaço garantido — nunca é cortado). `comBarra` = etiqueta comum (sem QR).
function blocosTexto(e: BlocoEtiqueta, comBarra: boolean): string {
  const dupla = e.linhas.length > 1
  return e.linhas.map(l => {
    const curta = esc(empresaCurta(l.empresa))
    const dir = empresaDireita(l.empresa)
    const badge = `<span class="emp">${curta}</span>`
    const fant = `<span class="emp fantasma">${curta}</span>`
    const cab = `<div class="cab">${dir ? fant : badge}<span class="cod" style="font-size:${fonteCodigo(String(l.codigo).length, dupla)}pt">${esc(l.codigo)}</span>${dir ? badge : fant}</div>`
    const texto = dupla
      ? ((l.descricao || l.locacao)
          ? `<div class="descloc">${l.descricao ? `<span class="d">${esc(l.descricao)}</span>` : ''}${l.locacao ? `<span class="l">${l.descricao ? '· ' : ''}${locHtml(l.locacao)}</span>` : ''}</div>`
          : '')
      : `${l.descricao ? `<div class="desc">${esc(l.descricao)}</div>` : ''}${l.locacao ? `<div class="loc-linha">${locHtml(l.locacao)}</div>` : ''}`
    const rodape = comBarra ? `
        <div class="rodape">${code128Svg(l.codigo, dupla ? 3.4 : 5)}</div>` : ''
    return `      <div class="bloco">
        <div class="corpo">${cab}${texto}</div>${rodape}
      </div>`
  }).join('\n')
}

// ── Impressão em FOLHA ADESIVA pré-cortada 3×10 (Pimaco/Avery 6180) ─────────
// Folha 215×280mm · margem 5mm laterais, 12mm topo, 13mm base · 4mm entre
// colunas, 0mm entre linhas → etiqueta 65,667mm larg (=(215−10−8)/3) × 25,5mm
// alt (=(280−25)/10). `usadas` = posições (0-29) da 1ª folha já descoladas —
// saem em branco. `off` = calibração fina de impressora (mm), ver OffsetFolha.
export function htmlFolha(blocos: BlocoEtiqueta[], usadas: Set<number>, off: OffsetFolha = {}): string {
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
  // Realoca as margens pelo offset (mantém o tamanho da etiqueta intacto).
  const ox = Math.max(-5, Math.min(5, off.x || 0))
  const oy = Math.max(-12, Math.min(13, off.y || 0))
  const padTop = (12 + oy).toFixed(2), padBot = (13 - oy).toFixed(2)
  const padLeft = (5 + ox).toFixed(2), padRight = (5 - ox).toFixed(2)

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
    // Rastreada: texto à esquerda, QR à direita (substitui o Code 128);
    // número da unidade sob o QR; data migra pro canto inferior esquerdo.
    return `    <div class="cel comqr${dupla ? ' dupla' : ''}">
      <div class="txt">
${blocosTexto(e, false)}
      </div>
      <div class="qr">
        ${e.qrSvg}${e.numero ? `
        <div class="un">${esc(e.numero)}</div>` : ''}
      </div>
      <div class="dt esq">${dataRef}</div>
    </div>`
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças (folha 3×10)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 215mm 280mm; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .pagina {
    width: 215mm; height: 280mm; padding: ${padTop}mm ${padRight}mm ${padBot}mm ${padLeft}mm;
    display: grid; grid-template-columns: repeat(3, 65.667mm);
    grid-auto-rows: 25.5mm; column-gap: 4mm; row-gap: 0;
    page-break-after: always;
  }
  .pagina:last-child { page-break-after: auto; }
  .cel {
    position: relative; overflow: hidden; padding: 1.2mm 2mm 0.8mm; text-align: center;
    display: flex; flex-direction: column; align-items: stretch; justify-content: stretch;
  }
  /* bloco = corpo (texto, encolhe/corta) + rodapé (barcode, espaço garantido) */
  .bloco { width: 100%; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .dupla .bloco + .bloco { margin-top: 0.5mm; }
  .corpo { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
  .rodape { flex: 0 0 auto; width: 100%; }
  .cab { display: flex; align-items: center; gap: 1mm; width: 100%; }
  .emp { flex: 0 1 auto; min-width: 0; font-size: 8pt; font-weight: 800; letter-spacing: .3px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fantasma { visibility: hidden; }
  .cod { flex: 1 1 auto; min-width: 0; font-size: 14pt; font-weight: 800; line-height: 1.1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .barra { display: block; margin: 0.5mm auto 0; max-width: 100%; }
  .desc { font-size: 10pt; font-weight: 600; line-height: 1.1; max-width: 100%; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .loc-linha { font-size: 9pt; color: #777; font-weight: 400; line-height: 1.12; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loc-linha strong, .descloc .l strong { font-weight: 800; color: #000; font-size: 1.2em; }
  .dupla .emp { font-size: 5pt; }
  .dupla .cod { font-size: 9.5pt; line-height: 1.05; }
  .dupla .barra { margin: 0.2mm auto 0; }
  .descloc { display: flex; justify-content: center; align-items: baseline; gap: 2px; max-width: 100%; font-size: 7pt; font-weight: 600; line-height: 1.1; }
  .descloc .d { flex: 0 0 auto; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .descloc .l { flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; }
  .dt { position: absolute; bottom: 0.5mm; right: 1.4mm; font-size: 5.5pt; color: #666; }
  .dt.esq { right: auto; left: 1.4mm; }
  /* Rastreada: texto à esquerda + QR fixo à direita (sem Code 128) */
  .cel.comqr { flex-direction: row; align-items: center; gap: 1.2mm; }
  .cel.comqr .txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: stretch; justify-content: center; }
  .qr { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  .qr svg { width: 13mm; height: 13mm; display: block; }
  .dupla .qr svg { width: 12mm; height: 12mm; }
  .un { font-size: 5pt; color: #555; margin-top: 0.2mm; letter-spacing: .2px; }
  .cel.comqr .cod { font-size: 11pt; }
  .cel.comqr.dupla .cod { font-size: 9pt; }
  @media screen {
    body { background: #e5e7eb; }
    .pagina { background: #fff; margin: 10px auto; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
    .cel { outline: 1px dashed #d1d5db; }
  }
</style></head><body>
${paginas.map(cels => `  <div class="pagina">
${cels.map(cel).join('\n')}
  </div>`).join('\n')}
<script>window.onload = () => { window.print(); }</script>
</body></html>`
}

// Impressão em papel comum, 2 colunas com borda tracejada pra recortar
export function htmlRecorte(blocos: BlocoEtiqueta[]): string {
  const dataRef = dataRefAtual()
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de peças</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 8mm; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .etq { position: relative; border: 1.5px dashed #555; border-radius: 4px; padding: 8px 10px 14px; break-inside: avoid; page-break-inside: avoid; }
  .etq.comqr { display: flex; gap: 4mm; align-items: center; }
  .etq .conteudo { flex: 1 1 auto; min-width: 0; }
  .emp { font-size: 11px; font-weight: 800; letter-spacing: .5px; margin-top: 6px; }
  .emp:first-child, .conteudo > .emp:first-child { margin-top: 0; }
  .linha { font-size: 12px; line-height: 1.35; margin-top: 1px; }
  .cod { font-weight: 800; font-family: 'Courier New', monospace; }
  .barra { display: block; margin: 2px auto 3px; max-width: 100%; }
  .qr { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  .qr svg { width: 16mm; height: 16mm; display: block; }
  .un { font-size: 8px; color: #555; margin-top: 1px; }
  .dt { position: absolute; bottom: 3px; right: 6px; font-size: 8px; color: #666; }
  @media print { body { padding: 4mm; } }
</style></head><body>
<div class="grade">
${blocos.map(e => {
    const conteudo = e.linhas.map(l => `    <div class="emp">${esc(empresaCurta(l.empresa))}</div>
    <div class="linha"><span class="cod">${esc(l.codigo)}</span> - ${esc(l.descricao)}${l.locacao ? ` - ${locHtml(l.locacao)}` : ''}</div>${e.qrSvg ? '' : `
    ${code128Svg(l.codigo, 7)}`}`).join('\n')
    if (!e.qrSvg) {
      return `  <div class="etq">
${conteudo}
    <div class="dt">${dataRef}</div>
  </div>`
    }
    return `  <div class="etq comqr">
    <div class="conteudo">
${conteudo}
    </div>
    <div class="qr">
      ${e.qrSvg}${e.numero ? `
      <div class="un">${esc(e.numero)}</div>` : ''}
    </div>
    <div class="dt">${dataRef}</div>
  </div>`
  }).join('\n')}
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`
}
