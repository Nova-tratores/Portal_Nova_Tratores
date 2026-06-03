'use client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function DashboardAgroPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('dashboard-agro')) return <SemPermissao />

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://dashboard-agro-sp-production.up.railway.app/"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Dashboard Agro"
      />
    </div>
  )
}
