'use client'
// Página de TESTE do Centro do Pós-Vendas (José, 17/10/2026): opções de tela com os dados reais
// para ele escolher antes de mudar o Painel. Mesma permissão do /mecanicos.
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import LaboratorioVivo from '@/components/mecanicos/LaboratorioVivo'

export default function MecanicosTestePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  return <LaboratorioVivo />
}
