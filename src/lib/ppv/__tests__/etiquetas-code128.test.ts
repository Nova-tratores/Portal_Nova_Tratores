import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { code128Svg, codewords128, qrSvg } from '../etiquetas-html'

// Faz o papel do LEITOR: reconstrói o texto a partir dos code words, do mesmo
// jeito que uma pistola de balcão faria. Barcode que "encolheu" mas lê errado
// seria pior que barcode largo — por isso todo código real passa por aqui.
function decodificar(codes: number[]): string {
  const START_B = 104, START_C = 105
  let modo: 'B' | 'C' = codes[0] === START_C ? 'C' : 'B'
  expect([START_B, START_C]).toContain(codes[0])
  let texto = ''
  for (let k = 1; k < codes.length - 2; k++) { // fora checksum e stop
    const v = codes[k]
    // 99 e 100 dependem do MODO: em B, 99 = "vai pra C"; em C, 99 é o dado
    // "99" e 100 = "vai pra B". Ler isso errado embaralharia o código.
    if (modo === 'B' && v === 99) { modo = 'C'; continue }
    if (modo === 'C' && v === 100) { modo = 'B'; continue }
    texto += modo === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32)
  }
  return texto
}

function checksumOk(codes: number[]): boolean {
  let soma = codes[0]
  for (let k = 1; k < codes.length - 2; k++) soma += codes[k] * k
  return soma % 103 === codes[codes.length - 2]
}

// códigos reais das etiquetas da oficina (dos prints do usuário)
const REAIS = [
  'RP-E007702564C91', 'RP-007544796V91', 'RP-005555207R1', 'RP-006517047Y1',
  'RA-107372', '007700122D91', 'RP-000020381E05', 'RP-E007701298D91',
  'RP-006051333C91', 'RP-000060516M01', 'RP-007220902U91', 'RP-006005618F4',
  'RP-000013499P04', 'CP-006051333C91', 'RP-007209385C92',
]

describe('code128 (subsets B + C)', () => {
  it('todo código real volta idêntico na leitura, com checksum válido', () => {
    for (const cod of REAIS) {
      const codes = codewords128(cod)
      expect(codes[codes.length - 1], `stop de ${cod}`).toBe(106)
      expect(checksumOk(codes), `checksum de ${cod}`).toBe(true)
      expect(decodificar(codes), `leitura de ${cod}`).toBe(cod)
    }
  })

  it('casos de borda também leem certo', () => {
    for (const cod of ['12345678', '1234567', 'A1', 'ABC', '0', '00', 'RP-1', '9'.repeat(20), 'AB-12345-CD']) {
      const codes = codewords128(cod)
      expect(checksumOk(codes), `checksum de ${cod}`).toBe(true)
      expect(decodificar(codes), `leitura de ${cod}`).toBe(cod)
    }
  })

  it('o modo numérico encurta mesmo a barra (é o objetivo)', () => {
    // 8 dígitos seguidos: em B seriam 8 símbolos, em C viram 4
    const sóDigitos = codewords128('00770201')
    expect(sóDigitos[0]).toBe(105) // start C
    expect(sóDigitos.length).toBe(1 + 4 + 2) // start + 4 pares + checksum + stop

    // código real: nunca pode ficar MAIOR que o B puro (1 símbolo por char)
    for (const cod of REAIS) {
      const bPuro = 1 + cod.length + 2
      expect(codewords128(cod).length, `${cod} não pode inchar`).toBeLessThanOrEqual(bPuro)
    }
    // e no caso típico encurta de verdade
    expect(codewords128('007700122D91').length).toBeLessThan(1 + '007700122D91'.length + 2)
  })

  it('texto vazio não gera barra', () => {
    expect(codewords128('')).toEqual([])
    expect(code128Svg('', 5)).toBe('')
  })

  it('SVG sai com viewBox coerente com os módulos', () => {
    const svg = code128Svg('RA-107372', 5)
    const m = svg.match(/viewBox="0 0 (\d+) 10"/)
    expect(m).toBeTruthy()
    const modulos = Number(m![1])
    // start+dados+checksum = 11 módulos cada, stop = 13, + 2 módulos de folga
    // em cada lado (a quiet zone de verdade é o branco da etiqueta em volta)
    const codes = codewords128('RA-107372')
    expect(modulos).toBe((codes.length - 1) * 11 + 13 + 4)
  })

  it('barra dos códigos reais cabe na etiqueta com módulo legível', () => {
    // largura útil = etiqueta 66,675mm − 3,4mm de área de segurança de cada lado
    const UTIL = 66.675 - 3.4 * 2
    for (const cod of REAIS) {
      const modulos = (codewords128(cod).length - 1) * 11 + 13 + 4
      const moduloReal = Math.min(0.33, UTIL / modulos)
      // 0,25mm é o piso prático de leitura; abaixo disso a pistola sofre
      expect(moduloReal, `módulo de ${cod}`).toBeGreaterThanOrEqual(0.25)
    }
  })

  it('na etiqueta com QR a barra PRECISA da largura inteira', () => {
    // Etiqueta rastreada com os dois códigos. Se a barra dividisse a linha com
    // o QR (13mm + 2mm de zona de silêncio), o código mais longo cairia pra
    // ~0,23mm/módulo — abaixo do piso de leitura. Por isso o layout põe a barra
    // ATRAVESSADA embaixo e o QR ao lado só do texto: aqui ela vale os 59,9mm.
    const ESPREMIDA = 66.675 - 3.4 * 2 - 13 - 2
    const INTEIRA = 66.675 - 3.4 * 2
    const pior = Math.max(...REAIS.map(c => (codewords128(c).length - 1) * 11 + 13 + 4))
    expect(ESPREMIDA / pior, 'motivo do layout: espremida reprova').toBeLessThan(0.25)
    for (const cod of REAIS) {
      const modulos = (codewords128(cod).length - 1) * 11 + 13 + 4
      expect(Math.min(0.33, INTEIRA / modulos), `módulo de ${cod}`).toBeGreaterThanOrEqual(0.25)
    }
  })
})

describe('qr em svg preenchido', () => {
  const matriz = (texto: string) => QRCode.create(texto, { errorCorrectionLevel: 'M' }).modules

  it('desenha com FILL e nunca com stroke (stroke sai lavado na impressora)', () => {
    const svg = qrSvg(matriz('https://portal.exemplo/p/8f1c2d62-de35-4187-a26f-ee31a60f411a'))
    expect(svg).toContain('fill="#000"')
    expect(svg).not.toContain('stroke')
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('o desenho bate MÓDULO A MÓDULO com a matriz do QR', () => {
    // faz o papel do leitor: remonta a matriz a partir do path e compara. Um QR
    // com um módulo trocado ainda "parece" um QR — e não abre a página da peça.
    for (const texto of ['https://portal.exemplo/p/8f1c2d62-de35-4187-a26f-ee31a60f411a', 'https://p.ex/p/1', 'X']) {
      const m = matriz(texto)
      const svg = qrSvg(m)
      const n = m.size
      expect(svg, `viewBox de ${texto}`).toContain(`viewBox="0 0 ${n} ${n}"`)

      const lido = new Uint8Array(n * n)
      const re = /M(\d+) (\d+)h(\d+)v1h-\d+z/g
      let achado: RegExpExecArray | null
      while ((achado = re.exec(svg)) !== null) {
        const [x, y, w] = [Number(achado[1]), Number(achado[2]), Number(achado[3])]
        for (let i = 0; i < w; i++) lido[y * n + x + i] = 1
      }
      for (let i = 0; i < n * n; i++) {
        expect(lido[i], `módulo ${i % n},${Math.floor(i / n)} de ${texto}`).toBe(m.data[i] ? 1 : 0)
      }
    }
  })

  it('matriz vazia não gera svg', () => {
    expect(qrSvg(null)).toBe('')
    expect(qrSvg({ size: 0, data: [] })).toBe('')
  })
})
