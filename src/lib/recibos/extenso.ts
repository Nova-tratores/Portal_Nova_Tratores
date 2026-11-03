// Valor em reais por extenso (recibos): 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos".
// Puro, sem dependência — testado em __tests__/extenso.test.ts.

const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos',
  'oitocentos', 'novecentos']
const ESCALA: [string, string][] = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']]

/** 0–999 por extenso ("" para 0). */
function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const partes: string[] = []
  if (c) partes.push(CEM[c])
  if (r) partes.push(r < 20 ? UNI[r] : [DEZ[Math.floor(r / 10)], UNI[r % 10]].filter(Boolean).join(' e '))
  return partes.join(' e ')
}

/** Inteiro por extenso ("zero" para 0). */
export function inteiroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const grupos: number[] = []
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000)
  const partes: { txt: string; g: number }[] = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (!g) continue
    // "mil" sozinho (não "um mil")
    const base = i === 1 && g === 1 ? '' : ate999(g)
    const nome = ESCALA[i][g === 1 ? 0 : 1]
    partes.push({ txt: [base, nome].filter(Boolean).join(' '), g })
  }
  // Liga com "e" o último grupo quando ele é < 100 ou centena redonda (1.100 → "mil e cem"); senão vírgula.
  return partes.map((p, i) => {
    if (i === 0) return p.txt
    const ultimo = i === partes.length - 1
    const usaE = ultimo && (p.g < 100 || p.g % 100 === 0)
    return (usaE ? ' e ' : ', ') + p.txt
  }).join('')
}

/** Valor em reais por extenso. Arredonda para centavos. */
export function reaisPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(Number(valor) || 0) * 100)
  const reais = Math.floor(centavosTotal / 100)
  const cent = centavosTotal % 100
  const partes: string[] = []
  if (reais > 0) {
    const txt = inteiroPorExtenso(reais)
    // "um milhão de reais", "dois milhões de reais" (grupo de milhar e unidade zerados)
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : ''
    partes.push(`${txt}${de} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (cent > 0) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`)
  if (!partes.length) return 'zero real'
  return partes.join(' e ')
}
