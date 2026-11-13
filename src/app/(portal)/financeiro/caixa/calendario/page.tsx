'use client'
// Calendário do Caixa (13/11/2026): a mesma tela do Calendário do DRE (Mês / Ano / Lista), com a empresa do topo
// do Financeiro. Substituiu o visual "um dia por vez" (CalendarioCaixa, no git).
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import Calendario from '@/components/dre-financeiro/Calendario'

export default function CaixaCalendarioPage() {
  return <CaixaTela aba="calendario"><Calendario variante="caixa" /></CaixaTela>
}
