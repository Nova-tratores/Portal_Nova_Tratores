// Chave NF-e (44 dígitos) — validação e decomposição PURAS (sem 'use client':
// usadas no browser pelo leitor de anexos E no servidor pelo rastreio de notas).
//
// Layout: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)

/** cUF é código IBGE de UF válido e modelo é NF-e (55) ou NFC-e (65). */
export function ehChaveNFeValida(digitos44: string): boolean {
  const cand = String(digitos44 || '')
  if (!/^\d{44}$/.test(cand)) return false
  const cUF = cand.slice(0, 2)
  const mod = cand.slice(20, 22)
  return /^(1[1-7]|2[1-9]|3[1-5]|4[1-3]|5[0-3])/.test(cUF) && (mod === '55' || mod === '65')
}

/** Acha a primeira chave NF-e válida embutida num texto (janela deslizante de 44 dígitos). */
export function acharChaveNFe(textoOuDigitos: string): string {
  const limpo = String(textoOuDigitos || '').replace(/\D/g, '')
  for (let i = 0; i <= limpo.length - 44; i++) {
    const cand = limpo.slice(i, i + 44)
    if (ehChaveNFeValida(cand)) return cand
  }
  return ''
}

export interface PartesChaveNFe {
  cUF: string
  aamm: string
  cnpjEmitente: string
  modelo: string
  serie: string
  /** número da nota (9 dígitos, com zeros à esquerda) */
  nNF: string
}

/** Decompõe a chave em partes (não valida — use ehChaveNFeValida antes). */
export function partesChaveNFe(chave: string): PartesChaveNFe {
  const c = String(chave || '')
  return {
    cUF: c.slice(0, 2),
    aamm: c.slice(2, 6),
    cnpjEmitente: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: c.slice(22, 25),
    nNF: c.slice(25, 34),
  }
}
