'use client'
// Área Pessoas do Financeiro (06/11/2026): uma aba por bloco na faixa (P1 Folha, P2 Benefícios, P3 Comissões,
// P4 Viagens e alimentação; ver areasFinanceiro.ts), cada uma no seu endereço. A tela fica no layout para o mês
// escolhido e os dados não se perderem ao trocar de aba; o PessoasCaixa lê o bloco do endereço.
import type { ReactNode } from 'react'
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import PessoasCaixa from '@/components/financeiro/caixa/PessoasCaixa'

export default function PessoasLayout({ children }: { children: ReactNode }) {
  return (
    <CaixaTela aba="pessoas">
      <PessoasCaixa />
      {children}
    </CaixaTela>
  )
}
