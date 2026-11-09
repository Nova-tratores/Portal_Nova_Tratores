'use client'
// Área Compras do Financeiro (09/11/2026): abas C1 a C6 na tela comum das áreas de blocos. A tela fica no layout
// para o mês escolhido e os dados não se perderem ao trocar entre os blocos.
import type { ReactNode } from 'react'
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import ComprasCaixa from '@/components/financeiro/caixa/ComprasCaixa'

export default function ComprasLayout({ children }: { children: ReactNode }) {
  return (
    <CaixaTela aba="compras">
      <ComprasCaixa />
      {children}
    </CaixaTela>
  )
}
