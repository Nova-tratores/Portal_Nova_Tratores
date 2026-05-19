'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { UseChatReturn, Chat, Mensagem } from '@/hooks/useChat'
import {
  X, Search, Plus, Send, Paperclip, Mic, Square,
  ArrowLeft, Image as ImageIcon, FileText, Play, Pause,
  CheckCheck, Check, Users, User as UserIcon, MessageCircle
} from 'lucide-react'

// ==================== TYPES ====================

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  chat: UseChatReturn
  userId: string | undefined
  userProfile: { id: string; nome: string; avatar_url: string; funcao: string } | null
  isAdmin: boolean
}

// ==================== HELPERS ====================

const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const getDateLabel = (date: Date) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const groupByDay = (msgs: Mensagem[]) => {
  const groups: { label: string; messages: Mensagem[] }[] = []
  let currentDate = ''
  for (const msg of msgs) {
    const d = new Date(msg.created_at).toDateString()
    if (d !== currentDate) {
      currentDate = d
      groups.push({ label: getDateLabel(new Date(msg.created_at)), messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }
  return groups
}

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const getLastMsgPreview = (msg: Mensagem | null) => {
  if (!msg) return 'Nenhuma mensagem'
  switch (msg.tipo) {
    case 'imagem': return '📷 Foto'
    case 'video': return '🎥 Vídeo'
    case 'audio': return '🎤 Áudio'
    case 'arquivo': return '📎 ' + (msg.arquivo_nome || 'Arquivo')
    default: return msg.conteudo || ''
  }
}

// ==================== MAIN COMPONENT ====================

export default function ChatPanel({ open, onClose, chat, userId, userProfile, isAdmin }: ChatPanelProps) {
  const [search, setSearch] = useState('')
  const [msgText, setMsgText] = useState('')
  const [novoChat, setNovoChat] = useState(false)
  const [novoChatTipo, setNovoChatTipo] = useState<'individual' | 'grupo'>('individual')
  const [grupoNome, setGrupoNome] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [gravando, setGravando] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)
  const [mobileView, setMobileView] = useState<'list' | 'room'>('list')
  const [criandoChat, setCriandoChat] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat.mensagens])

  // Gravação timer
  useEffect(() => {
    if (gravando) {
      timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setTempoGravacao(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [gravando])

  // Reset mobile view when chat changes
  useEffect(() => {
    if (chat.chatAtivo) setMobileView('room')
  }, [chat.chatAtivo])

  // ==================== CHAT HELPERS ====================

  const getChatName = (c: Chat) => {
    if (c.tipo === 'grupo') return c.nome || 'Grupo'
    const outro = c.membros.find(m => m.user_id !== userId)
    return outro?.nome || 'Chat'
  }

  const getChatAvatar = (c: Chat) => {
    if (c.tipo === 'grupo') return c.avatar_url
    const outro = c.membros.find(m => m.user_id !== userId)
    return outro?.avatar_url || null
  }

  const getChatSubtitle = (c: Chat) => {
    if (c.tipo === 'grupo') return c.membros.map(m => m.nome.split(' ')[0]).join(', ')
    const outro = c.membros.find(m => m.user_id !== userId)
    return outro?.funcao || ''
  }

  const isMessageRead = (msg: Mensagem) => {
    if (msg.user_id !== userId) return false
    const chatInfo = chat.chats.find(c => c.id === msg.chat_id)
    if (chatInfo?.tipo !== 'individual') return false
    const outro = chatInfo.membros.find(m => m.user_id !== userId)
    if (!outro) return false
    const leitura = chat.leituras[outro.user_id]
    return !!leitura && new Date(leitura) >= new Date(msg.created_at)
  }

  const chatAtual = chat.chats.find(c => c.id === chat.chatAtivo)

  // ==================== ACTIONS ====================

  const handleSend = async () => {
    const text = msgText.trim()
    if (!text) return
    setMsgText('')
    if (textareaRef.current) textareaRef.current.style.height = '42px'
    await chat.enviarMensagem(text, 'texto')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    let tipo: string = 'arquivo'
    if (file.type.startsWith('image/')) tipo = 'imagem'
    else if (file.type.startsWith('video/')) tipo = 'video'
    else if (file.type.startsWith('audio/')) tipo = 'audio'

    await chat.enviarMensagem(file.name, tipo, file)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' })
        await chat.enviarMensagem('Áudio', 'audio', file)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setGravando(true)
    } catch {
      alert('Não foi possível acessar o microfone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setGravando(false)
  }

  const handleNewChat = async () => {
    if (criandoChat) return
    setCriandoChat(true)
    try {
      if (novoChatTipo === 'individual') {
        if (selectedUsers.length !== 1) { setCriandoChat(false); return }
        const id = await chat.criarChatIndividual(selectedUsers[0])
        if (id) { chat.setChatAtivo(id); setMobileView('room') }
      } else {
        if (!grupoNome.trim() || selectedUsers.length < 1) { setCriandoChat(false); return }
        const id = await chat.criarGrupo(grupoNome.trim(), selectedUsers)
        if (id) { chat.setChatAtivo(id); setMobileView('room') }
        else { alert('Erro ao criar grupo. Verifique o console.'); }
      }
      setNovoChat(false)
      setSelectedUsers([])
      setGrupoNome('')
      setUserSearch('')
    } catch (err) {
      console.error('Erro ao criar chat:', err)
      alert('Erro ao criar chat: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCriandoChat(false)
    }
  }

  const handleBack = () => {
    chat.setChatAtivo(null)
    setMobileView('list')
  }

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }

  // ==================== FILTERED DATA ====================

  const filteredChats = useMemo(() => chat.chats.filter(c => {
    if (!search) return true
    const name = getChatName(c).toLowerCase()
    return name.includes(search.toLowerCase())
  }), [chat.chats, search, userId])

  const filteredUsers = useMemo(() => chat.todosUsuarios.filter(u => {
    if (u.id === userId) return false
    if (!userSearch) return true
    return u.nome.toLowerCase().includes(userSearch.toLowerCase())
  }), [chat.todosUsuarios, userId, userSearch])

  const messageGroups = useMemo(() => groupByDay(chat.mensagens), [chat.mensagens])

  // ==================== RENDER ====================

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end'
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          animation: 'chatFadeIn 0.2s ease'
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative',
        width: '900px', maxWidth: '100%',
        background: 'var(--portal-bg-card)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
        animation: 'chatSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>

        {/* ===== PANEL HEADER ===== */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#fff', flexShrink: 0
        }}>
          <MessageCircle size={22} />
          <h2 style={{ fontSize: '17px', fontWeight: '700', flex: 1 }}>Mensagens</h2>
          <button
            onClick={() => { setNovoChat(true); setNovoChatTipo('individual'); setSelectedUsers([]) }}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              width: '34px', height: '34px', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
            title="Nova conversa"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              width: '34px', height: '34px', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ===== BODY ===== */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ===== LEFT: CHAT LIST ===== */}
          <div style={{
            width: chat.chatAtivo ? '340px' : '100%',
            borderRight: chat.chatAtivo ? `1px solid var(--portal-border)` : 'none',
            display: 'flex', flexDirection: 'column',
            background: 'var(--portal-bg-card)', flexShrink: 0,
            ...(mobileView === 'room' ? { display: 'none' } : {})
          }}
            className="chat-sidebar"
          >
            {/* Search */}
            <div style={{ padding: '12px 16px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '10px',
                background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)'
              }}>
                <Search size={15} color="#a3a3a3" />
                <input
                  type="text"
                  placeholder="Buscar conversa..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    flex: 1, border: 'none', background: 'none', outline: 'none',
                    fontSize: '13px', color: 'var(--portal-text)', fontFamily: 'Inter'
                  }}
                />
              </div>
            </div>

            {/* Chat items */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chat.loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: '13px' }}>
                  Carregando conversas...
                </div>
              ) : filteredChats.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <MessageCircle size={40} color="#e5e5e5" style={{ margin: '0 auto 12px' }} />
                  <p style={{ color: 'var(--portal-text-muted)', fontSize: '13px' }}>
                    {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
                  </p>
                  <button
                    onClick={() => { setNovoChat(true); setNovoChatTipo('individual') }}
                    style={{
                      marginTop: '12px', padding: '8px 20px', borderRadius: '8px',
                      background: '#dc2626', color: '#fff', border: 'none',
                      fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    Iniciar conversa
                  </button>
                </div>
              ) : (
                filteredChats.map(c => {
                  const isActive = c.id === chat.chatAtivo
                  return (
                    <div
                      key={c.id}
                      onClick={() => { chat.setChatAtivo(c.id); setMobileView('room') }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 16px', cursor: 'pointer',
                        background: isActive ? '#fef2f2' : 'transparent',
                        borderLeft: isActive ? '3px solid #dc2626' : '3px solid transparent',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        background: c.tipo === 'grupo'
                          ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                          : '#e5e5e5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, overflow: 'hidden'
                      }}>
                        {getChatAvatar(c) ? (
                          <img src={getChatAvatar(c)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : c.tipo === 'grupo' ? (
                          <Users size={20} color="#fff" />
                        ) : (
                          <UserIcon size={22} color="#a3a3a3" />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{
                            fontSize: '14px', fontWeight: c.nao_lidas > 0 ? '700' : '600',
                            color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {getChatName(c)}
                          </span>
                          <span style={{
                            fontSize: '11px', color: c.nao_lidas > 0 ? '#dc2626' : 'var(--portal-text-muted)',
                            fontWeight: c.nao_lidas > 0 ? '600' : '400', flexShrink: 0, marginLeft: '8px'
                          }}>
                            {c.ultima_mensagem ? formatTime(c.ultima_mensagem.created_at) : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            fontSize: '12px', color: 'var(--portal-text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: c.nao_lidas > 0 ? '500' : '400'
                          }}>
                            {c.ultima_mensagem && c.ultima_mensagem.user_id === userId && (
                              <span style={{ color: 'var(--portal-text-muted)', marginRight: '2px' }}>Você: </span>
                            )}
                            {getLastMsgPreview(c.ultima_mensagem)}
                          </span>
                          {c.nao_lidas > 0 && (
                            <span style={{
                              minWidth: '20px', height: '20px', borderRadius: '10px',
                              background: '#dc2626', color: '#fff', fontSize: '11px',
                              fontWeight: '700', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', padding: '0 6px', flexShrink: 0, marginLeft: '8px'
                            }}>
                              {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ===== RIGHT: CHAT ROOM ===== */}
          {chat.chatAtivo && chatAtual ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              background: '#f5f5f0',
              ...(mobileView === 'list' ? { display: 'none' } : {})
            }}
              className="chat-room"
            >
              {/* Room Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 20px',
                background: 'var(--portal-bg-card)', borderBottom: '1px solid var(--portal-border)',
                flexShrink: 0
              }}>
                <button
                  onClick={handleBack}
                  style={{
                    background: 'none', border: 'none', color: 'var(--portal-text-secondary)',
                    cursor: 'pointer', padding: '4px', display: 'flex',
                    borderRadius: '6px'
                  }}
                  className="chat-back-btn"
                >
                  <ArrowLeft size={20} />
                </button>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: chatAtual.tipo === 'grupo'
                    ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                    : '#e5e5e5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, overflow: 'hidden'
                }}>
                  {getChatAvatar(chatAtual) ? (
                    <img src={getChatAvatar(chatAtual)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : chatAtual.tipo === 'grupo' ? (
                    <Users size={18} color="#fff" />
                  ) : (
                    <UserIcon size={18} color="#a3a3a3" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--portal-text)' }}>
                    {getChatName(chatAtual)}
                  </p>
                  <p style={{
                    fontSize: '11px', color: 'var(--portal-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {getChatSubtitle(chatAtual)}
                  </p>
                </div>
              </div>

              {/* Messages Area */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: '2px'
              }}>
                {chat.mensagens.length === 0 ? (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: '8px'
                  }}>
                    <MessageCircle size={48} color="#d4d4d4" />
                    <p style={{ color: 'var(--portal-text-muted)', fontSize: '13px' }}>Envie a primeira mensagem!</p>
                  </div>
                ) : (
                  messageGroups.map((group, gi) => (
                    <div key={gi}>
                      {/* Day separator */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '16px 0 12px'
                      }}>
                        <span style={{
                          padding: '5px 16px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.9)', color: 'var(--portal-text-secondary)',
                          fontSize: '11px', fontWeight: '600',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                        }}>
                          {group.label}
                        </span>
                      </div>

                      {/* Messages */}
                      {group.messages.map((msg, mi) => {
                        const isMine = msg.user_id === userId
                        const showSender = chatAtual.tipo === 'grupo' && !isMine
                        const prevMsg = mi > 0 ? group.messages[mi - 1] : null
                        const sameSender = prevMsg?.user_id === msg.user_id
                        const lida = isMessageRead(msg)

                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: 'flex',
                              justifyContent: isMine ? 'flex-end' : 'flex-start',
                              marginTop: sameSender ? '2px' : '8px'
                            }}
                          >
                            <div style={{
                              maxWidth: '65%', minWidth: '80px',
                              padding: msg.tipo === 'imagem' || msg.tipo === 'video' ? '4px' : '8px 12px',
                              borderRadius: isMine
                                ? (sameSender ? '8px 4px 8px 8px' : '8px 0px 8px 8px')
                                : (sameSender ? '4px 8px 8px 8px' : '0px 8px 8px 8px'),
                              background: isMine ? '#fef2f2' : 'var(--portal-bg-card)',
                              border: isMine ? '1px solid #fecaca' : `1px solid var(--portal-border)`,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              position: 'relative'
                            }}>
                              {/* Sender name for groups */}
                              {showSender && !sameSender && (
                                <p style={{
                                  fontSize: '11px', fontWeight: '700',
                                  color: '#dc2626', marginBottom: '4px'
                                }}>
                                  {msg.remetente?.nome || 'Desconhecido'}
                                </p>
                              )}

                              {/* Content by type */}
                              {msg.tipo === 'texto' && (
                                <p style={{
                                  fontSize: '13.5px', color: 'var(--portal-text)',
                                  lineHeight: '1.45', wordBreak: 'break-word',
                                  margin: 0, whiteSpace: 'pre-wrap'
                                }}>
                                  {msg.conteudo}
                                </p>
                              )}

                              {msg.tipo === 'imagem' && msg.arquivo_url && (
                                <div>
                                  <img
                                    src={msg.arquivo_url}
                                    alt="Foto"
                                    style={{
                                      maxWidth: '100%', maxHeight: '300px',
                                      borderRadius: '6px', display: 'block', cursor: 'pointer'
                                    }}
                                    onClick={() => window.open(msg.arquivo_url!, '_blank')}
                                  />
                                  {msg.conteudo && msg.conteudo !== msg.arquivo_nome && (
                                    <p style={{
                                      fontSize: '13px', color: 'var(--portal-text)', margin: '6px 8px 2px',
                                      lineHeight: '1.4'
                                    }}>
                                      {msg.conteudo}
                                    </p>
                                  )}
                                </div>
                              )}

                              {msg.tipo === 'video' && msg.arquivo_url && (
                                <div>
                                  <video
                                    src={msg.arquivo_url}
                                    controls
                                    style={{
                                      maxWidth: '100%', maxHeight: '300px',
                                      borderRadius: '6px', display: 'block'
                                    }}
                                  />
                                </div>
                              )}

                              {msg.tipo === 'audio' && msg.arquivo_url && (
                                <div style={{ padding: '4px 4px 0' }}>
                                  <audio
                                    src={msg.arquivo_url}
                                    controls
                                    style={{ height: '36px', width: '220px' }}
                                  />
                                </div>
                              )}

                              {msg.tipo === 'arquivo' && msg.arquivo_url && (
                                <a
                                  href={msg.arquivo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 4px', textDecoration: 'none', color: 'var(--portal-text)'
                                  }}
                                >
                                  <div style={{
                                    width: '40px', height: '40px', borderRadius: '8px',
                                    background: 'var(--portal-bg-secondary)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                  }}>
                                    <FileText size={20} color="#dc2626" />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{
                                      fontSize: '12.5px', fontWeight: '600',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      margin: 0
                                    }}>
                                      {msg.arquivo_nome || 'Arquivo'}
                                    </p>
                                    <p style={{ fontSize: '11px', color: 'var(--portal-text-muted)', margin: 0 }}>
                                      {formatFileSize(msg.arquivo_tamanho)}
                                    </p>
                                  </div>
                                </a>
                              )}

                              {/* Time + read receipt */}
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                gap: '4px', marginTop: '3px',
                                ...(msg.tipo === 'imagem' || msg.tipo === 'video'
                                  ? { padding: '0 8px 4px' }
                                  : {})
                              }}>
                                <span style={{ fontSize: '10px', color: 'var(--portal-text-muted)' }}>
                                  {formatTime(msg.created_at)}
                                </span>
                                {isMine && chatAtual.tipo === 'individual' && (
                                  lida ? (
                                    <CheckCheck size={14} color="#3b82f6" strokeWidth={2.5} />
                                  ) : (
                                    <CheckCheck size={14} color="#a3a3a3" strokeWidth={2} />
                                  )
                                )}
                                {isMine && chatAtual.tipo === 'grupo' && (
                                  <Check size={14} color="#a3a3a3" strokeWidth={2} />
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ===== INPUT AREA ===== */}
              <div style={{
                padding: '12px 16px', background: 'var(--portal-bg-card)',
                borderTop: '1px solid var(--portal-border)', display: 'flex',
                alignItems: 'flex-end', gap: '8px', flexShrink: 0
              }}>
                {gravando ? (
                  /* Recording state */
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 16px', borderRadius: '12px',
                    background: '#fef2f2', border: '1px solid #fecaca'
                  }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: '#dc2626', animation: 'chatPulse 1s infinite'
                    }} />
                    <span style={{ fontSize: '14px', color: '#dc2626', fontWeight: '600', flex: 1 }}>
                      Gravando... {Math.floor(tempoGravacao / 60)}:{(tempoGravacao % 60).toString().padStart(2, '0')}
                    </span>
                    <button
                      onClick={stopRecording}
                      style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: '#dc2626', border: 'none', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Square size={14} fill="#fff" />
                    </button>
                  </div>
                ) : (
                  /* Normal input */
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFile}
                      style={{ display: 'none' }}
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        background: 'var(--portal-bg-secondary)', border: 'none', color: 'var(--portal-text-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#e5e5e5' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
                      title="Anexar arquivo"
                    >
                      <Paperclip size={18} />
                    </button>

                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'flex-end',
                      background: 'var(--portal-bg-secondary)', borderRadius: '20px',
                      border: '1px solid var(--portal-border)', padding: '0 14px',
                      transition: 'border-color 0.2s'
                    }}>
                      <textarea
                        ref={textareaRef}
                        value={msgText}
                        onChange={e => { setMsgText(e.target.value); handleTextareaInput() }}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite uma mensagem..."
                        rows={1}
                        style={{
                          flex: 1, border: 'none', background: 'none', outline: 'none',
                          fontSize: '13.5px', color: 'var(--portal-text)', fontFamily: 'Inter',
                          resize: 'none', padding: '10px 0',
                          height: '42px', maxHeight: '120px', lineHeight: '1.4'
                        }}
                      />
                    </div>

                    {msgText.trim() ? (
                      <button
                        onClick={handleSend}
                        style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                          border: 'none', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                          transition: 'all 0.2s', transform: 'scale(1)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <Send size={17} style={{ marginLeft: '2px' }} />
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          background: 'var(--portal-bg-secondary)', border: 'none', color: 'var(--portal-text-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e5e5e5' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
                        title="Gravar áudio"
                      >
                        <Mic size={18} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            /* No chat selected - placeholder */
            !chat.chatAtivo && mobileView !== 'list' ? null : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '16px', background: '#f5f5f0'
              }}
                className="chat-placeholder"
              >
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #fef2f2, #fecaca)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <MessageCircle size={36} color="#dc2626" />
                </div>
                <p style={{ color: 'var(--portal-text-secondary)', fontSize: '15px', fontWeight: '500' }}>
                  Selecione uma conversa
                </p>
                <p style={{ color: 'var(--portal-text-muted)', fontSize: '12px' }}>
                  ou inicie uma nova conversa clicando em +
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ===== NOVO CHAT MODAL ===== */}
      {novoChat && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 110,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div
            onClick={() => setNovoChat(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{
            position: 'relative', width: '440px', maxWidth: '90%',
            maxHeight: '80vh', background: 'var(--portal-bg-card)', borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
            animation: 'chatFadeIn 0.2s ease'
          }}>
            {/* Modal header */}
            <div style={{
              padding: '20px 24px 16px', borderBottom: '1px solid var(--portal-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--portal-text)' }}>
                Nova Conversa
              </h3>
              <button
                onClick={() => setNovoChat(false)}
                style={{
                  background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: '8px',
                  width: '32px', height: '32px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--portal-text-secondary)'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Type selector */}
            <div style={{ padding: '16px 24px 8px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setNovoChatTipo('individual'); setSelectedUsers([]) }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: novoChatTipo === 'individual' ? '2px solid #dc2626' : `2px solid var(--portal-border)`,
                  background: novoChatTipo === 'individual' ? '#fef2f2' : 'var(--portal-bg-card)',
                  color: novoChatTipo === 'individual' ? '#dc2626' : 'var(--portal-text-secondary)',
                  cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <UserIcon size={15} /> Individual
              </button>
              {isAdmin && (
                <button
                  onClick={() => { setNovoChatTipo('grupo'); setSelectedUsers([]) }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px',
                    border: novoChatTipo === 'grupo' ? '2px solid #dc2626' : `2px solid var(--portal-border)`,
                    background: novoChatTipo === 'grupo' ? '#fef2f2' : 'var(--portal-bg-card)',
                    color: novoChatTipo === 'grupo' ? '#dc2626' : 'var(--portal-text-secondary)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <Users size={15} /> Grupo
                </button>
              )}
            </div>

            {/* Group name */}
            {novoChatTipo === 'grupo' && (
              <div style={{ padding: '8px 24px' }}>
                <input
                  type="text"
                  placeholder="Nome do grupo..."
                  value={grupoNome}
                  onChange={e => setGrupoNome(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)',
                    fontSize: '13px', outline: 'none', fontFamily: 'Inter',
                    color: 'var(--portal-text)'
                  }}
                />
              </div>
            )}

            {/* Selected users pills */}
            {selectedUsers.length > 0 && (
              <div style={{
                padding: '4px 24px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px'
              }}>
                {selectedUsers.map(uid => {
                  const u = chat.todosUsuarios.find(x => x.id === uid)
                  return (
                    <span
                      key={uid}
                      onClick={() => setSelectedUsers(prev => prev.filter(id => id !== uid))}
                      style={{
                        padding: '4px 10px', borderRadius: '20px',
                        background: '#fef2f2', border: '1px solid #fecaca',
                        color: '#dc2626', fontSize: '11px', fontWeight: '600',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      {u?.nome?.split(' ')[0] || 'Usuário'}
                      <X size={12} />
                    </span>
                  )
                })}
              </div>
            )}

            {/* User search */}
            <div style={{ padding: '0 24px 8px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '10px',
                background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)'
              }}>
                <Search size={14} color="#a3a3a3" />
                <input
                  type="text"
                  placeholder="Buscar usuário..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  style={{
                    flex: 1, border: 'none', background: 'none', outline: 'none',
                    fontSize: '13px', color: 'var(--portal-text)', fontFamily: 'Inter'
                  }}
                />
              </div>
            </div>

            {/* User list */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '0 16px',
              maxHeight: '300px'
            }}>
              {filteredUsers.map(u => {
                const isSelected = selectedUsers.includes(u.id)
                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      if (novoChatTipo === 'individual') {
                        setSelectedUsers(isSelected ? [] : [u.id])
                      } else {
                        setSelectedUsers(prev =>
                          isSelected ? prev.filter(id => id !== u.id) : [...prev, u.id]
                        )
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      background: isSelected ? '#fef2f2' : 'transparent',
                      border: isSelected ? '1px solid #fecaca' : '1px solid transparent',
                      marginBottom: '2px', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? '#fef2f2' : 'transparent' }}
                  >
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '50%',
                      background: '#e5e5e5', overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <UserIcon size={18} color="#a3a3a3" />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--portal-text)', margin: 0 }}>
                        {u.nome}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--portal-text-muted)', margin: 0 }}>
                        {u.funcao || 'Colaborador'}
                      </p>
                    </div>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      border: isSelected ? 'none' : '2px solid #d4d4d4',
                      background: isSelected ? '#dc2626' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s'
                    }}>
                      {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Create button */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--portal-border)',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleNewChat}
                disabled={
                  criandoChat ||
                  selectedUsers.length === 0 ||
                  (novoChatTipo === 'grupo' && !grupoNome.trim())
                }
                style={{
                  padding: '10px 28px', borderRadius: '10px',
                  background: criandoChat ? '#a3a3a3'
                    : selectedUsers.length > 0
                      ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                      : '#e5e5e5',
                  color: (criandoChat || selectedUsers.length > 0) ? '#fff' : 'var(--portal-text-muted)',
                  border: 'none', fontSize: '13px', fontWeight: '700',
                  cursor: (criandoChat || selectedUsers.length === 0) ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: (!criandoChat && selectedUsers.length > 0) ? '0 4px 12px rgba(220,38,38,0.3)' : 'none'
                }}
              >
                {criandoChat ? 'Criando...' : (novoChatTipo === 'individual' ? 'Iniciar conversa' : 'Criar grupo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CSS ANIMATIONS ===== */}
      <style>{`
        @keyframes chatSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes chatPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Responsive: mobile */
        @media (max-width: 768px) {
          .chat-sidebar { width: 100% !important; border-right: none !important; }
          .chat-room { width: 100% !important; }
          .chat-placeholder { display: none !important; }
          .chat-back-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .chat-back-btn { display: none !important; }
          .chat-sidebar {
            ${chat.chatAtivo ? 'display: flex !important;' : ''}
          }
          .chat-room { display: flex !important; }
        }

        /* Scrollbar */
        .chat-sidebar::-webkit-scrollbar,
        .chat-room div::-webkit-scrollbar {
          width: 5px;
        }
        .chat-sidebar::-webkit-scrollbar-thumb,
        .chat-room div::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 10px;
        }

        /* Audio player styling */
        audio::-webkit-media-controls-panel {
          background: #f5f5f5;
        }
      `}</style>
    </div>
  )
}
