'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
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

export function useNotificacoes(userId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

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
        setNotificacoes(prev => [nova, ...prev].slice(0, 50))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, carregar])

  const naoLidas = notificacoes.filter(n => !n.lida).length

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
