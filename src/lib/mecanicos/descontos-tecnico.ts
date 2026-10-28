// Descontos do técnico lançados junto com a comissão (José, 20/10/2026) — PURO (tela e servidor usam).
// Igual ao RH: o desconto não mexe na comissão, vira desconto em folha ("pendente de aprovação"), parcelado em
// até 12 vezes, uma parcela por mês; parcelas iguais e a última fica com os centavos.

export interface DescontoPedido {
  tipo: 'requisicao' | 'outro'
  /** nº da requisição (quando tipo = requisicao) */
  ref?: string | null
  descricao: string
  /** valor TOTAL do desconto */
  valor: number
  /** em quantas vezes (1–12) */
  parcelas?: number
  /** mês da 1ª parcela (YYYY-MM) */
  inicio?: string | null
}
export interface Parcela { mes: string; valor: number; n: number; de: number }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
export const somarMes = (m: string, k: number) => { const abs = Number(m.slice(5, 7)) - 1 + k; const a = Number(m.slice(0, 4)) + Math.floor(abs / 12); return `${a}-${String(((abs % 12) + 12) % 12 + 1).padStart(2, '0')}` }
export const qtdParcelas = (x: { parcelas?: number }) => Math.min(12, Math.max(1, Math.floor(Number(x.parcelas) || 1)))

export function parcelasDoDesconto(x: DescontoPedido, mesPadrao: string): Parcela[] {
  const qtd = qtdParcelas(x)
  const base = Math.round((x.valor / qtd) * 100) / 100
  const ultima = Math.round((x.valor - base * (qtd - 1)) * 100) / 100
  const ini = /^\d{4}-\d{2}$/.test(String(x.inicio || '')) ? String(x.inicio) : mesPadrao
  return Array.from({ length: qtd }, (_, i) => ({ mes: somarMes(ini, i), valor: i === qtd - 1 ? ultima : base, n: i + 1, de: qtd }))
}

/** Onde está o pagamento: quantas parcelas já passaram (mês anterior ao atual), quanto falta e quando termina. */
export function situacaoDesconto(x: DescontoPedido, mesPadrao: string, mesHoje: string) {
  const ps = parcelasDoDesconto(x, mesPadrao)
  const pagas = ps.filter((p) => p.mes < mesHoje)
  const falta = ps.filter((p) => p.mes >= mesHoje)
  return {
    parcelas: ps, pagas: pagas.length, total: ps.length,
    pago: Math.round(pagas.reduce((a, p) => a + p.valor, 0) * 100) / 100,
    falta: Math.round(falta.reduce((a, p) => a + p.valor, 0) * 100) / 100,
    primeiro: ps[0].mes, ultimo: ps[ps.length - 1].mes, quitado: falta.length === 0,
  }
}

/** "3x de R$ 40,00 · nov/26 a jan/27" */
export function resumoParcelas(x: DescontoPedido, mesPadrao: string): string {
  const ps = parcelasDoDesconto(x, mesPadrao)
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return ps.length === 1 ? `1x de ${brl(ps[0].valor)} · ${mesCurto(ps[0].mes)}` : `${ps.length}x de ${brl(ps[0].valor)} · ${mesCurto(ps[0].mes)} a ${mesCurto(ps[ps.length - 1].mes)}`
}

/** % da comissão do técnico que vai para a caixinha (RH: lib/caixinha.ts PCT_CAIXINHA). */
export const PCT_CAIXINHA = 1
export const caixinhaDe = (valor: number) => (valor > 0 ? Math.round(valor * PCT_CAIXINHA) / 100 : 0)
/** A conta do pagamento, igual ao documento assinado: comissão − 1ª parcela de cada desconto − caixinha = líquido. */
export function contaDoPagamento(valor: number, descontos: DescontoPedido[] | null | undefined) {
  const primeira = (x: DescontoPedido) => Math.round((x.valor / qtdParcelas(x)) * 100) / 100
  const desc = Math.round((descontos || []).reduce((a, x) => a + primeira(x), 0) * 100) / 100
  const caixinha = caixinhaDe(valor)
  return { comissao: valor, descontos: desc, caixinha, liquido: Math.round((valor - desc - caixinha) * 100) / 100 }
}
