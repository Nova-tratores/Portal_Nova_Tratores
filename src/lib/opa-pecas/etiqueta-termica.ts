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
/** forma: 'pagina' = a página HTML vai direto para a impressora (padrão — é a que cai certa na ROGERIA);
 *  'pdf' = monta um PDF do tamanho do rolo (José, 22/10/2026: no PDF o Chrome centralizou a etiqueta
 *  numa folha de 70 mm e ela saiu cortada entre duas etiquetas do rolo — ficou só como opção). */
export type FormaImpressao = 'pagina' | 'pdf'
export interface AjusteTermica { largura: number; altura: number; intervalo: number; x: number; y: number; rotacao: 0 | 90 | 180 | 270; forma: FormaImpressao }
export const TERMICA_PADRAO: AjusteTermica = { largura: 70, altura: 30, intervalo: 5, x: 0, y: 0, rotacao: 0, forma: 'pagina' }
export const LIMITES: Record<'largura' | 'altura' | 'intervalo' | 'x' | 'y', [number, number]> = {
  largura: [20, 110], altura: [10, 150], intervalo: [0, 10], x: [-10, 10], y: [-10, 10],
}
const CHAVE = 'pni_etiqueta_termica_v3'
const CHAVE_MODO = 'pni_etiqueta_modo'
const CHAVE_DESTINO = 'pni_etiqueta_destino'

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
      forma: j.forma === 'pdf' ? 'pdf' : 'pagina',
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

/** Onde a térmica imprime: na impressora deste computador ou na estação da ROGERIA (pela rede). */
export type DestinoTermica = 'local' | 'estacao'
export function lerDestino(): DestinoTermica {
  try { return localStorage.getItem(CHAVE_DESTINO) === 'estacao' ? 'estacao' : 'local' } catch { return 'local' }
}
export function guardarDestino(d: DestinoTermica) {
  try { localStorage.setItem(CHAVE_DESTINO, d) } catch { /* sem storage */ }
}

/** Item da etiqueta: peça do Opa (token → /e/<chave>) ou outro (url pronta, ex.: Patrimônio).
 *  PPV: topo = empresa (NOVA TRATORES), extra = 2ª linha (mesma peça na outra empresa),
 *  semQr = só texto (sem rastreio), barra = Code 128 do código (pistola 1D). */
export type ItemTermica = Omit<EtiquetaItem, 'token'> & {
  token?: string; url?: string; topo?: string; extra?: string; semQr?: boolean; barra?: boolean
  /** locação em destaque (PPV: prateleira/andar/caixa abreviados, lidos de longe) */
  locGrande?: boolean
  /** linha pequena sob a descrição (PPV: marca/modelo, quando marcados na janela de impressão) */
  info?: string
  /** PPV: marca e modelo da peça (só saem se o layout pedir) */
  marca?: string; modelo?: string
  /** ordem, visibilidade, tamanho e negrito de cada linha (PPV, José 29/10/2026);
   *  sem layout = a etiqueta de sempre */
  layout?: LayoutCampo[]
}

/** Linhas da etiqueta que o usuário arruma (o QR fica sempre à esquerda e a barra embaixo). */
export const CAMPOS_ETIQUETA = ['topo', 'codigo', 'descricao', 'marca', 'modelo', 'local', 'extra'] as const
export type CampoEtiqueta = typeof CAMPOS_ETIQUETA[number]
export const NOME_CAMPO: Record<CampoEtiqueta, string> = {
  topo: 'Empresa', codigo: 'Código', descricao: 'Descrição', marca: 'Marca', modelo: 'Modelo', local: 'Locação', extra: 'Outra empresa',
}
/** fonte: pt (0 = automático pelo tamanho da etiqueta) */
export interface LayoutCampo { campo: CampoEtiqueta; ver: boolean; fonte: number; negrito: boolean }
export const FONTE_MIN = 4
export const FONTE_MAX = 30

export function layoutPadrao(): LayoutCampo[] {
  return CAMPOS_ETIQUETA.map((campo) => ({ campo, ver: campo !== 'marca' && campo !== 'modelo', fonte: 0, negrito: true }))
}

/** Arruma um layout vindo do navegador/da rede: campos conhecidos, sem repetir, faltantes no fim (puro — testável). */
export function normalizarLayout(bruto: unknown): LayoutCampo[] | null {
  if (!Array.isArray(bruto)) return null
  const vistos = new Set<string>()
  const out: LayoutCampo[] = []
  for (const b of bruto) {
    const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
    const campo = String(o.campo) as CampoEtiqueta
    if (!(CAMPOS_ETIQUETA as readonly string[]).includes(campo) || vistos.has(campo)) continue
    vistos.add(campo)
    const fonte = Number(o.fonte)
    out.push({
      campo, ver: o.ver !== false, negrito: o.negrito !== false,
      fonte: Number.isFinite(fonte) && fonte >= FONTE_MIN && fonte <= FONTE_MAX ? Math.round(fonte * 2) / 2 : 0,
    })
  }
  if (!out.length) return null
  for (const p of layoutPadrao()) if (!vistos.has(p.campo)) out.push(p)
  return out
}

/** Tamanho automático (pt) de cada linha para a altura da etiqueta — o que vale com fonte 0. */
export function fontesPadrao(altura: number, locGrande = true): Record<CampoEtiqueta, number> {
  const fc = Math.max(8, Math.min(16, altura * 0.42))
  const fd = Math.max(6, Math.min(9, altura * 0.25))
  const peq = Math.max(5.5, fd - 2)
  const r = (n: number) => Math.round(n * 2) / 2
  return {
    topo: r(peq), codigo: r(fc), descricao: r(fd), marca: r(peq), modelo: r(peq),
    local: r(locGrande ? Math.max(7, fc * 0.62) : Math.max(6, fd - 1)), extra: r(peq),
  }
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
    const linhas = i.layout ? linhasComLayout(i, desc, i.layout) : `
    ${i.topo ? `<div class="topo">${esc(i.topo)}</div>` : ''}
    <div class="cod">${esc(i.codigo)}</div>
    <div class="desc">${esc(desc)}</div>
    ${i.info ? `<div class="extra">${esc(i.info)}</div>` : ''}
    ${i.local ? `<div class="loc${i.locGrande ? ' grande' : ''}">${esc(i.local)}</div>` : ''}
    ${i.extra ? `<div class="extra">${esc(i.extra)}</div>` : ''}`
    return `<div class="pg"><div class="area"><div class="et">
  ${i.qr ? `<div class="qr">${i.qr}</div>` : ''}
  <div class="tx">${linhas}
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
  .tx > .loc:first-child { border-top: none; padding-top: 0; }
  @media screen { body { margin: 10mm; } .pg { outline: 1px dashed #999; margin-bottom: 4mm; } }
`
  return { css, paginas, PW, PH }
}

/** Linhas na ordem do layout; fonte/negrito escolhidos vão inline por cima da classe. */
function linhasComLayout(i: ItemTermica, desc: string, layout: LayoutCampo[]): string {
  const valor: Record<CampoEtiqueta, [string, string]> = {
    topo: ['topo', i.topo || ''], codigo: ['cod', i.codigo], descricao: ['desc', desc],
    marca: ['extra', i.marca ? `MARCA ${i.marca}` : ''], modelo: ['extra', i.modelo ? `MODELO ${i.modelo}` : ''],
    local: [`loc${i.locGrande ? ' grande' : ''}`, i.local || ''], extra: ['extra', i.extra || ''],
  }
  return layout.filter((l) => l.ver && valor[l.campo]?.[1]).map((l) => {
    const [classe, texto] = valor[l.campo]
    const estilo = [l.fonte ? `font-size:${l.fonte}pt` : '', l.negrito ? '' : 'font-weight:400'].filter(Boolean).join(';')
    return `
    <div class="${classe}"${estilo ? ` style="${estilo}"` : ''}>${esc(texto)}</div>`
  }).join('')
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
export function imprimirTermica(itens: ItemTermica[], a: AjusteTermica = lerAjusteTermica(), aoTerminar?: (ok: boolean) => void): boolean {
  // aoTerminar: a estação de impressão espera uma impressão acabar antes da próxima
  let avisou = false
  const fim = (ok: boolean) => { if (!avisou) { avisou = true; aoTerminar?.(ok) } }
  try {
    const com = itens.map((i) => ({ ...i, qr: i.semQr ? '' : qrSvg(QRCode.create(i.url || urlPublica(window.location.origin, i.token || ''), { errorCorrectionLevel: 'M' }).modules) }))
    // Página primeiro (é a que cai certa no rolo). PDF só se escolhido nos ajustes;
    // falhou o PDF → cai na página.
    if (a.forma === 'pdf') { void imprimirTermicaPdf(com, a, fim).then((ok) => { if (!ok) imprimirTermicaHtml(com, a, undefined, fim) }); return true }
    // Cada etiqueta vai como IMAGEM (José, 23/10/2026: em lote o driver da ROGERIA
    // perdia o nome e o local a partir da 2ª etiqueta — texto some, imagem não).
    // Não deu para desenhar → página com texto, como antes.
    void paginasEmImagem(com, a).then((r) => imprimirTermicaHtml(com, a, r, fim)).catch(() => imprimirTermicaHtml(com, a, undefined, fim))
    return true
  } catch {
    fim(false)
    return false
  }
}

const PX_MM = 12 // ~305 dpi: nítido na térmica (203/300 dpi)

/** Desenha cada página (o MESMO HTML/CSS) num canvas via SVG foreignObject → PNG (data URL). */
async function paginasEmImagem(com: (ItemTermica & { qr: string })[], a: AjusteTermica): Promise<{ imgs: string[]; PW: number; PH: number }> {
  const { css, paginas, PW, PH } = partesTermica(com, a)
  const w = Math.round(PW * PX_MM)
  const h = Math.round(PH * PX_MM)
  const imgs: string[] = []
  for (const pagina of paginas) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<foreignObject x="0" y="0" width="${PW}mm" height="${PH}mm" transform="scale(${w / (PW * 96 / 25.4)})">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff"><style>${css.replace(/@media screen[^\n]*/, '')} html,body{margin:0}</style>${pagina}</div>` +
      `</foreignObject></svg>`
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) throw new Error('sem canvas')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    imgs.push(cv.toDataURL('image/png'))
  }
  return { imgs, PW, PH }
}

/** Monta um PDF do tamanho do rolo com as páginas já desenhadas em imagem. */
async function imprimirTermicaPdf(com: (ItemTermica & { qr: string })[], a: AjusteTermica, fim?: (ok: boolean) => void): Promise<boolean> {
  try {
    const { imgs, PW, PH } = await paginasEmImagem(com, a)
    const { jsPDF } = await import('jspdf')
    const orient = PW > PH ? 'l' : 'p'
    const pdf = new jsPDF({ unit: 'mm', format: [PW, PH], orientation: orient })
    imgs.forEach((src, n) => {
      if (n > 0) pdf.addPage([PW, PH], orient)
      pdf.addImage(src, 'PNG', 0, 0, PW, PH)
    })
    const url = URL.createObjectURL(pdf.output('blob'))
    document.getElementById('pni-etiqueta-print')?.remove()
    const f = document.createElement('iframe')
    f.id = 'pni-etiqueta-print'
    f.setAttribute('aria-hidden', 'true')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
    f.onload = () => setTimeout(() => {
      try { f.contentWindow?.focus(); f.contentWindow?.print() } catch { /* o leitor de PDF abre o diálogo sozinho */ }
      setTimeout(() => fim?.(true), 3000)
    }, 300)
    f.src = url
    document.body.appendChild(f)
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url) }, 120_000)
    return true
  } catch {
    return false
  }
}

/** Página com uma imagem por etiqueta, no mesmo tamanho de página da versão em texto (puro — testável). */
export function htmlTermicaImagens(imgs: string[], PW: number, PH: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>&#8203;</title><style>
  @page { size: ${PW}mm ${PH}mm; margin: 0; }
  * { margin: 0; padding: 0; }
  html, body { width: ${PW}mm; background: #fff; }
  .pg { width: ${PW}mm; height: ${PH}mm; overflow: hidden; page-break-after: always; break-after: page; }
  .pg:last-child { page-break-after: auto; break-after: auto; }
  .pg img { display: block; width: ${PW}mm; height: ${PH}mm; }
</style></head><body>
${imgs.map((src) => `<div class="pg"><img src="${src}" alt=""></div>`).join('\n')}
</body></html>`
}

/** Página HTML num iframe (srcdoc: o endereço do portal não vai para o cabeçalho do navegador).
 *  Com `imagens`, cada etiqueta vai desenhada; sem, vai o HTML com texto. */
function imprimirTermicaHtml(com: (ItemTermica & { qr: string })[], a: AjusteTermica, imagens?: { imgs: string[]; PW: number; PH: number }, fim?: (ok: boolean) => void): boolean {
  try {
    document.getElementById('pni-etiqueta-print')?.remove()
    const f = document.createElement('iframe')
    f.id = 'pni-etiqueta-print'
    f.setAttribute('aria-hidden', 'true')
    // fora da tela, mas com tamanho (iframe com display:none não imprime em alguns navegadores)
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'
    // título vazio: se o navegador ainda puser cabeçalho, ele não mostra nada
    f.srcdoc = imagens
      ? htmlTermicaImagens(imagens.imgs, imagens.PW, imagens.PH)
      : htmlTermica(com, a).replace('<title>Etiqueta</title>', '<title>&#8203;</title>')
    f.onload = () => {
      const w = f.contentWindow
      if (!w) return
      w.addEventListener('afterprint', () => { setTimeout(() => f.remove(), 500); fim?.(true) })
      // espera as imagens decodificarem antes de abrir a impressão
      const prontas = Array.from(w.document.images).map((im) => im.decode().catch(() => undefined))
      void Promise.all(prontas).then(() => setTimeout(() => { w.focus(); w.print(); fim?.(true) }, 150))
    }
    document.body.appendChild(f)
    setTimeout(() => f.remove(), 60_000)
    return true
  } catch {
    document.getElementById('pni-etiqueta-print')?.remove()
    fim?.(false)
    return false
  }
}
