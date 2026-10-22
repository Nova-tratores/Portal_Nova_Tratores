// Etiqueta na IMPRESSORA TÉRMICA de rolo (a "ROGERIA" do PC das peças, rolo
// 70 × 30 mm — José, 15/10/2026). Uma etiqueta por página: @page no tamanho do
// rolo, sem margem; o QR (link público /e/<chave>) à esquerda e, à direita, o
// código grande, a descrição (2 linhas) e a locação. Preto puro (térmica não
// tem cinza). Tamanho e ajuste fino ficam guardados neste navegador.

import QRCode from 'qrcode'
import { code128Svg, qrSvg } from '@/lib/ppv/etiquetas-html'
import { urlPublica, type EtiquetaItem } from './etiqueta'

/** rotacao: a impressora puxa o rolo num sentido — girar a etiqueta acerta a orientação. */
/** intervalo: espaço (mm) entre uma etiqueta e a próxima no rolo — a página = altura + intervalo
 *  (a ROGERIA foi configurada no Windows com papel 70 × 35 mm: 30 + 5 de intervalo, 15/10/2026). */
export interface AjusteTermica { largura: number; altura: number; intervalo: number; x: number; y: number; rotacao: 0 | 90 | 180 | 270 }
export const TERMICA_PADRAO: AjusteTermica = { largura: 70, altura: 30, intervalo: 5, x: 0, y: 0, rotacao: 0 }
export const LIMITES: Record<'largura' | 'altura' | 'intervalo' | 'x' | 'y', [number, number]> = {
  largura: [20, 110], altura: [10, 150], intervalo: [0, 10], x: [-10, 10], y: [-10, 10],
}
const CHAVE = 'pni_etiqueta_termica_v3'
const CHAVE_MODO = 'pni_etiqueta_modo'

export type ModoEtiqueta = 'termica' | 'folha'

export function lerAjusteTermica(): AjusteTermica {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) || '{}') as Partial<AjusteTermica>
    const n = (v: unknown, padrao: number, min: number, max: number) => {
      const x = Number(v)
      return Number.isFinite(x) && x >= min && x <= max ? x : padrao
    }
    const rot = Number(j.rotacao)
    const L = LIMITES
    return {
      largura: n(j.largura, 70, ...L.largura), altura: n(j.altura, 30, ...L.altura), intervalo: n(j.intervalo, 5, ...L.intervalo),
      x: n(j.x, 0, ...L.x), y: n(j.y, 0, ...L.y),
      rotacao: (rot === 90 || rot === 180 || rot === 270 ? rot : 0) as AjusteTermica['rotacao'],
    }
  } catch {
    return { ...TERMICA_PADRAO }
  }
}
export function guardarAjusteTermica(a: AjusteTermica) {
  try { localStorage.setItem(CHAVE, JSON.stringify(a)) } catch { /* sem storage */ }
}
export function lerModo(): ModoEtiqueta {
  try { return localStorage.getItem(CHAVE_MODO) === 'folha' ? 'folha' : 'termica' } catch { return 'termica' }
}
export function guardarModo(m: ModoEtiqueta) {
  try { localStorage.setItem(CHAVE_MODO, m) } catch { /* sem storage */ }
}

/** Item da etiqueta: peça do Opa (token → /e/<chave>) ou outro (url pronta, ex.: Patrimônio).
 *  PPV: topo = empresa (NOVA TRATORES), extra = 2ª linha (mesma peça na outra empresa),
 *  semQr = só texto (sem rastreio), barra = Code 128 do código (pistola 1D). */
export type ItemTermica = Omit<EtiquetaItem, 'token'> & {
  token?: string; url?: string; topo?: string; extra?: string; semQr?: boolean; barra?: boolean
  /** locação em destaque (PPV: prateleira/andar/caixa abreviados, lidos de longe) */
  locGrande?: boolean
}

/** "PRATELEIRA 3 · ANDAR G · CAIXA 1" → "PRAT 3 · AND G · CX 1"; o que faltar sai "-"
 *  (José, 15/10/2026: prateleira, andar e caixa sempre dentro da etiqueta, abreviados). */
export function locacaoAbreviada(loc: string): string {
  const vals: Record<string, string> = {}
  const outros: string[] = []
  for (const seg of String(loc || '').split('·')) {
    const m = seg.trim().match(/^(\S+)\s+(.+)$/)
    if (!m) continue
    const k = m[1].toUpperCase()
    if (k === 'PRATELEIRA' || k === 'ANDAR' || k === 'CAIXA') vals[k] = m[2].trim()
    else outros.push(`${k.slice(0, 4)} ${m[2].trim()}`)
  }
  return [`PRAT ${vals.PRATELEIRA || '-'}`, `AND ${vals.ANDAR || '-'}`, `CX ${vals.CAIXA || '-'}`, ...outros].join(' · ')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** CSS + uma <div class="pg"> por etiqueta, e o tamanho da página (puro — testável). */
export function partesTermica(itens: (ItemTermica & { qr: string })[], a: AjusteTermica): { css: string; paginas: string[]; PW: number; PH: number } {
  const L = a.largura
  const H = a.altura
  const pad = Math.max(1, Math.min(2, H * 0.05))
  const qr = Math.max(10, Math.min(H - pad * 2, L * 0.42))
  const fonteCodigo = Math.max(8, Math.min(16, H * 0.42))   // pt
  const fonteDesc = Math.max(6, Math.min(9, H * 0.25))
  const deLado = a.rotacao === 90 || a.rotacao === 270
  const gap = Math.max(0, a.intervalo || 0)
  // PÁGINA = um passo do rolo (etiqueta + intervalo); a etiqueta fica nos primeiros mm
  const PW = deLado ? H + gap : L
  const PH = deLado ? L : H + gap
  const AW = deLado ? H : L   // área da etiqueta dentro da página
  const AH = deLado ? L : H
  const altBarra = Math.max(3, Math.min(6, H * 0.18))
  const paginas = itens.map((i) => {
    const desc = (i.descricao || 'Peça sem descrição') + (i.quantidade && i.quantidade > 1 ? ` (${i.quantidade} un.)` : '')
    return `<div class="pg"><div class="area"><div class="et">
  ${i.qr ? `<div class="qr">${i.qr}</div>` : ''}
  <div class="tx">
    ${i.topo ? `<div class="topo">${esc(i.topo)}</div>` : ''}
    <div class="cod">${esc(i.codigo)}</div>
    <div class="desc">${esc(desc)}</div>
    ${i.local ? `<div class="loc${i.locGrande ? ' grande' : ''}">${esc(i.local)}</div>` : ''}
    ${i.extra ? `<div class="extra">${esc(i.extra)}</div>` : ''}
    ${i.barra ? code128Svg(i.codigo, altBarra) : ''}
  </div>
</div></div></div>`
  })
  const css = `
  @page { size: ${PW}mm ${PH}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { width: ${PW}mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .pg { width: ${PW}mm; height: ${PH}mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
  .area { position: absolute; left: 0; top: 0; width: ${AW}mm; height: ${AH}mm; }
  .pg:last-child { page-break-after: auto; break-after: auto; }
  .et { width: ${L}mm; height: ${H}mm; padding: ${pad}mm; display: flex; align-items: center; gap: ${pad}mm; overflow: hidden;
        position: absolute; left: 50%; top: 50%;
        transform: translate(calc(-50% + ${a.x}mm), calc(-50% + ${a.y}mm)) rotate(${a.rotacao}deg); }
  .qr { width: ${qr}mm; height: ${qr}mm; flex-shrink: 0; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.6mm; }
  .cod { font-family: 'Courier New', monospace; font-weight: 900; font-size: ${fonteCodigo}pt; line-height: 1; white-space: nowrap; overflow: hidden; }
  .desc { font-weight: 700; font-size: ${fonteDesc}pt; line-height: 1.12; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .loc.grande { font-weight: 900; font-size: ${Math.max(7, fonteCodigo * 0.62)}pt; white-space: normal; line-height: 1.05; }
  .topo { font-weight: 900; font-size: ${Math.max(5.5, fonteDesc - 2)}pt; letter-spacing: 0.3pt; line-height: 1; }
  .extra { font-weight: 700; font-size: ${Math.max(5.5, fonteDesc - 2)}pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .barra { display: block; max-width: 100%; margin-top: 0.4mm; }
  .barra rect { fill: #000; }
  .loc { font-weight: 700; font-size: ${Math.max(6, fonteDesc - 1)}pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 0.3mm solid #000; padding-top: 0.5mm; }
  @media screen { body { margin: 10mm; } .pg { outline: 1px dashed #999; margin-bottom: 4mm; } }
`
  return { css, paginas, PW, PH }
}

/** Página HTML com uma etiqueta por página (puro — testável). */
export function htmlTermica(itens: (ItemTermica & { qr: string })[], a: AjusteTermica): string {
  const { css, paginas } = partesTermica(itens, a)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title>
<style>${css}</style></head><body>
${paginas.join('\n')}
</body></html>`
}

/**
 * Imprime a(s) etiqueta(s) SEM abrir aba (José, 15/10/2026): um iframe escondido
 * na própria página recebe o HTML e abre só o diálogo de impressão. O iframe
 * some depois de imprimir (ou de 1 min). Devolve false se não deu para montar.
 */
export function imprimirTermica(itens: ItemTermica[], a: AjusteTermica = lerAjusteTermica()): boolean {
  try {
    const com = itens.map((i) => ({ ...i, qr: i.semQr ? '' : qrSvg(QRCode.create(i.url || urlPublica(window.location.origin, i.token || ''), { errorCorrectionLevel: 'M' }).modules) }))
    // PDF primeiro (José, 22/10/2026: a página HTML saía com o cabeçalho/rodapé do
    // navegador — título e o endereço https — em quem tem "Cabeçalhos e rodapés" ligado;
    // PDF não ganha isso). Falhou o PDF → cai na impressão da página, como antes.
    void imprimirTermicaPdf(com, a).then((ok) => { if (!ok) imprimirTermicaHtml(com, a) })
    return true
  } catch {
    return false
  }
}

const PX_MM = 12 // ~305 dpi: nítido na térmica (203/300 dpi)

/** Desenha cada página (o MESMO HTML/CSS) num canvas via SVG foreignObject e monta um PDF do tamanho do rolo. */
async function imprimirTermicaPdf(com: (ItemTermica & { qr: string })[], a: AjusteTermica): Promise<boolean> {
  try {
    const { css, paginas, PW, PH } = partesTermica(com, a)
    const { jsPDF } = await import('jspdf')
    const orient = PW > PH ? 'l' : 'p'
    const pdf = new jsPDF({ unit: 'mm', format: [PW, PH], orientation: orient })
    const w = Math.round(PW * PX_MM)
    const h = Math.round(PH * PX_MM)
    for (let n = 0; n < paginas.length; n++) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<foreignObject x="0" y="0" width="${PW}mm" height="${PH}mm" transform="scale(${w / (PW * 96 / 25.4)})">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff"><style>${css.replace(/@media screen[^\n]*/, '')} html,body{margin:0}</style>${paginas[n]}</div>` +
        `</foreignObject></svg>`
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) return false
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      if (n > 0) pdf.addPage([PW, PH], orient)
      pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, PW, PH)
    }
    const url = URL.createObjectURL(pdf.output('blob'))
    document.getElementById('pni-etiqueta-print')?.remove()
    const f = document.createElement('iframe')
    f.id = 'pni-etiqueta-print'
    f.setAttribute('aria-hidden', 'true')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
    f.onload = () => setTimeout(() => { try { f.contentWindow?.focus(); f.contentWindow?.print() } catch { /* o leitor de PDF abre o diálogo sozinho */ } }, 300)
    f.src = url
    document.body.appendChild(f)
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url) }, 120_000)
    return true
  } catch {
    return false
  }
}

/** Impressão antiga (página HTML num iframe) — reserva se o PDF falhar. */
function imprimirTermicaHtml(com: (ItemTermica & { qr: string })[], a: AjusteTermica): boolean {
  try {
    document.getElementById('pni-etiqueta-print')?.remove()
    const f = document.createElement('iframe')
    f.id = 'pni-etiqueta-print'
    f.setAttribute('aria-hidden', 'true')
    // fora da tela, mas com tamanho (iframe com display:none não imprime em alguns navegadores)
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(f)
    const doc = f.contentDocument || f.contentWindow?.document
    if (!doc || !f.contentWindow) { f.remove(); return false }
    doc.open()
    doc.write(htmlTermica(com, a))
    doc.close()
    const tirar = () => setTimeout(() => f.remove(), 500)
    f.contentWindow.addEventListener('afterprint', tirar)
    setTimeout(() => f.remove(), 60_000)
    setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print() }, 250)
    return true
  } catch {
    document.getElementById('pni-etiqueta-print')?.remove()
    return false
  }
}
