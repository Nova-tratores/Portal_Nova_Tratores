// Contratos de empréstimo montados a partir das parcelas que já estão no Omie (José, 09/11/2026).
// O Omie não guarda o contrato: guarda cada parcela como uma conta a pagar da categoria "Pagamento de
// Empréstimos", com a numeração "x/total" (ex.: 003/024). As parcelas de um contrato têm a mesma empresa, o
// mesmo banco e o mesmo total; é essa a chave. Parcela avulsa (total 1) não é contrato e fica de fora.
// "Falta pagar" é a soma das parcelas em aberto, com o juro já embutido: não é o saldo devedor do banco.

export type ParcelaEmprestimo = {
  conta_omie: string
  nome_fornecedor: string | null
  numero_parcela: string | null
  data_vencimento: string
  valor_documento: number
  valor_pago: number
  /** já quitada (status derivado LIQUIDADO) */
  paga: boolean
}

export type Contrato = {
  id: string
  conta: string
  banco: string
  /** total de parcelas que a numeração diz ter */
  total: number
  /** parcelas que estão no Omie (pode ser menos que o total: o Omie só tem de 2023 para cá) */
  lancadas: number
  pagas: number
  abertas: number
  /** em aberto com vencimento antes de hoje */
  vencidas: number
  valorParcela: number
  faltaPagar: number
  primeira: string
  ultima: string
  proxima: { data: string; valor: number } | null
}

/** "003/024" → 24; sem numeração ou total 1 → 0 (não é contrato). */
export function totalDaNumeracao(numero: string | null | undefined): number {
  const m = String(numero || '').match(/\/\s*0*(\d+)\s*$/)
  const t = m ? Number(m[1]) : 0
  return t > 1 ? t : 0
}

export function montarContratos(parcelas: ParcelaEmprestimo[], hojeISO: string): Contrato[] {
  const grupos = new Map<string, ParcelaEmprestimo[]>()
  for (const p of parcelas) {
    const total = totalDaNumeracao(p.numero_parcela)
    if (!total) continue
    const chave = `${p.conta_omie}|${(p.nome_fornecedor || '').trim().toUpperCase()}|${total}`
    const l = grupos.get(chave)
    if (l) l.push(p)
    else grupos.set(chave, [p])
  }
  const out: Contrato[] = []
  for (const [id, l] of grupos) {
    l.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    const abertas = l.filter((p) => !p.paga)
    const resto = (p: ParcelaEmprestimo) => Math.max(0, (Number(p.valor_documento) || 0) - (Number(p.valor_pago) || 0))
    const prox = abertas.find((p) => p.data_vencimento >= hojeISO) || abertas[0] || null
    // valor da parcela: o que mais se repete (a primeira e a última às vezes vêm diferentes)
    const freq = new Map<number, number>()
    for (const p of l) { const v = Math.round((Number(p.valor_documento) || 0) * 100) / 100; freq.set(v, (freq.get(v) || 0) + 1) }
    const valorParcela = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0
    out.push({
      id,
      conta: l[0].conta_omie,
      banco: l[0].nome_fornecedor || 'Sem nome',
      total: totalDaNumeracao(l[0].numero_parcela),
      lancadas: l.length,
      pagas: l.length - abertas.length,
      abertas: abertas.length,
      vencidas: abertas.filter((p) => p.data_vencimento < hojeISO).length,
      valorParcela,
      faltaPagar: Math.round(abertas.reduce((s, p) => s + resto(p), 0) * 100) / 100,
      primeira: l[0].data_vencimento,
      ultima: l[l.length - 1].data_vencimento,
      proxima: prox ? { data: prox.data_vencimento, valor: resto(prox) } : null,
    })
  }
  // primeiro o que ainda tem a pagar, do maior para o menor; depois os quitados, do mais recente
  return out.sort((a, b) => (b.faltaPagar > 0 ? 1 : 0) - (a.faltaPagar > 0 ? 1 : 0) || b.faltaPagar - a.faltaPagar || b.ultima.localeCompare(a.ultima))
}
