'use client'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useRouter } from 'next/navigation'
import SemPermissao from '@/components/SemPermissao'
import MenuAreasFinanceiro from '@/components/financeiro/MenuAreasFinanceiro'
import { temAlgumaAba } from '@/components/financeiro/areasFinanceiro'

export default function FinanceiroEntryPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, isDev, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()
  // Menu de áreas (José, 06/11/2026) para quem tem alguma aba do Financeiro no Admin (10/11/2026; antes: Dev ou
  // função Financeiro); os outros seguem para o Kanban deles
  const menuAreas = isDev || temAlgumaAba(pode)

  useEffect(() => {
    if (loading || loadingPerm || !userProfile) return
    if (!temAcesso('financeiro') || menuAreas) return
    // Entra pelo Kanban: a aba Painel saiu da faixa (José, 05/11/2026); as páginas home-* seguem para os links de card (?id=)
    if (userProfile.funcao === 'Financeiro') {
      router.replace('/financeiro/kanban-financeiro')
    } else if (userProfile.funcao === 'Peças') {
      router.replace('/financeiro/kanban-pecas')
    } else {
      router.replace('/financeiro/kanban')
    }
  }, [userProfile, loading, loadingPerm, router, temAcesso, menuAreas])

  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) {
    return <SemPermissao />
  }
  if (!loading && !loadingPerm && userProfile && menuAreas) return <MenuAreasFinanceiro comNotas={pode('financeiro', 'notas')} />


  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando...</p>
    </div>
  )
}
