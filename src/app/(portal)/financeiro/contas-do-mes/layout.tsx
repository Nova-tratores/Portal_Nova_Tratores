'use client'
// Área Contas do mês do Financeiro (06/11/2026): uma aba por bloco na faixa (F1 Fixas, F2 Impostos, F3 Bens e
// consórcios, F4 Marketing; ver areasFinanceiro.ts), cada uma no seu endereço. A tela fica no layout para o mês
// escolhido e os dados não se perderem ao trocar de aba.
import type { ReactNode } from 'react'
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import ContasDoMesCaixa from '@/components/financeiro/caixa/ContasDoMesCaixa'

export default function ContasDoMesLayout({ children }: { children: ReactNode }) {
  return (
    <CaixaTela aba="contas-do-mes">
      <ContasDoMesCaixa />
      {children}
    </CaixaTela>
  )
}
