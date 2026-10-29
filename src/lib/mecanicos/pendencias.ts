// Dinheiro parado do pós-vendas (José, 16/10/2026) — regras puras.
// Duas pendências de faturamento, para OS do portal que ainda NÃO faturaram (nem pelo portal
// nem pela nota do Omie), não canceladas e não internas:
//  - 'preenchida': o técnico já fez o relatório OU a OS já passou da execução (fases depois da
//    execução: relatório concluído, enviar/enviado Omie, cobrando cliente, garantia, concluída…)
//    → serviço feito esperando faturar.
//  - 'atrasada': a data prevista de execução já passou, a OS ainda está antes/durante a
//    execução e NÃO tem relatório → o técnico não preencheu (ou a OS não andou).
export type TipoPendencia = 'preenchida' | 'atrasada'

/** Fases em que o serviço já foi executado (falta faturar). */
export const FASES_POS_EXECUCAO = new Set([
  'Relatório Atualizado', 'Executada', 'Executada aguardando comercial', 'Relatório Concluído',
  'Enviar Omie', 'Enviado Para Omie', 'Cobrando Cliente', 'Preenchido Garantia', 'Concluída',
])
/** Fases antes/durante a execução. */
export const FASES_ATE_EXECUCAO = new Set([
  'Orçamento Aprovado', 'Execução', 'Execução (Realizando Diagnóstico)', 'Execução aguardando peças (em transporte)',
  'Aguardando outros', 'Aguardando ordem Técnico',
])

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Último dia de execução previsto (Dias_Execucao "a,b,c" ou Previsao_Execucao). */
export function ultimoDiaExecucao(o: { Dias_Execucao?: string | null; Previsao_Execucao?: string | null }): string | null {
  const lista = String(o.Dias_Execucao || '').split(',').map((s) => s.trim()).filter((s) => DIA.test(s)).sort()
  if (lista.length) return lista[lista.length - 1]
  return DIA.test(String(o.Previsao_Execucao || '')) ? String(o.Previsao_Execucao) : null
}

export function classificarPendencia(o: { Status?: string | null; Dias_Execucao?: string | null; Previsao_Execucao?: string | null },
  ctx: { faturada: boolean; interna: boolean; temRelatorio: boolean; hoje: string }): TipoPendencia | null {
  const st = String(o.Status || '').trim()
  if (ctx.faturada || ctx.interna || /cancel/i.test(st)) return null
  if (ctx.temRelatorio || FASES_POS_EXECUCAO.has(st)) return 'preenchida'
  if (FASES_ATE_EXECUCAO.has(st)) {
    const fim = ultimoDiaExecucao(o)
    if (fim && fim < ctx.hoje) return 'atrasada'
  }
  return null
}

export interface Pendencia {
  os: string
  tipo: TipoPendencia
  status: string
  cliente: string
  tecnicos: string[]
  /** data do relatório (preenchida) ou do último dia previsto de execução (atrasada) */
  dataRef: string | null
  dias: number
  maoDeObra: number
  deslocamento: number
  pecas: number
  total: number
  garantia: boolean
}

/** Faixas de idade (dias parado) para o gráfico. */
export const FAIXAS_IDADE: [string, number, number][] = [['até 7 dias', 0, 7], ['8 a 15', 8, 15], ['16 a 30', 16, 30], ['mais de 30', 31, 100000]]

export function resumoPendencias(lista: Pendencia[]) {
  const por = (t: TipoPendencia) => lista.filter((p) => p.tipo === t)
  const soma = (l: Pendencia[]) => ({ qtd: l.length, total: Math.round(l.reduce((s, p) => s + p.total, 0) * 100) / 100 })
  const idade = (l: Pendencia[]) => FAIXAS_IDADE.map(([rotulo, a, b]) => ({ rotulo, ...soma(l.filter((p) => p.dias >= a && p.dias <= b)) }))
  const porTecnico = new Map<string, { qtd: number; total: number }>()
  for (const p of lista) for (const t of p.tecnicos.length ? p.tecnicos : ['Sem técnico']) {
    const x = porTecnico.get(t) || { qtd: 0, total: 0 }
    x.qtd++; x.total += p.total / Math.max(1, p.tecnicos.length); porTecnico.set(t, x)
  }
  return {
    preenchida: { ...soma(por('preenchida')), idade: idade(por('preenchida')) },
    atrasada: { ...soma(por('atrasada')), idade: idade(por('atrasada')) },
    total: soma(lista),
    porTecnico: Object.fromEntries([...porTecnico.entries()].map(([k, v]) => [k, { qtd: v.qtd, total: Math.round(v.total * 100) / 100 }])),
  }
}

/** OS faturada para a própria montadora (Mahindra do Brasil, Kuhn…) é garantia, mesmo quando só existe no Omie e não tem
 *  o tipo de serviço do portal (José, 29/10/2026: "pq aqui tá pegando essa ordem da Mahindra ou da Kuhn, sendo que é garantia"). */
export const ehMontadora = (cliente: unknown) => /MAHINDRA\s+(DO\s+)?BRASIL|\bKUHN\b/i.test(String(cliente || ''))
