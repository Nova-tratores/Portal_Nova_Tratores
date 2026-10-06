'use client'
import { Suspense } from 'react'
import CentralNav from '@/components/trabalho/CentralNav'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)

  if (!loading && userProfile && !temAcesso('tickets')) return <SemPermissao />

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <Suspense fallback={null}><CentralNav /></Suspense>
      {children}
    </div>
  )
}
