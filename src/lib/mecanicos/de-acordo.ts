// De acordo do técnico na comissão autorizada (05/11/2026) — PURO (cliente e servidor).
// Depois que o diretor autoriza, o técnico confere e assina "de acordo": no papel (folha impressa, fotografada e
// anexada) ou na tela. Se não concordar, fica o motivo. SQL: sql/comissao-de-acordo-tecnico.sql.
import { reaisPorExtenso } from '@/lib/recibos/extenso'

export type CienciaStatus = 'de_acordo' | 'contestou'
export type CienciaForma = 'papel' | 'tela'

/** Só comissão autorizada pelo diretor recebe o de acordo. */
export const aceitaCiencia = (p: { status: string; decidido_em?: string | null }) => ['espelhada', 'erro_rh'].includes(p.status) && !!p.decidido_em

/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" (o mesmo dos recibos do financeiro). */
export const valorPorExtenso = reaisPorExtenso

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** O texto que o técnico assina (vai no documento e na tela de assinar). */
export function textoDeAcordo(x: { nome: string; mes: string; comissao: number; liquido: number; temDescontos: boolean; pagamento?: string | null }): string {
  const mes = `${MESES[Number(x.mes.slice(5, 7)) - 1]} de ${x.mes.slice(0, 4)}`
  const pag = x.pagamento && /^\d{4}-\d{2}-\d{2}/.test(x.pagamento) ? `, a ser paga pela Nova Tratores por volta de ${x.pagamento.slice(8, 10)}/${x.pagamento.slice(5, 7)}/${x.pagamento.slice(0, 4)}` : ', a ser paga pela Nova Tratores'
  const liquido = x.temDescontos && Math.abs(x.liquido - x.comissao) > 0.005 ? ` Com os descontos acima, o líquido é de ${brl(x.liquido)} (${valorPorExtenso(x.liquido)}).` : ''
  return `Eu, ${x.nome}, declaro que conferi as ordens de serviço relacionadas neste documento e que estou de acordo com os valores, as decisões de cada ordem e os descontos, e com a comissão de ${mes} no valor de ${brl(x.comissao)} (${valorPorExtenso(x.comissao)})${pag}.${liquido} Recebi uma via deste documento.`
}

/** Valida o registro antes de gravar (rota e tela usam a mesma regra). */
export function validarCiencia(x: { acao: string; forma?: string; temArquivo?: boolean; temAssinatura?: boolean; nome?: string; motivo?: string }): string | null {
  if (x.acao === 'contestou') return String(x.motivo || '').trim().length >= 5 ? null : 'Escreva por que o técnico não concordou'
  if (x.acao !== 'de_acordo') return 'Ação inválida'
  if (!String(x.nome || '').trim()) return 'Falta o nome de quem assinou'
  if (x.forma === 'papel') return x.temArquivo ? null : 'Anexe a foto ou o PDF da folha assinada'
  if (x.forma === 'tela') return x.temAssinatura ? null : 'Falta a assinatura do técnico'
  return 'Escolha como o técnico assinou'
}
