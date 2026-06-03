'use client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function ConsultaOmiePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('visual-estoque')) return <SemPermissao />

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="https://produtos.novatratores.com"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Consulta Omie"
      />
    </div>
  )
}
