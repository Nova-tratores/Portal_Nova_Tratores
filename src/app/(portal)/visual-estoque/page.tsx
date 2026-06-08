'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'

const ESTOQUE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3003'
  : 'https://estoque.novatratores.com'

export default function VisualEstoquePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)

  useEffect(() => {
    if (loading || !userProfile) return
    const buildUrl = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setIframeUrl(`${ESTOQUE_URL}?embed=1`); return }
        const ts = Date.now().toString()
        const res = await fetch('/api/portal-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ts })
        })
        const { hash } = await res.json()
        setIframeUrl(`${ESTOQUE_URL}?portal_token=${hash}&portal_ts=${ts}&portal_user=${encodeURIComponent(session.user.email || '')}&embed=1`)
      } catch {
        setIframeUrl(`${ESTOQUE_URL}?embed=1`)
      }
    }
    buildUrl()
  }, [loading, userProfile])

  if (!loading && userProfile && !temAcesso('estoque')) return <SemPermissao />

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden' }}>
      {iframeUrl ? (
        <iframe
          src={iframeUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Visual Estoque"
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', fontSize: 13 }}>Carregando...</div>
      )}
    </div>
  )
}
