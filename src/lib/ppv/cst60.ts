// Regra pura (sem banco) do imposto das peças em CST 60 — usada por garantirCst60 (lib/ppv/omie.ts).
type Bloco = Record<string, unknown>

/**
 * Imposto do item com o ICMS em CST 60 nos TRÊS lugares em que o Omie guarda (icms, icms_st e icms_efet), base e
 * valor do ICMS zerados — igual às peças que o Omie aceita. Trocar só o `icms` não bastava: na 845YPF do PPV-0498
 * (22/10/2026) o icms_st seguia "51", o icms_efet nem existia e a base era 600, e o Omie voltava tudo para 51.
 */
export function impostoCst60(impostoCru: Record<string, Bloco>, cst = '60'): Record<string, Bloco> {
  const imp: Record<string, Bloco> = { ...impostoCru }
  const icms: Bloco = { ...(imp.icms || {}), cod_sit_trib_icms: cst, aliq_icms: 0, base_icms: 0, valor_icms: 0 }
  imp.icms = icms
  if (imp.icms_st && Object.keys(imp.icms_st).length) imp.icms_st = { ...imp.icms_st, cod_sit_trib_icms_st: cst }
  const efet: Bloco = imp.icms_efet || {}
  imp.icms_efet = {
    aliq_icms_efet: 0, base_icms_efet: 0, perc_red_base_icms_efet: 0, valor_icms_efet: 0,
    ...efet,
    cod_sit_trib_icms_efet: cst,
    modalidade_icms_efet: (efet.modalidade_icms_efet as string) || (icms.modalidade_icms as string) || '3',
    origem_icms_efet: (efet.origem_icms_efet as string) ?? (icms.origem_icms as string) ?? '0',
  }
  return imp
}

/**
 * CFOP para item que veio VAZIO no pedido (José, 22/10/2026 — PPV-0505: "O CFOP do produto RA-1900039331410 não está
 * preenchido" e o Omie não faturava): o mais usado nos outros itens do mesmo pedido; sem nenhum, 5.102.
 */
export function cfopPadrao(det: Array<{ produto?: { cfop?: unknown } }>, reserva = '5.102'): string {
  const conta = new Map<string, number>()
  for (const d of det) { const c = String(d.produto?.cfop ?? '').trim(); if (c) conta.set(c, (conta.get(c) || 0) + 1) }
  let melhor = '', n = 0
  for (const [c, q] of conta) if (q > n) { melhor = c; n = q }
  return melhor || reserva
}
export const semCfop = (d: { produto?: { cfop?: unknown } }) => !String(d.produto?.cfop ?? '').trim()
