// O tempário Mahindra veio do PDF sem acento ("Eletrico", "Transmissao", "Reinstalaçao"). Só para MOSTRAR:
// o dado gravado fica igual (a busca já ignora acento). José, 06/11/2026.

// raiz sem acento → com acento; casa a palavra inteira com a terminação (o/a/os/as) que vier
const RAIZES: [string, string][] = [
  ['hidraulic', 'hidráulic'], ['eletric', 'elétric'], ['eletronic', 'eletrônic'], ['elétronic', 'eletrônic'], ['automatic', 'automátic'],
  ['mecanic', 'mecânic'], ['quimic', 'químic'], ['tecnic', 'técnic'], ['periferic', 'periféric'], ['esferic', 'esféric'],
  ['magnetic', 'magnétic'], ['acustic', 'acústic'], ['termostatic', 'termostátic'], ['hidrostatic', 'hidrostátic'],
  ['intermediari', 'intermediári'], ['planetari', 'planetári'], ['unitari', 'unitári'], ['primari', 'primári'], ['prioritari', 'prioritári'],
  ['diagnostic', 'diagnóstic'], ['unic', 'únic'],
]
const PALAVRAS: Record<string, string> = {
  valvula: 'válvula', valvulas: 'válvulas', combustivel: 'combustível', extensivel: 'extensível', fusivel: 'fusível', nivel: 'nível',
  circulo: 'círculo', rotula: 'rótula', oleo: 'óleo', agua: 'água',
}

/** Mantém a 1ª letra maiúscula (ou tudo maiúsculo) como veio. */
function comCaixa(original: string, nova: string): string {
  if (original === original.toUpperCase() && original.length > 1) return nova.toUpperCase()
  if (original[0] === original[0].toUpperCase()) return nova.charAt(0).toUpperCase() + nova.slice(1)
  return nova
}

function acentuarPalavra(p: string): string {
  const b = p.toLowerCase()
  let n = PALAVRAS[b]
  if (!n) {
    const r = RAIZES.find(([sem]) => new RegExp(`^${sem}(o|a|os|as)$`).test(b))
    if (r) n = r[1] + b.slice(r[0].length)
  }
  // -çao/-cao → -ção, -çoes/-coes → -ções, -sao → -são (transmissao, pressao, revisao, suspensao…)
  if (!n && /[çc]ao$/.test(b)) n = b.replace(/[çc]ao$/, 'ção')
  if (!n && /[çc]oes$/.test(b)) n = b.replace(/[çc]oes$/, 'ções')
  if (!n && /[^s]ssao$|[nr]sao$|visao$|pansao$|tensao$/.test(b)) n = b.replace(/sao$/, 'são')
  return n ? comCaixa(p, n) : p
}

export function acentuar(texto: string): string
export function acentuar(texto: string | null | undefined): string | null | undefined
export function acentuar(texto: string | null | undefined) {
  if (!texto) return texto
  return texto.replace(/[A-Za-zÀ-ÿ]+/g, acentuarPalavra)
}
