'use client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function VisualEstoquePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('estoque')) return <SemPermissao />

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://estoque.novatratores.com"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Visual Estoque"
      />
    </div>
  )
}
