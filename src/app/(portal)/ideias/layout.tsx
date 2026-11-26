'use client'
// Ideias dos devs — aba da Central de Trabalho só para quem tem papel Dev.
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function IdeiasLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { isDev, loading } = usePermissoes(userProfile?.id)

  if (!loading && userProfile && !isDev) return <SemPermissao />

  return (
    <div className="ct-vn" style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      {children}
    </div>
  )
}
