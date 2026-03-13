'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.push(session ? '/dashboard' : '/login')
    })
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
