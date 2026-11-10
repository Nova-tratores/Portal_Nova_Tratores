'use client'
// Moldura das telas de contas que saíram do Ajustes para o Financeiro (09/11/2026): Correção de contas,
// Baixar contas e Boletos de fornecedor, na área Caixa. Faixa do Financeiro + a escolha de conta
// do topo (ContaProvider com conta FIXA = o NOVA/CASTRO do topo, 10/11/2026: antes havia duas escolhas de empresa na
// tela — a do topo e a "Conta" do Ajustes; o "Todas" saiu, como no resto do Financeiro). SEM o bloqueio "só Dev e função Financeiro" do CaixaTela:
// cada tela continua checando a própria permissão de sempre (ajustes:correcao-contas, ajustes:baixa-contas,
// ajustes:boletos-fornecedor), então ninguém perdeu nem ganhou acesso com a mudança de endereço.
import type { ReactNode } from 'react'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { ContaProvider } from '@/components/estoque/ContaProvider'
import EstResponsiveStyles from '@/components/estoque/ResponsiveStyles'
import { useEmpresaFinanceiro } from '@/components/financeiro/empresaFinanceiro'

export default function TelaContas({ children }: { children: ReactNode }) {
  const [empresa] = useEmpresaFinanceiro()
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <ContaProvider fixa={empresa === 'castro' ? 'CASTRO' : 'NOVA'}>
        <EstResponsiveStyles />
        <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: 'var(--portal-text, #0f172a)' }}>{children}</div>
      </ContaProvider>
    </div>
  )
}
