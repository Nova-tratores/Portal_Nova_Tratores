'use client'
// Baixar contas do Caixa: a MESMA tela do /ajustes/baixa-contas (mesma permissão 'ajustes:baixa-contas'),
// com a escolha de conta Nova/Castro/Todas do Ajustes.
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import { ContaProvider } from '@/components/estoque/ContaProvider'
import EstResponsiveStyles from '@/components/estoque/ResponsiveStyles'
import BaixaContas from '@/app/(portal)/ajustes/baixa-contas/page'

export default function CaixaBaixarContasPage() {
  return (
    <CaixaTela aba="baixar-contas">
      <ContaProvider>
        <EstResponsiveStyles />
        <BaixaContas />
      </ContaProvider>
    </CaixaTela>
  )
}
