// Regras PURAS do vínculo peça liberada → PPV da OS (sem import de servidor,
// pra rodar no vitest em ambiente node — mesmo motivo de ppv-conferencia.ts).

import { PPV_STATUS_TERMINAIS } from './ppv-conferencia'

/** Códigos equivalentes da peça: o cadastro ora tem o prefixo RP-, ora não. */
export function variantesDeCodigo(codigo: string): string[] {
  const base = String(codigo || '').trim()
  if (!base) return []
  const semRp = base.replace(/^RP-/i, '')
  return [...new Set([base, semRp, `RP-${semRp}`])]
}

/** PPVs de uma OS, na ordem em que estão gravados (a coluna é CSV). */
export function ppvsDaOS(idPpvCsv: unknown): string[] {
  return String(idPpvCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Qual PPV recebe a peça.
 *
 * Pedido já FATURADO ou em status terminal não serve: acrescentar item nele
 * criaria peça vendida sem nota — o erro exatamente oposto ao que esta função
 * existe pra evitar. Sem nenhum aberto, o chamador cria um novo, que é o que a
 * tela da OS já faz quando a OS fecha sem PPV.
 */
export function escolherPpvAberto(
  ids: string[],
  status: Map<string, { status: string | null; faturado: boolean }>,
): string | null {
  for (const id of ids) {
    const s = status.get(id)
    if (!s) continue                                              // PPV citado na OS que não existe mais
    if (s.faturado) continue
    if (PPV_STATUS_TERMINAIS.includes(String(s.status || ''))) continue
    return id
  }
  return null
}
