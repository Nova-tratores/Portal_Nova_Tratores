'use client'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function MapaGeralPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('mapa')) return <SemPermissao />

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      <iframe
        src="/mapa-geral/index.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="geolocation"
        title="Mapeamento Técnico"
      />
    </div>
  )
}
