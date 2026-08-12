// Geração do HTML de impressão das ETIQUETAS DE PEÇAS (extraído da tela
// /ppv/etiquetas pra fila de rastreio /ppv/unidades reusar na reimpressão).
//
// Dois formatos: folha adesiva pré-cortada 3×10 (Pimaco/Avery 6180, Carta,
// 66,675×25,4mm) e papel comum (2 colunas tracejadas pra recortar).
//
// Cada bloco pode vir com QR de rastreio (unidade rastreada — o QR SUBSTITUI
// o código de barras Code 128, decisão do usuário 11/08/2026) ou sem (etiqueta
// comum de prateleira, layout com Code 128 como sempre foi).

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

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

// Gera o SVG do Code 128 B do texto (só ASCII imprimível; vazio = sem barra).
export function code128Svg(texto: string, alturaMm: number): string {
  const t = String(texto).replace(/[^\x20-\x7E]/g, '').slice(0, 30)
  if (!t) return ''
  const vals = [...t].map(c => c.charCodeAt(0) - 32)
  let soma = 104 // start B
  vals.forEach((v, i) => { soma += v * (i + 1) })
  const codes = [104, ...vals, soma % 103, 106]
  let x = 0
  const rects: string[] = []
  for (const code of codes) {
    const padrao = C128[code]
    for (let i = 0; i < padrao.length; i++) {
      const w = Number(padrao[i])
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="10"/>`)
      x += w
    }
  }
  return `<svg class="barra" viewBox="0 0 ${x} 10" preserveAspectRatio="none" style="height:${alturaMm}mm" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`
}

function dataRefAtual(): string {
  const agora = new Date()
  return `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`
}

// Blocos de texto de UMA etiqueta (empresa no canto esquerdo da linha do
// código; descrição inteira; locação por último — na dupla dividem a linha e
// quem corta no "…" é a locação). `comBarra` = etiqueta comum (sem QR).
function blocosTexto(e: BlocoEtiqueta, comBarra: boolean): string {
  const dupla = e.linhas.length > 1
  return e.linhas.map(l => {
    const descLocDupla = (l.descricao || l.locacao)
      ? `
        <div class="descloc">${l.descricao ? `<span class="d">${esc(l.descricao)}</span>` : ''}${l.locacao ? `<span class="l">${l.descricao ? '· ' : ''}${esc(l.locacao)}</span>` : ''}</div>`
      : ''
    return `      <div class="bloco">
        <div class="cab">
          <span class="emp">${esc(l.empresa)}</span>
          <span class="cod">${esc(l.codigo)}</span>
          <span class="emp fantasma">${esc(l.empresa)}</span>
        </div>${dupla
        ? descLocDupla
        : `${l.descricao ? `
        <div class="desc">${esc(l.descricao)}</div>` : ''}${l.locacao ? `
        <div class="loc-linha">${esc(l.locacao)}</div>` : ''}`}${comBarra ? `
        ${code128Svg(l.codigo, dupla ? 4 : 5.5)}` : ''}
      </div>`
  }).join('\n')
}

// ── Impressão em FOLHA ADESIVA pré-cortada 3×10 (Pimaco/Avery 6180) ─────────
// Folha Carta 215,9×279,4mm · etiqueta 66,675×25,4mm · margem 12,7mm em cima/
// baixo e 4,76mm nas laterais · 3,175mm entre colunas · SEM espaço entre
// linhas. `usadas` = posições (0-29) da 1ª folha já descoladas — saem em branco.
export function htmlFolha(blocos: BlocoEtiqueta[], usadas: Set<number>): string {
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
  @page { size: 215.9mm 279.4mm; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .pagina {
    width: 215.9mm; height: 279.4mm; padding: 12.7mm 4.7625mm;
    display: grid; grid-template-columns: repeat(3, 66.675mm);
    grid-auto-rows: 25.4mm; column-gap: 3.175mm;
    page-break-after: always;
  }
  .pagina:last-child { page-break-after: auto; }
  .cel {
    position: relative; overflow: hidden; padding: 0.8mm 2mm; text-align: center;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .bloco { max-width: 100%; width: 100%; }
  .bloco + .bloco { margin-top: 0.8mm; }
  .cab { display: flex; align-items: center; gap: 1mm; width: 100%; }
  .emp { flex: 0 1 auto; min-width: 0; font-size: 6pt; font-weight: 800; letter-spacing: .3px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fantasma { visibility: hidden; }
  .cod { flex: 1 1 auto; min-width: 0; font-size: 12pt; font-weight: 800; line-height: 1.1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .barra { display: block; margin: 0.5mm auto 0; width: 94%; }
  .desc { font-size: 9pt; font-weight: 600; line-height: 1.15; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loc-linha { font-size: 8pt; color: #333; line-height: 1.1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dupla .emp { font-size: 5pt; }
  .dupla .cod { font-size: 9.5pt; line-height: 1.05; }
  .dupla .barra { margin: 0.2mm auto; }
  .descloc { display: flex; justify-content: center; align-items: baseline; gap: 2px; max-width: 100%; font-size: 7pt; font-weight: 600; line-height: 1.1; }
  .descloc .d { flex: 0 0 auto; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .descloc .l { flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333; }
  .dt { position: absolute; bottom: 0.5mm; right: 1.4mm; font-size: 5.5pt; color: #666; }
  .dt.esq { right: auto; left: 1.4mm; }
  /* Rastreada: texto à esquerda + QR fixo à direita (sem Code 128) */
  .cel.comqr { flex-direction: row; align-items: center; gap: 1.2mm; }
  .cel.comqr .txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
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
  .barra { display: block; margin: 2px auto 3px; width: 72%; }
  .qr { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  .qr svg { width: 16mm; height: 16mm; display: block; }
  .un { font-size: 8px; color: #555; margin-top: 1px; }
  .dt { position: absolute; bottom: 3px; right: 6px; font-size: 8px; color: #666; }
  @media print { body { padding: 4mm; } }
</style></head><body>
<div class="grade">
${blocos.map(e => {
    const conteudo = e.linhas.map(l => `    <div class="emp">${esc(l.empresa)}</div>
    <div class="linha"><span class="cod">${esc(l.codigo)}</span> - ${esc(l.descricao)}${l.locacao ? ` - ${esc(l.locacao)}` : ''}</div>${e.qrSvg ? '' : `
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
