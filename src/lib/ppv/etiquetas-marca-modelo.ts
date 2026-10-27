// Marca e modelo na etiqueta térmica do PPV (José, 27/10/2026): o usuário marca
// na janela de impressão se quer cada um. Vêm do espelho `produtos` (cadastro da
// Omie), que é esparso e cheio de "N/D" — valor vazio/N/D não sai na etiqueta.
// Lib pura (sem banco) — testada em __tests__/etiquetas-marca-modelo.test.ts.

export interface MarcaModelo { marca: string; modelo: string }

/** "", "N/D", "#N/D", "-", só zeros → vazio. */
export function valorUtil(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || /^#?n\/?d$/i.test(s) || /^-+$/.test(s) || /^0+$/.test(s)) return ''
  return s
}

/** Chave do mapa: CONTA (maiúscula) + código. */
export const chaveMM = (conta: unknown, codigo: unknown) => `${String(conta ?? '').trim().toUpperCase()}|${String(codigo ?? '').trim()}`

/** Linha da etiqueta: "MARCA KUHN · MODELO 6075E" (só o que foi pedido e existe). */
export function textoMarcaModelo(mm: MarcaModelo | undefined, pedir: { marca: boolean; modelo: boolean }): string {
  if (!mm) return ''
  const partes: string[] = []
  const marca = valorUtil(mm.marca)
  const modelo = valorUtil(mm.modelo)
  if (pedir.marca && marca) partes.push(`MARCA ${marca}`)
  if (pedir.modelo && modelo) partes.push(`MODELO ${modelo}`)
  return partes.join(' · ')
}
