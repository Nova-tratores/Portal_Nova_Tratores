import { describe, it, expect } from 'vitest'
import { jsPDF } from 'jspdf'
import { desenharCampo, desenharBlocoTexto, entrelinhaDe, type DocTexto } from '../pdf-caber'

// jsPDF de verdade, gravando cada texto desenhado com a largura que ele ocupa
function docGravando() {
  const doc = new jsPDF()
  const escritos: { texto: string; x: number; y: number; largura: number }[] = []
  const original = doc.text.bind(doc)
  const d = doc as unknown as DocTexto
  ;(d as { text: DocTexto['text'] }).text = (txt, x, y, opts) => {
    const t = Array.isArray(txt) ? txt.join(' ') : txt
    escritos.push({ texto: t, x, y, largura: doc.getTextWidth(t) })
    return original(txt, x, y, opts)
  }
  return { d, escritos }
}

const FINAME = '"Resolução Gecex nº 401 de 22 Set. de 2022, NCM 8701.92.00 — Ex-tarifário 001, FINAME código 3456789"'

describe('desenharCampo', () => {
  it('FINAME longo não passa da largura da coluna', () => {
    const { d, escritos } = docGravando()
    const r = desenharCampo(d, { rotulo: 'FINAME/NCM:', valor: FINAME, x: 115, y: 100, largura: 77, fonte: 8.5, minFonte: 6.5, maxLinhas: 3, negritoValor: true })
    for (const e of escritos) expect(e.x + e.largura).toBeLessThanOrEqual(115 + 77 + 0.01)
    expect(r.linhas).toBeGreaterThan(1)
    expect(r.linhas).toBeLessThanOrEqual(3)
  })
  it('valor curto fica numa linha na fonte normal', () => {
    const { d } = docGravando()
    const r = desenharCampo(d, { rotulo: 'QTD:', valor: '1', x: 115, y: 100, largura: 77, fonte: 8.5 })
    expect(r).toMatchObject({ linhas: 1, fonte: 8.5, yFinal: 100 })
  })
  it('diminui a letra antes de quebrar quando dá', () => {
    const { d } = docGravando()
    const r = desenharCampo(d, { rotulo: 'CIDADE:', valor: 'SANTA CRUZ DO RIO PARDO (SP)', x: 0, y: 10, largura: 52, fonte: 8.5, minFonte: 6.5 })
    expect(r.linhas).toBe(1)
    expect(r.fonte).toBeLessThan(8.5)
  })
  it('texto que não cabe nem no mínimo termina com reticências, ainda dentro da largura', () => {
    const { d, escritos } = docGravando()
    desenharCampo(d, { rotulo: 'MOTOR:', valor: FINAME + FINAME, x: 20, y: 10, largura: 60, fonte: 7.5, minFonte: 6, maxLinhas: 2 })
    const valores = escritos.filter((e) => e.texto !== 'MOTOR:')
    expect(valores).toHaveLength(2)
    expect(valores[1].texto.endsWith('…')).toBe(true)
    for (const e of escritos) expect(e.x + e.largura).toBeLessThanOrEqual(80 + 0.01)
  })
  it('palavra enorme sem espaço também é contida', () => {
    const { d, escritos } = docGravando()
    desenharCampo(d, { rotulo: 'CPF/CNPJ:', valor: 'X'.repeat(200), x: 0, y: 10, largura: 40, fonte: 8.5 })
    for (const e of escritos) expect(e.x + e.largura).toBeLessThanOrEqual(40 + 0.01)
  })
})

describe('desenharBlocoTexto', () => {
  it('respeita largura e altura da caixa', () => {
    const { d, escritos } = docGravando()
    const texto = 'ENTRADA DE 30% E SALDO EM 12 PARCELAS PELO FINAME COM CARÊNCIA DE 6 MESES, ' .repeat(6)
    const r = desenharBlocoTexto(d, { texto, x: 130, y: 200, largura: 62, alturaMax: 11, fonte: 9, minFonte: 6 })
    for (const e of escritos) expect(e.x + e.largura).toBeLessThanOrEqual(192 + 0.01)
    expect(r.yFinal - 200).toBeLessThanOrEqual(11 + 0.01)
    expect(entrelinhaDe(r.fonte)).toBeGreaterThan(0)
  })
})
