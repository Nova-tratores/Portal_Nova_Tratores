'use client'
import { use, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'

// CRM Vendas: o painel completo do supervisor do app de vendas (vendas-pwa) em iframe.
// Os dois usam o mesmo Supabase Auth, mas em origens diferentes: a sessão do portal
// é entregue ao iframe por postMessage (lado de lá: vendas-pwa/src/lib/embed.js).
// O iframe NUNCA renova essa sessão — rotacionaria o refresh token e deslogaria o
// portal. Quem renova é o portal, que reenvia a sessão a cada TOKEN_REFRESHED.
// O acesso às telas lá dentro vem da tabela `supervisores` (tipo admin/gestor),
// pelo mesmo auth.uid; sem linha lá, o iframe mostra o aviso.
const ORIGEM_VENDAS = (process.env.NEXT_PUBLIC_CRM_VENDAS_URL || 'https://vendas-pwa-production.up.railway.app').replace(/\/$/, '')

// ?tela=quests abre direto numa tela do painel (/supervisor/quests). Só nome de
// tela simples (letras, números, hífen e barra) — nada de outra origem.
const telaDoLink = (t: string | string[] | undefined) => {
  const v = Array.isArray(t) ? t[0] : t
  return v && /^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(v) ? `/${v}` : ''
}

export default function CrmVendasPage({ searchParams }: { searchParams: Promise<{ tela?: string | string[] }> }) {
  const tela = telaDoLink(use(searchParams).tela)
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const podeVer = !loading && !!userProfile && temAcesso('crm-vendas')

  useEffect(() => {
    if (!podeVer) return

    const enviarSessao = async () => {
      const alvo = iframeRef.current?.contentWindow
      if (!alvo) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // targetOrigin fixo: a sessão só chega se o iframe estiver mesmo no app de vendas.
      alvo.postMessage(
        { tipo: 'portal:sessao', access_token: session.access_token, refresh_token: session.refresh_token },
        ORIGEM_VENDAS,
      )
    }

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ORIGEM_VENDAS || e.source !== iframeRef.current?.contentWindow) return
      if (e.data?.tipo === 'vendas:precisa-sessao') enviarSessao()
    }
    window.addEventListener('message', onMsg)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'TOKEN_REFRESHED' || evento === 'SIGNED_IN') enviarSessao()
    })

    return () => {
      window.removeEventListener('message', onMsg)
      subscription.unsubscribe()
    }
  }, [podeVer])

  if (!loading && userProfile && !temAcesso('crm-vendas')) return <SemPermissao />

  return (
    // dvh = altura VISÍVEL (no celular a barra do navegador não corta o rodapé); no PC é igual a vh
    <div style={{ width: '100%', height: 'calc(100dvh - 84px)', overflow: 'hidden' }}>
      {podeVer && (
        <iframe
          ref={iframeRef}
          src={`${ORIGEM_VENDAS}/supervisor${tela}?embed=1`}
          title="CRM Vendas"
          // fullscreen: modo Showroom/TV do catálogo · geolocation: mapas
          allow="fullscreen; geolocation"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      )}
    </div>
  )
}
