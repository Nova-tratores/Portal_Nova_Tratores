'use client'
// Área Banco do Financeiro (06/11/2026): abas B1 Empréstimos, B2 Antecipações, B4 Tarifas e multas (tela comum
// das áreas de blocos) e Contas correntes (B3 caixas e cartão, B4 transferências, B5 saldo). A tela fica no layout
// para o mês escolhido e os dados não se perderem ao trocar entre os blocos.
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import BancoCaixa from '@/components/financeiro/caixa/BancoCaixa'
import ContasCorrentesCaixa from '@/components/financeiro/caixa/ContasCorrentesCaixa'

export default function BancoLayout({ children }: { children: ReactNode }) {
  const contasCorrentes = usePathname()?.startsWith('/financeiro/banco/contas-correntes')
  return (
    <CaixaTela aba="banco">
      {contasCorrentes ? <ContasCorrentesCaixa /> : <BancoCaixa />}
      {children}
    </CaixaTela>
  )
}
