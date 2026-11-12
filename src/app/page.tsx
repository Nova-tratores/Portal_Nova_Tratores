'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

function ehLinkDeRecuperacao(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hash || ''
  return /(^|[#&])type=recovery(&|$)/.test(h) || /(^|[#&])error_code=otp_expired(&|$)/.test(h)
}

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // Link de recuperação de senha que caiu na raiz (o Supabase usa a "Site URL"
    // quando o redirect não está liberado ou quando o e-mail sai do painel dele):
    // leva para a tela de nova senha em vez do login.
    if (ehLinkDeRecuperacao()) {
      window.location.replace('/resetar-senha' + window.location.hash)
      return
    }
    let foi = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !foi) {
        foi = true
        router.replace('/resetar-senha')
      }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (foi) return
      router.push(session ? '/dashboard' : '/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#050a14'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 20px',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          animation: 'pulse-glow 2s infinite'
        }} />
        <p style={{ color: '#64748b', fontSize: '13px', letterSpacing: '3px', fontWeight: '500' }}>
          CARREGANDO...
        </p>
      </div>
    </div>
  )
}
