'use client'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useRouter } from 'next/navigation'
import SemPermissao from '@/components/SemPermissao'

export default function FinanceiroEntryPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()

  useEffect(() => {
    if (loading || loadingPerm || !userProfile) return
    if (!temAcesso('financeiro')) return
    if (userProfile.funcao === 'Financeiro') {
      router.replace('/financeiro/home-financeiro')
    } else {
      router.replace('/financeiro/home-posvendas')
    }
  }, [userProfile, loading, loadingPerm, router, temAcesso])

  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) {
    return <SemPermissao />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando...</p>
    </div>
  )
}
