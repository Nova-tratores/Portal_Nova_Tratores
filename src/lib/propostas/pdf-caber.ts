// Texto que SEMPRE cabe na grade do PDF da proposta (13/10/2026 — o FINAME/NCM
// atravessava a borda da tabela). Regra para qualquer campo: tenta a fonte
// normal; se não couber, diminui de meio em meio ponto até `minFonte`, quebrando
// em até `maxLinhas` dentro da largura; se nem assim couber, corta a última linha
// com "…". Nunca escreve além de `largura` (nem de `alturaMax`, nos blocos).
// Puro (recebe o doc do jsPDF) — testado com doc falso.

export type DocTexto = {
  setFont(name: string, style?: string): unknown
  setFontSize(n: number): unknown
  text(txt: string | string[], x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }): unknown
  splitTextToSize(txt: string, maxWidth: number): string[]
  getTextWidth(txt: string): number
}

/** Entrelinha (mm) para uma fonte em pt: 1,2× o corpo. */
export const entrelinhaDe = (fontePt: number): number => Math.round(fontePt * 0.3528 * 1.2 * 100) / 100

/** Corta o texto (com "…") até caber na largura, com a fonte já aplicada no doc. */
export function cortarComReticencias(doc: DocTexto, texto: string, largura: number): string {
  if (doc.getTextWidth(texto) <= largura) return texto
  let t = texto.replace(/…$/, '')
  while (t.length > 1 && doc.getTextWidth(t + '…') > largura) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

function fontes(fonte: number, minFonte: number): number[] {
  const out: number[] = []
  for (let f = fonte; f >= minFonte - 1e-9; f -= 0.5) out.push(Math.round(f * 10) / 10)
  return out.length ? out : [fonte]
}

export type ArgsCampo = {
  rotulo?: string              // em negrito, ex.: "FINAME/NCM:" (o espaço é posto aqui)
  valor: string
  x: number
  y: number                    // baseline da 1ª linha
  largura: number              // largura total disponível (rótulo + valor)
  fonte: number
  minFonte?: number            // padrão: fonte − 2
  maxLinhas?: number           // padrão: 1
  negritoValor?: boolean       // valor também em negrito (cabeçalho do equipamento)
  negritoRotulo?: boolean      // padrão true; false = rótulo no mesmo peso do valor
}

/**
 * Desenha "RÓTULO: valor" dentro da largura. As linhas seguintes do valor ficam
 * alinhadas onde o valor começa. Devolve a baseline da última linha e a fonte usada.
 * Restaura a fonte pedida no fim (o chamador segue com o tamanho dele).
 */
export function desenharCampo(doc: DocTexto, a: ArgsCampo): { yFinal: number; fonte: number; linhas: number } {
  const maxLinhas = Math.max(1, a.maxLinhas ?? 1)
  const minFonte = a.minFonte ?? a.fonte - 2
  const rotulo = a.rotulo ? a.rotulo.trimEnd() + ' ' : ''
  const valor = String(a.valor ?? '').replace(/\s+/g, ' ').trim()
  const estiloValor = a.negritoValor ? 'bold' : 'normal'
  const estiloRotulo = a.negritoRotulo === false ? estiloValor : 'bold'
  const mesmoEstilo = estiloRotulo === estiloValor

  let escolha: { f: number; lw: number; linhas: string[] } | null = null
  for (const f of fontes(a.fonte, minFonte)) {
    doc.setFontSize(f)
    doc.setFont('helvetica', estiloRotulo)
    // Folga depois do rótulo: o leitor de PDF troca a Helvetica por uma fonte um
    // pouco mais larga e, num rótulo comprido, a diferença engolia o espaço
    // ("VALOR TOTAL:R$"). Mesmo estilo → a 1ª linha sai num texto só (abaixo);
    // rótulo em negrito → folga de ~2 espaços.
    const espaco = doc.getTextWidth('x x') - doc.getTextWidth('xx')
    const lw = rotulo ? doc.getTextWidth(rotulo.trimEnd()) + espaco * (mesmoEstilo ? 1 : 2) : 0
    doc.setFont('helvetica', estiloValor)
    const larguraValor = Math.max(4, a.largura - lw)
    const linhas = valor ? doc.splitTextToSize(valor, larguraValor) : ['']
    escolha = { f, lw, linhas }
    if (linhas.length <= maxLinhas) break
  }
  const { f, lw } = escolha!
  let linhas = escolha!.linhas
  doc.setFontSize(f)
  doc.setFont('helvetica', estiloValor)
  if (linhas.length > maxLinhas) {
    linhas = linhas.slice(0, maxLinhas)
    // "…" no fim = tinha mais texto (corta até caber junto com ele)
    linhas[maxLinhas - 1] = cortarComReticencias(doc, linhas[maxLinhas - 1] + '…', Math.max(4, a.largura - lw))
  }

  // segurança: nenhuma linha passa da largura (palavra enorme sem espaço)
  linhas = linhas.map((l) => cortarComReticencias(doc, l, Math.max(4, a.largura - lw)))

  const ent = entrelinhaDe(f)
  if (rotulo && mesmoEstilo) {
    // rótulo + 1ª linha num texto só: o espaço é o do próprio texto, nunca some
    doc.setFont('helvetica', estiloValor)
    doc.text(linhas[0] ? rotulo.trimEnd() + ' ' + linhas[0] : rotulo.trimEnd(), a.x, a.y)
    linhas.forEach((l, i) => { if (i > 0 && l) doc.text(l, a.x + lw, a.y + i * ent) })
  } else {
    if (rotulo) {
      doc.setFont('helvetica', estiloRotulo)
      doc.text(rotulo.trimEnd(), a.x, a.y)
    }
    doc.setFont('helvetica', estiloValor)
    linhas.forEach((l, i) => { if (l) doc.text(l, a.x + lw, a.y + i * ent) })
  }

  doc.setFontSize(a.fonte)
  return { yFinal: a.y + (linhas.length - 1) * ent, fonte: f, linhas: linhas.length }
}

export type ArgsBlocoTexto = {
  texto: string
  x: number
  y: number                    // baseline da 1ª linha
  largura: number
  alturaMax: number            // do y (baseline 1) até o limite inferior
  fonte: number
  minFonte?: number
  negrito?: boolean
}

/** Parágrafo livre (descrição, condições): cabe em largura E altura. */
export function desenharBlocoTexto(doc: DocTexto, a: ArgsBlocoTexto): { yFinal: number; fonte: number; linhas: number } {
  const minFonte = a.minFonte ?? a.fonte - 2
  const texto = String(a.texto ?? '').trim()
  doc.setFont('helvetica', a.negrito ? 'bold' : 'normal')
  let escolha: { f: number; linhas: string[]; cabem: number } | null = null
  for (const f of fontes(a.fonte, minFonte)) {
    doc.setFontSize(f)
    const linhas = texto ? doc.splitTextToSize(texto, a.largura) : []
    const cabem = Math.max(1, Math.floor(a.alturaMax / entrelinhaDe(f)) + 1)
    escolha = { f, linhas, cabem }
    if (linhas.length <= cabem) break
  }
  const { f, cabem } = escolha!
  let linhas = escolha!.linhas
  doc.setFontSize(f)
  if (linhas.length > cabem) {
    linhas = linhas.slice(0, cabem)
    linhas[cabem - 1] = cortarComReticencias(doc, linhas[cabem - 1] + '…', a.largura)
  }
  linhas = linhas.map((l) => cortarComReticencias(doc, l, a.largura))
  const ent = entrelinhaDe(f)
  linhas.forEach((l, i) => doc.text(l, a.x, a.y + i * ent))
  doc.setFontSize(a.fonte)
  return { yFinal: a.y + Math.max(0, linhas.length - 1) * ent, fonte: f, linhas: linhas.length }
}
