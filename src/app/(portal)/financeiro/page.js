'use client'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useRouter } from 'next/navigation'
import SemPermissao from '@/components/SemPermissao'
import MenuAreasFinanceiro from '@/components/financeiro/MenuAreasFinanceiro'

export default function FinanceiroEntryPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, isDev, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()
  // Dev e função Financeiro entram no menu de áreas (José, 06/11/2026); os outros seguem para o Kanban deles
  const menuAreas = isDev || userProfile?.funcao === 'Financeiro'

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
