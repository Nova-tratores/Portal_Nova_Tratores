'use client'
import { use, useEffect, useRef, useState } from 'react'
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
  const [deuSinal, setDeuSinal] = useState(false)
  const [talvezNaoAbriu, setTalvezNaoAbriu] = useState(false)
  const [fechouAviso, setFechouAviso] = useState(false)

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
      setDeuSinal(true)
      if (e.data?.tipo === 'vendas:precisa-sessao') enviarSessao()
    }
    // sem sinal do app em 10 s: oferece abrir em nova aba (auditoria 06/11/2026: a tela ficava cinza com o
    // ícone de página quebrada quando o app não abria dentro do portal)
    const t = setTimeout(() => setTalvezNaoAbriu(true), 10_000)
    window.addEventListener('message', onMsg)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'TOKEN_REFRESHED' || evento === 'SIGNED_IN') enviarSessao()
    })

    return () => {
      window.removeEventListener('message', onMsg)
      subscription.unsubscribe()
      clearTimeout(t)
    }
  }, [podeVer])

  if (!loading && userProfile && !temAcesso('crm-vendas')) return <SemPermissao />

  return (
    // dvh = altura VISÍVEL (no celular a barra do navegador não corta o rodapé); no PC é igual a vh
    <div style={{ position: 'relative', width: '100%', height: 'calc(100dvh - 84px)', overflow: 'hidden' }}>
      {podeVer && talvezNaoAbriu && !deuSinal && !fechouAviso && (
        <div role="status" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 12, background: 'var(--portal-bg-card, #fff)', border: '1px solid var(--portal-border, #e5e7eb)', boxShadow: '0 8px 24px rgba(0,0,0,.15)', fontSize: 14, color: 'var(--portal-text, #111)' }}>
          <span style={{ flex: '1 1 200px' }}>O CRM Vendas não carregou aqui dentro?</span>
          <a href={`${ORIGEM_VENDAS}/supervisor${tela}`} target="_blank" rel="noreferrer" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 10, background: '#dc2626', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>Abrir em nova aba</a>
          <button type="button" onClick={() => setFechouAviso(true)} aria-label="Fechar aviso" style={{ minWidth: 40, minHeight: 40, border: 'none', background: 'transparent', color: 'var(--portal-text-muted, #64748b)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
      )}
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
