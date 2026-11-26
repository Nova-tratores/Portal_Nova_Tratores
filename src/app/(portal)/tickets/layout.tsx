'use client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)

  if (!loading && userProfile && !temAcesso('tickets')) return <SemPermissao />

  return (
    <div className="ct-vn" style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      {children}
    </div>
  )
}
