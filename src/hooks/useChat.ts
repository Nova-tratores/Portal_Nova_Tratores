'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ==================== TYPES ====================

export interface MembroInfo {
  user_id: string
  role: string
  nome: string
  avatar_url: string
  funcao: string
}

export interface Mensagem {
  id: string
  chat_id: string
  user_id: string
  conteudo: string | null
  tipo: 'texto' | 'imagem' | 'video' | 'audio' | 'arquivo'
  arquivo_url: string | null
  arquivo_nome: string | null
  arquivo_tamanho: number | null
  respondendo_a: string | null
  created_at: string
  remetente?: { nome: string; avatar_url: string }
}

export interface Chat {
  id: string
  tipo: 'individual' | 'grupo'
  nome: string | null
  avatar_url: string | null
  criado_por: string
  created_at: string
  updated_at: string
  membros: MembroInfo[]
  ultima_mensagem: Mensagem | null
  nao_lidas: number
}

export interface UsuarioInfo {
  id: string
  nome: string
  avatar_url: string
  funcao: string
}

export interface Notificacao {
  id: string
  chatId: string
  chatNome: string
  chatTipo: 'individual' | 'grupo'
  remetenteNome: string
  remetenteAvatar: string | null
  preview: string
  timestamp: string
}

export interface UseChatReturn {
  chats: Chat[]
  mensagens: Mensagem[]
  chatAtivo: string | null
  setChatAtivo: (id: string | null) => void
  loading: boolean
  totalNaoLidas: number
  enviarMensagem: (conteudo: string, tipo?: string, arquivo?: File) => Promise<void>
  criarChatIndividual: (outroUserId: string) => Promise<string | null>
  criarGrupo: (nome: string, memberIds: string[]) => Promise<string | null>
  marcarComoLido: (chatId: string) => void
  todosUsuarios: UsuarioInfo[]
  leituras: Record<string, string>
  ultimaNotificacao: Notificacao | null
  limparNotificacao: () => void
}

// ==================== HOOK ====================

export function useChat(userId: string | undefined): UseChatReturn {
  const [chats, setChats] = useState<Chat[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [chatAtivo, setChatAtivo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [todosUsuarios, setTodosUsuarios] = useState<UsuarioInfo[]>([])
  const [leituras, setLeituras] = useState<Record<string, string>>({})
  const [ultimaNotificacao, setUltimaNotificacao] = useState<Notificacao | null>(null)

  // Refs para acessar estado atual nos callbacks de realtime
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const chatAtivoRef = useRef(chatAtivo)
  chatAtivoRef.current = chatAtivo
  const todosUsuariosRef = useRef(todosUsuarios)
  todosUsuariosRef.current = todosUsuarios
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  // ==================== CARREGAR USUARIOS ====================
  const carregarUsuarios = useCallback(async () => {
    const { data } = await supabase
      .from('financeiro_usu')
      .select('id, nome, avatar_url, funcao')
      .order('nome')
    setTodosUsuarios(data || [])
  }, [])

  // ==================== CARREGAR CHATS ====================
  const carregarChats = useCallback(async () => {
    if (!userId) { setChats([]); setLoading(false); return }

    // 1. Pegar chats do usuário
    const { data: memberships } = await supabase
      .from('portal_chat_membros')
      .select('chat_id')
      .eq('user_id', userId)

    if (!memberships?.length) { setChats([]); setLoading(false); return }

    const chatIds = memberships.map(m => m.chat_id)

    // 2. Dados dos chats
    const { data: chatsData } = await supabase
      .from('portal_chats')
      .select('*')
      .in('id', chatIds)

    // 3. Todos os membros com info
    const { data: membros } = await supabase
      .from('portal_chat_membros')
      .select('chat_id, user_id, role')
      .in('chat_id', chatIds)

    const memberUserIds = [...new Set(membros?.map(m => m.user_id) || [])]
    const { data: users } = await supabase
      .from('financeiro_usu')
      .select('id, nome, avatar_url, funcao')
      .in('id', memberUserIds)
    const userMap = new Map(users?.map(u => [u.id, u]) || [])

    // 4. Última mensagem de cada chat (busca recente e agrupa)
    const { data: recentMsgs } = await supabase
      .from('portal_mensagens')
      .select('*')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false })
      .limit(200)

    const lastMessages: Record<string, Mensagem> = {}
    for (const msg of (recentMsgs || [])) {
      if (!lastMessages[msg.chat_id]) lastMessages[msg.chat_id] = msg
    }

    // 5. Leituras do usuário
    const { data: reads } = await supabase
      .from('portal_chat_leitura')
      .select('*')
      .eq('user_id', userId)
      .in('chat_id', chatIds)
    const readMap = new Map(reads?.map(r => [r.chat_id, r.ultima_leitura]) || [])

    // 6. Contagem de não lidas — estima a partir das mensagens recentes já carregadas
    // evita N queries (uma por chat) que era o maior gargalo de performance
    const unreadCounts: Record<string, number> = {}
    for (const chatId of chatIds) {
      const lastRead = readMap.get(chatId)
      const msgs = (recentMsgs || []).filter(m =>
        m.chat_id === chatId && m.user_id !== userId && (!lastRead || m.created_at > lastRead)
      )
      unreadCounts[chatId] = msgs.length
    }

    // 7. Montar lista
    const chatList: Chat[] = (chatsData || []).map(c => ({
      ...c,
      membros: (membros || [])
        .filter(m => m.chat_id === c.id)
        .map(m => {
          const u = userMap.get(m.user_id)
          return {
            user_id: m.user_id,
            role: m.role,
            nome: u?.nome || 'Desconhecido',
            avatar_url: u?.avatar_url || '',
            funcao: u?.funcao || ''
          }
        }),
      ultima_mensagem: lastMessages[c.id] || null,
      nao_lidas: unreadCounts[c.id] || 0
    }))

    chatList.sort((a, b) => {
      const aTime = a.ultima_mensagem?.created_at || a.updated_at || a.created_at
      const bTime = b.ultima_mensagem?.created_at || b.updated_at || b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    setChats(chatList)
    setLoading(false)
  }, [userId])

  // ==================== CARREGAR MENSAGENS ====================
  const carregarMensagens = useCallback(async (chatId: string) => {
    const { data } = await supabase
      .from('portal_mensagens')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(500)

    if (!data) { setMensagens([]); return }

    // Enriquecer com info do remetente
    const userIds = [...new Set(data.map(m => m.user_id))]
    const { data: users } = await supabase
      .from('financeiro_usu')
      .select('id, nome, avatar_url')
      .in('id', userIds)
    const userMap = new Map(users?.map(u => [u.id, u]) || [])

    const enriched: Mensagem[] = data.map(m => ({
      ...m,
      remetente: userMap.get(m.user_id)
        ? { nome: userMap.get(m.user_id)!.nome, avatar_url: userMap.get(m.user_id)!.avatar_url }
        : undefined
    }))

    setMensagens(enriched)
  }, [])

  // ==================== CARREGAR LEITURAS ====================
  const carregarLeituras = useCallback(async (chatId: string) => {
    const { data } = await supabase
      .from('portal_chat_leitura')
      .select('*')
      .eq('chat_id', chatId)
    const map: Record<string, string> = {}
    ;(data || []).forEach(r => { map[r.user_id] = r.ultima_leitura })
    setLeituras(map)
  }, [])

  // ==================== MARCAR COMO LIDO ====================
  const marcarComoLido = useCallback(async (chatId: string) => {
    if (!userId) return
    const now = new Date().toISOString()
    await supabase.from('portal_chat_leitura').upsert(
      { chat_id: chatId, user_id: userId, ultima_leitura: now },
      { onConflict: 'chat_id,user_id' }
    )
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, nao_lidas: 0 } : c))
  }, [userId])

  // ==================== UPLOAD DE ARQUIVO ====================
  const uploadArquivo = useCallback(async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('chat-anexos').upload(path, file)
    if (error) { console.error('Upload error:', error); return null }
    const { data } = supabase.storage.from('chat-anexos').getPublicUrl(path)
    return data.publicUrl
  }, [userId])

  // ==================== ENVIAR MENSAGEM ====================
  const enviarMensagem = useCallback(async (conteudo: string, tipo: string = 'texto', arquivo?: File) => {
    if (!chatAtivoRef.current || !userId) return
    let arquivo_url: string | null = null
    let arquivo_nome: string | null = null
    let arquivo_tamanho: number | null = null

    if (arquivo) {
      arquivo_url = await uploadArquivo(arquivo)
      if (!arquivo_url) return
      arquivo_nome = arquivo.name
      arquivo_tamanho = arquivo.size
    }

    await supabase.from('portal_mensagens').insert({
      chat_id: chatAtivoRef.current,
      user_id: userId,
      conteudo: conteudo || null,
      tipo,
      arquivo_url,
      arquivo_nome,
      arquivo_tamanho
    })

    await supabase
      .from('portal_chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatAtivoRef.current)
  }, [userId, uploadArquivo])

  // ==================== CRIAR CHAT INDIVIDUAL ====================
  const criarChatIndividual = useCallback(async (outroUserId: string): Promise<string | null> => {
    if (!userId) return null

    try {
      // Verificar se já existe chat individual entre os dois
      const { data: myMemberships } = await supabase
        .from('portal_chat_membros')
        .select('chat_id')
        .eq('user_id', userId)
      const { data: theirMemberships } = await supabase
        .from('portal_chat_membros')
        .select('chat_id')
        .eq('user_id', outroUserId)

      const myIds = new Set(myMemberships?.map(m => m.chat_id) || [])
      const commonIds = (theirMemberships || [])
        .filter(m => myIds.has(m.chat_id))
        .map(m => m.chat_id)

      if (commonIds.length > 0) {
        const { data: existing } = await supabase
          .from('portal_chats')
          .select('id')
          .in('id', commonIds)
          .eq('tipo', 'individual')
        if (existing?.length) {
          await carregarChats()
          return existing[0].id
        }
      }

      // Criar novo
      const { data: chat, error } = await supabase
        .from('portal_chats')
        .insert({ tipo: 'individual', criado_por: userId })
        .select()
        .single()
      if (error || !chat) { console.error('Erro ao criar chat:', error); return null }

      const { error: membroError } = await supabase.from('portal_chat_membros').insert([
        { chat_id: chat.id, user_id: userId, role: 'admin' },
        { chat_id: chat.id, user_id: outroUserId, role: 'membro' }
      ])
      if (membroError) console.error('Erro ao adicionar membros:', membroError)

      await carregarChats()
      return chat.id
    } catch (err) {
      console.error('Erro ao criar chat individual:', err)
      return null
    }
  }, [userId, carregarChats])

  // ==================== CRIAR GRUPO ====================
  const criarGrupo = useCallback(async (nome: string, memberIds: string[]): Promise<string | null> => {
    if (!userId) return null

    try {
      const { data: chat, error } = await supabase
        .from('portal_chats')
        .insert({ tipo: 'grupo', nome, criado_por: userId })
        .select()
        .single()
      if (error || !chat) { console.error('Erro ao criar grupo:', error); return null }

      const allMembers = [userId, ...memberIds.filter(id => id !== userId)]
      const { error: membroError } = await supabase.from('portal_chat_membros').insert(
        allMembers.map(uid => ({
          chat_id: chat.id,
          user_id: uid,
          role: uid === userId ? 'admin' : 'membro'
        }))
      )
      if (membroError) console.error('Erro ao adicionar membros:', membroError)

      await carregarChats()
      return chat.id
    } catch (err) {
      console.error('Erro ao criar grupo:', err)
      return null
    }
  }, [userId, carregarChats])

  // ==================== REALTIME ====================
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return

    carregarChats()
    carregarUsuarios()

    let currentChannel: ReturnType<typeof supabase.channel> | null = null

    const subscribe = () => {
      if (currentChannel) supabase.removeChannel(currentChannel)

      currentChannel = supabase.channel('chat-realtime-' + userId + '-' + Date.now())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'portal_mensagens'
      }, async (payload) => {
        const nova = payload.new as Mensagem
        const meusChatIds = chatsRef.current.map(c => c.id)

        if (!meusChatIds.includes(nova.chat_id)) {
          await carregarChats()
          return
        }

        // Enriquecer com info do remetente
        const remetente = todosUsuariosRef.current.find(u => u.id === nova.user_id)
        const msgEnriquecida: Mensagem = {
          ...nova,
          remetente: remetente
            ? { nome: remetente.nome, avatar_url: remetente.avatar_url }
            : undefined
        }

        // Se for do chat ativo, adicionar às mensagens
        if (nova.chat_id === chatAtivoRef.current) {
          setMensagens(prev => {
            if (prev.some(m => m.id === nova.id)) return prev
            return [...prev, msgEnriquecida]
          })
          marcarComoLido(nova.chat_id)
        }

        // Disparar notificação se mensagem de outro usuário
        if (nova.user_id !== userIdRef.current) {
          const chatInfo = chatsRef.current.find(c => c.id === nova.chat_id)
          const chatNome = chatInfo?.tipo === 'grupo'
            ? (chatInfo?.nome || 'Grupo')
            : (remetente?.nome || 'Nova mensagem')

          let preview = nova.conteudo || ''
          if (nova.tipo === 'imagem') preview = '📷 Foto'
          else if (nova.tipo === 'video') preview = '🎥 Vídeo'
          else if (nova.tipo === 'audio') preview = '🎤 Áudio'
          else if (nova.tipo === 'arquivo') preview = '📎 ' + (nova.arquivo_nome || 'Arquivo')

          setUltimaNotificacao({
            id: nova.id,
            chatId: nova.chat_id,
            chatTipo: chatInfo?.tipo || 'individual',
            chatNome,
            remetenteNome: remetente?.nome || 'Usuário',
            remetenteAvatar: remetente?.avatar_url || null,
            preview,
            timestamp: nova.created_at
          })
        }

        // Atualizar lista de chats
        setChats(prev => {
          const updated = prev.map(c => {
            if (c.id !== nova.chat_id) return c
            return {
              ...c,
              ultima_mensagem: nova,
              nao_lidas: nova.chat_id === chatAtivoRef.current
                ? 0
                : c.nao_lidas + (nova.user_id !== userIdRef.current ? 1 : 0),
              updated_at: nova.created_at
            }
          })
          return updated.sort((a, b) => {
            const aT = a.ultima_mensagem?.created_at || a.updated_at
            const bT = b.ultima_mensagem?.created_at || b.updated_at
            return new Date(bT).getTime() - new Date(aT).getTime()
          })
        })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'portal_chat_leitura'
      }, (payload) => {
        const row = payload.new as { chat_id: string; user_id: string; ultima_leitura: string }
        if (row.chat_id === chatAtivoRef.current) {
          setLeituras(prev => ({ ...prev, [row.user_id]: row.ultima_leitura }))
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Chat] Realtime conectado')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Chat] Erro realtime:', status, err?.message)
          retryRef.current = setTimeout(() => {
            console.log('[Chat] Reconectando...')
            subscribe()
          }, 3000)
        } else if (status === 'CLOSED') {
          console.warn('[Chat] Canal fechado, reconectando...')
          retryRef.current = setTimeout(() => subscribe(), 3000)
        }
      })
    }

    subscribe()

    // Recarregar chats quando a aba voltar ao foco
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userIdRef.current) {
        carregarChats()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      if (currentChannel) supabase.removeChannel(currentChannel)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [userId, carregarChats, carregarUsuarios, marcarComoLido])

  // Carregar mensagens e leituras quando chat ativo muda
  useEffect(() => {
    if (!chatAtivo) { setMensagens([]); return }
    carregarMensagens(chatAtivo)
    marcarComoLido(chatAtivo)
    carregarLeituras(chatAtivo)
  }, [chatAtivo, carregarMensagens, marcarComoLido, carregarLeituras])

  const totalNaoLidas = chats.reduce((acc, c) => acc + c.nao_lidas, 0)

  const limparNotificacao = useCallback(() => setUltimaNotificacao(null), [])

  return {
    chats,
    mensagens,
    chatAtivo,
    setChatAtivo,
    loading,
    totalNaoLidas,
    enviarMensagem,
    criarChatIndividual,
    criarGrupo,
    marcarComoLido,
    todosUsuarios,
    leituras,
    ultimaNotificacao,
    limparNotificacao
  }
}
