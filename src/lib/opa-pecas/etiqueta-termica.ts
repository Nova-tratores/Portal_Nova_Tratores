// Etiqueta na IMPRESSORA TÉRMICA de rolo (a "ROGERIA" do PC das peças, rolo
// 70 × 30 mm — José, 15/10/2026). Uma etiqueta por página: @page no tamanho do
// rolo, sem margem; o QR (link público /e/<chave>) à esquerda e, à direita, o
// código grande, a descrição (2 linhas) e a locação. Preto puro (térmica não
// tem cinza). Tamanho e ajuste fino ficam guardados neste navegador.

import QRCode from 'qrcode'
import { qrSvg } from '@/lib/ppv/etiquetas-html'
import { urlPublica, type EtiquetaItem } from './etiqueta'

/** rotacao: a impressora puxa o rolo num sentido — girar a etiqueta acerta a orientação. */
export interface AjusteTermica { largura: number; altura: number; x: number; y: number; rotacao: 0 | 90 | 180 | 270 }
export const TERMICA_PADRAO: AjusteTermica = { largura: 70, altura: 30, x: 0, y: 0, rotacao: 0 }
const CHAVE = 'pni_etiqueta_termica'
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
    return {
      largura: n(j.largura, 70, 20, 120), altura: n(j.altura, 30, 15, 200), x: n(j.x, 0, -10, 10), y: n(j.y, 0, -10, 10),
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Página HTML com uma etiqueta por página (puro — testável). */
export function htmlTermica(itens: (EtiquetaItem & { qr: string })[], a: AjusteTermica): string {
  const L = a.largura
  const H = a.altura
  const pad = Math.max(1, Math.min(2, H * 0.05))
  const qr = Math.max(10, Math.min(H - pad * 2, L * 0.42))
  const fonteCodigo = Math.max(8, Math.min(16, H * 0.42))   // pt
  const fonteDesc = Math.max(6, Math.min(9, H * 0.25))
  const deLado = a.rotacao === 90 || a.rotacao === 270
  const PW = deLado ? H : L   // tamanho da PÁGINA que vai para a impressora
  const PH = deLado ? L : H
  const etiquetas = itens.map((i) => {
    const desc = (i.descricao || 'Peça sem descrição') + (i.quantidade && i.quantidade > 1 ? ` (${i.quantidade} un.)` : '')
    return `<div class="pg"><div class="et">
  <div class="qr">${i.qr}</div>
  <div class="tx">
    <div class="cod">${esc(i.codigo)}</div>
    <div class="desc">${esc(desc)}</div>
    ${i.local ? `<div class="loc">${esc(i.local)}</div>` : ''}
  </div>
</div></div>`
  }).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title>
<style>
  @page { size: ${PW}mm ${PH}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { width: ${PW}mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .pg { width: ${PW}mm; height: ${PH}mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
  .pg:last-child { page-break-after: auto; break-after: auto; }
  .et { width: ${L}mm; height: ${H}mm; padding: ${pad}mm; display: flex; align-items: center; gap: ${pad}mm; overflow: hidden;
        position: absolute; left: 50%; top: 50%;
        transform: translate(calc(-50% + ${a.x}mm), calc(-50% + ${a.y}mm)) rotate(${a.rotacao}deg); }
  .qr { width: ${qr}mm; height: ${qr}mm; flex-shrink: 0; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.6mm; }
  .cod { font-family: 'Courier New', monospace; font-weight: 900; font-size: ${fonteCodigo}pt; line-height: 1; white-space: nowrap; overflow: hidden; }
  .desc { font-weight: 700; font-size: ${fonteDesc}pt; line-height: 1.12; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .loc { font-weight: 700; font-size: ${Math.max(6, fonteDesc - 1)}pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-top: 0.3mm solid #000; padding-top: 0.5mm; }
  @media screen { body { margin: 10mm; } .pg { outline: 1px dashed #999; margin-bottom: 4mm; } }
</style></head><body>
${etiquetas}
<script>window.onload = function () { setTimeout(function () { window.print() }, 250) }</script>
</body></html>`
}

/**
 * Abre a(s) etiqueta(s) no tamanho do rolo e o diálogo de impressão. Chamar
 * DIRETO no clique (pop-up). Devolve false se o navegador bloqueou.
 */
export function imprimirTermica(itens: EtiquetaItem[], a: AjusteTermica = lerAjusteTermica()): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  try {
    const com = itens.map((i) => ({ ...i, qr: qrSvg(QRCode.create(urlPublica(window.location.origin, i.token), { errorCorrectionLevel: 'M' }).modules) }))
    w.document.write(htmlTermica(com, a))
    w.document.close()
    return true
  } catch {
    w.close()
    return false
  }
}
