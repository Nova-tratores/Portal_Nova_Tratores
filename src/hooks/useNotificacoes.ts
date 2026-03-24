'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

export interface Notificacao {
  id: string
  user_id: string
  tipo: string
  titulo: string
  descricao: string | null
  link: string | null
  icone: string | null
  lida: boolean
  created_at: string
}

// ── Helpers de notificação do navegador ──
function pedirPermissaoNotificacao() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function enviarNotificacaoNativa(titulo: string, corpo?: string, link?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return // só notifica se aba em background

  const n = new Notification(titulo, {
    body: corpo || undefined,
    icon: '/favicon.ico',
    tag: 'portal-notif-' + Date.now(),
  })

  if (link) {
    n.onclick = () => {
      window.focus()
      window.location.href = link
      n.close()
    }
  }
}

// ── Título piscante ──
let tituloOriginal = ''
let intervaloPisca: ReturnType<typeof setInterval> | null = null

function iniciarTituloPiscante(count: number) {
  if (typeof document === 'undefined') return
  if (!tituloOriginal) tituloOriginal = document.title
  pararTituloPiscante()

  let visivel = true
  intervaloPisca = setInterval(() => {
    document.title = visivel ? `(${count}) Nova notificação!` : tituloOriginal
    visivel = !visivel
  }, 1000)
}

function pararTituloPiscante() {
  if (intervaloPisca) {
    clearInterval(intervaloPisca)
    intervaloPisca = null
  }
  if (tituloOriginal && typeof document !== 'undefined') {
    document.title = tituloOriginal
  }
}

export function useNotificacoes(userId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  // Pedir permissão na primeira vez
  useEffect(() => { pedirPermissaoNotificacao() }, [])

  // Parar título piscante quando a aba voltar ao foco
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') pararTituloPiscante()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const carregar = useCallback(async () => {
    if (!userId) { setNotificacoes([]); setLoading(false); return }
    const { data } = await supabase
      .from('portal_notificacoes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotificacoes(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    carregar()

    const channel = supabase.channel('notif-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'portal_notificacoes',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const nova = payload.new as Notificacao
        setNotificacoes(prev => {
          const updated = [nova, ...prev].slice(0, 50)
          const naoLidasCount = updated.filter(n => !n.lida).length

          // Notificação nativa + título piscante se aba em background
          enviarNotificacaoNativa(nova.titulo, nova.descricao || undefined, nova.link || undefined)
          if (document.visibilityState === 'hidden' && naoLidasCount > 0) {
            iniciarTituloPiscante(naoLidasCount)
          }

          return updated
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, carregar])

  const naoLidas = useMemo(() => notificacoes.filter(n => !n.lida).length, [notificacoes])

  const marcarComoLida = useCallback(async (id: string) => {
    await supabase.from('portal_notificacoes').update({ lida: true }).eq('id', id)
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }, [])

  const marcarTodasComoLidas = useCallback(async () => {
    if (!userId) return
    await supabase.from('portal_notificacoes').update({ lida: true }).eq('user_id', userId).eq('lida', false)
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
  }, [userId])

  const criarNotificacao = useCallback(async (
    targetUserId: string,
    tipo: string,
    titulo: string,
    descricao?: string,
    link?: string
  ) => {
    await supabase.from('portal_notificacoes').insert({
      user_id: targetUserId,
      tipo,
      titulo,
      descricao: descricao || null,
      link: link || null,
    })
  }, [])

  return { notificacoes, loading, naoLidas, marcarComoLida, marcarTodasComoLidas, criarNotificacao }
}
