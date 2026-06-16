'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserProfile {
  id: string
  nome: string
  funcao: string
  avatar_url: string
  tema?: string
  som_notificacao?: string
  ativo?: boolean
}

export function useAuth() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.push('/login'); return }
        const { data: prof } = await supabase
          .from('financeiro_usu')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (cancelled) return
        // Usuário inativado: bloquear acesso
        if (prof && prof.ativo === false) {
          await supabase.auth.signOut()
          router.push('/login?inativo=1')
          return
        }
        setUserProfile(prof)
      } catch {
        if (!cancelled) router.push('/login')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return { userProfile, setUserProfile, loading, handleLogout, router }
}
