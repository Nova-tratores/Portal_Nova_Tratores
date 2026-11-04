// Trava da regravação do pós-vendas (José, 03/11/2026, depois das peças zeradas de 30/10: uma consulta cortada
// gravou peças 0 em vários meses e ninguém viu até olhar a tela). Antes de regravar posvendas_os, compara mês a mês
// o que já está gravado com o que vai entrar: se um mês com movimento cai de uma vez, aquele mês NÃO é regravado
// (fica o que estava) e o T.I. é avisado. Conta pura, sem banco (testada em __tests__/trava-queda.test.ts).

export interface LinhaValor { data: string; bruto: number; pecas: number }
export interface QuedaMes { mes: string; campo: 'total' | 'peças'; antes: number; depois: number; queda: number }

/** Mês só entra na conta com pelo menos este valor gravado (meses fracos oscilam à toa). */
export const MINIMO_MES = 5000
/** Queda a partir da qual o mês trava (0,2 = caiu 20% ou mais). */
export const QUEDA_MAXIMA = 0.2

const r2 = (n: number) => Math.round(n * 100) / 100

function porMes(linhas: LinhaValor[]) {
  const m = new Map<string, { total: number; pecas: number }>()
  for (const l of linhas) {
    const k = String(l.data).slice(0, 7)
    const x = m.get(k) || { total: 0, pecas: 0 }
    x.total += (Number(l.bruto) || 0) + (Number(l.pecas) || 0)
    x.pecas += Number(l.pecas) || 0
    m.set(k, x)
  }
  return m
}

/** Meses (YYYY-MM) em que o total ou as peças cairiam QUEDA_MAXIMA ou mais. */
export function mesesComQueda(antes: LinhaValor[], depois: LinhaValor[]): QuedaMes[] {
  const a = porMes(antes), d = porMes(depois)
  const out: QuedaMes[] = []
  for (const [mes, x] of a) {
    const y = d.get(mes) || { total: 0, pecas: 0 }
    for (const [campo, va, vd] of [['total', x.total, y.total], ['peças', x.pecas, y.pecas]] as const) {
      if (va < MINIMO_MES) continue
      const queda = (va - vd) / va
      if (queda >= QUEDA_MAXIMA) { out.push({ mes, campo, antes: r2(va), depois: r2(vd), queda: Math.round(queda * 1000) / 10 }); break }
    }
  }
  return out.sort((p, q) => p.mes.localeCompare(q.mes))
}
