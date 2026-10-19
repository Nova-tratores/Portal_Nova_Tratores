// Previsão da COMISSÃO do técnico (José, 17/10/2026) — mesma regra do painel do Omie
// (SistemaCompletoOmie, dashboard-vendedor), que é de onde o RH importa a comissão:
//   - OS faturada (normal, garantia, revisão) e OS interna/cortesia: % do técnico
//     (config_vendedores_relatorio.comissao) sobre o valor das HORAS, dividido entre os técnicos;
//   - entrega técnica / montagem / demonstração: valor FIXO pelo contrato (150; carreta 250;
//     montagem de desligamento 400; montagem que não é de quadriciclo 500), dividido entre os técnicos;
//   - OS preenchida esperando faturar = comissão "a caminho" (entra quando faturar).
// O valor oficial continua sendo o do RH (aprovado); aqui é previsão. Puro — testado.
import type { InternaFechada, OSFaturada } from './painel'
import type { Pendencia } from './pendencias'

function diasUteis(de: string, ate: string): number {
  let n = 0
  for (let d = de; d <= ate; ) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w >= 1 && w <= 5) n++
    const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10)
  }
  return n
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Valor fixo da comissão pelo contrato (null = é por % das horas). */
export function comissaoFixa(contrato: string): number | null {
  const c = norm(contrato)
  if (!['MONTAGEM', 'ENTREGA', 'DEMONSTRACAO'].some((t) => c.includes(t))) return null
  if (c.includes('CARRETA')) return 250
  if (c.includes('MONTAGEM') && c.includes('DESLIGAMENT')) return 400
  if (c.includes('MONTAGEM') && !c.includes('QUAD')) return 500
  return 150
}

export interface ComissaoMes { faturadas: number; internas: number; total: number; aguardando: number; qtdOS: number }
const vazio = (): ComissaoMes => ({ faturadas: 0, internas: 0, total: 0, aguardando: 0, qtdOS: 0 })

/**
 * Comissão calculada por técnico no período [de, ate]. `pct` = % de cada técnico (nome do painel).
 * `pendencias` (opcional) entram como "aguardando" — só faz sentido para o mês atual.
 */
export function calcularComissoes(
  de: string, ate: string, pct: Record<string, number>,
  faturadas: OSFaturada[], internas: (InternaFechada & { valorHoras?: number })[], pendencias: Pendencia[] = [],
): Record<string, ComissaoMes> {
  const out: Record<string, ComissaoMes> = {}
  const linha = (t: string) => (out[t] ||= vazio())
  for (const o of faturadas) {
    if (o.data < de || o.data > ate || !o.tecnicos.length) continue
    for (const t of o.tecnicos) {
      if (!pct[t]) continue
      const l = linha(t)
      l.faturadas += (o.servico / o.tecnicos.length) * (pct[t] / 100); l.qtdOS += 1 / o.tecnicos.length
    }
  }
  for (const x of internas) {
    if (x.data < de || x.data > ate || !x.tecnicos.length) continue
    const fixa = comissaoFixa(x.contrato)
    for (const t of x.tecnicos) {
      if (!pct[t] && fixa == null) continue
      const l = linha(t)
      l.internas += fixa != null ? fixa / x.tecnicos.length : ((x.valorHoras ?? 0) / x.tecnicos.length) * (pct[t] / 100)
      l.qtdOS += 1 / x.tecnicos.length
    }
  }
  for (const p of pendencias) {
    if (p.tipo !== 'preenchida' || !p.tecnicos.length) continue
    for (const t of p.tecnicos) if (pct[t]) linha(t).aguardando += (p.maoDeObra / p.tecnicos.length) * (pct[t] / 100)
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const l of Object.values(out)) {
    l.faturadas = r2(l.faturadas); l.internas = r2(l.internas); l.total = r2(l.faturadas + l.internas); l.aguardando = r2(l.aguardando); l.qtdOS = Math.round(l.qtdOS * 10) / 10
  }
  return out
}

/** Projeção do mês em andamento: o ritmo dos dias úteis que passaram levado até o fim do mês. */
export function projetarMes(valor: number, mes: string, hoje: string): number {
  const [a, m] = mes.split('-').map(Number)
  const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
  if (hoje >= fim) return valor
  const passados = diasUteis(`${mes}-01`, hoje), total = diasUteis(`${mes}-01`, fim)
  return passados > 0 ? Math.round((valor / passados) * total * 100) / 100 : valor
}

/** O Omie paga a comissão do mês por volta do dia 20 do mês seguinte (ago: 21/08; set: 22/09). */
export function previsaoPagamento(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  return `${prox}-20`
}
