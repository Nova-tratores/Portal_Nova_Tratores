'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useChat } from '@/hooks/useChat'
import { useNotificacoes } from '@/hooks/useNotificacoes'
import { usePathname, useRouter } from 'next/navigation'
import {
  LogOut, Settings, ClipboardList, Wrench, FileText,
  DollarSign, Shield, Menu, X, User as UserIcon,
  LayoutDashboard, Bell, ChevronRight, Activity, Lock, MessageCircle,
  CheckCheck, Trash2, ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import ChatPanel from './chat/ChatPanel'

interface NavItem {
  id: string
  name: string
  href: string
  icon: React.ReactNode
  tag: string
  gradient: string
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={18} />,
    tag: 'INÍCIO',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)'
  },
  {
    id: 'financeiro',
    name: 'Financeiro',
    href: '/financeiro',
    icon: <DollarSign size={18} />,
    tag: 'FINANÇAS',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)'
  },
  {
    id: 'requisicoes',
    name: 'Requisições',
    href: '/requisicoes',
    icon: <ClipboardList size={18} />,
    tag: 'COMPRAS',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)'
  },
  {
    id: 'revisoes',
    name: 'Controle de Revisões',
    href: '/revisoes',
    icon: <Wrench size={18} />,
    tag: 'MANUTENÇÃO',
    gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)'
  },
  {
    id: 'pos',
    name: 'Pós-Vendas (OS)',
    href: '/pos',
    icon: <Settings size={18} />,
    tag: 'SERVIÇOS',
    gradient: 'linear-gradient(135deg, #dc2626, #991b1b)'
  },
  {
    id: 'ppv',
    name: 'Peças (Pedido de Venda)',
    href: '/ppv',
    icon: <Shield size={18} />,
    tag: 'PEÇAS',
    gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)'
  },
  {
    id: 'propostas',
    name: 'Proposta Comercial',
    href: '/propostas',
    icon: <FileText size={18} />,
    tag: 'VENDAS',
    gradient: 'linear-gradient(135deg, #991b1b, #7f1d1d)'
  },
  {
    id: 'atividades',
    name: 'Atividades',
    href: '/atividades',
    icon: <Activity size={18} />,
    tag: 'LOGS',
    gradient: 'linear-gradient(135deg, #dc2626, #991b1b)'
  }
]

// Ícone por tipo de notificação
const NOTIF_ICONS: Record<string, string> = {
  chat: '💬',
  financeiro: '💰',
  requisicao: '📋',
  revisao: '🔧',
  pos: '⚙️',
  ppv: '🛡️',
  proposta: '📄',
  admin: '🔒',
  sistema: '🔔',
}

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userProfile, loading, handleLogout } = useAuth()
  const { isAdmin, temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const chatData = useChat(userProfile?.id)
  const notifData = useNotificacoes(userProfile?.id)
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; chatId?: string; titulo: string; avatar: string | null; preview: string; tipo: string; link?: string; timestamp: number }[]>([])
  const lastChatNotifIdRef = useRef<string | null>(null)
  const lastSysNotifIdRef = useRef<string | null>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Refs estáveis
  const setChatAtivoRef = useRef(chatData.setChatAtivo)
  setChatAtivoRef.current = chatData.setChatAtivo
  const limparNotifRef = useRef(chatData.limparNotificacao)
  limparNotifRef.current = chatData.limparNotificacao

  // Fechar dropdown do sino ao clicar fora
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // === SOM ===
  const playSound = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.connect(gain1); gain1.connect(ctx.destination)
      osc1.frequency.value = 880; gain1.gain.value = 0.15
      osc1.start(ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc1.stop(ctx.currentTime + 0.15)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2); gain2.connect(ctx.destination)
      osc2.frequency.value = 1200; gain2.gain.value = 0.12
      osc2.start(ctx.currentTime + 0.18)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc2.stop(ctx.currentTime + 0.35)
      setTimeout(() => ctx.close(), 500)
    } catch { /* */ }
  }, [])

  // === PERMISSÃO NAVEGADOR ===
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // === TOAST DE CHAT ===
  const chatNotif = chatData.ultimaNotificacao
  useEffect(() => {
    if (!chatNotif || chatNotif.id === lastChatNotifIdRef.current) return
    lastChatNotifIdRef.current = chatNotif.id

    const toastId = 'chat-' + chatNotif.id
    setToasts(prev => [{
      id: toastId,
      chatId: chatNotif.chatId,
      titulo: chatNotif.chatTipo === 'grupo' ? chatNotif.chatNome : chatNotif.remetenteNome,
      avatar: chatNotif.remetenteAvatar,
      preview: chatNotif.chatTipo === 'grupo'
        ? `${chatNotif.remetenteNome.split(' ')[0]}: ${chatNotif.preview}`
        : chatNotif.preview,
      tipo: 'chat',
      timestamp: Date.now()
    }, ...prev].slice(0, 4))

    playSound()

    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(
        chatNotif.chatTipo === 'grupo' ? chatNotif.chatNome : chatNotif.remetenteNome,
        { body: chatNotif.preview, icon: chatNotif.remetenteAvatar || '/Logo_Nova.png', tag: 'chat-' + chatNotif.chatId, silent: true }
      )
      n.onclick = () => { window.focus(); setChatOpen(true); setChatAtivoRef.current(chatNotif.chatId); n.close() }
    }

    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)
    limparNotifRef.current()
  }, [chatNotif, playSound])

  // === TOAST DE SISTEMA (notificações gerais) ===
  const lastSysNotif = notifData.notificacoes[0]
  useEffect(() => {
    if (!lastSysNotif || lastSysNotif.lida || lastSysNotif.id === lastSysNotifIdRef.current) return
    lastSysNotifIdRef.current = lastSysNotif.id

    const toastId = 'sys-' + lastSysNotif.id
    setToasts(prev => [{
      id: toastId,
      titulo: lastSysNotif.titulo,
      avatar: null,
      preview: lastSysNotif.descricao || '',
      tipo: lastSysNotif.tipo,
      link: lastSysNotif.link || undefined,
      timestamp: Date.now()
    }, ...prev].slice(0, 4))

    playSound()

    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(lastSysNotif.titulo, { body: lastSysNotif.descricao || '', icon: '/Logo_Nova.png', silent: true })
    }

    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000)
  }, [lastSysNotif, playSound])

  const handleToastClick = (t: typeof toasts[0]) => {
    if (t.chatId) {
      setChatOpen(true)
      chatData.setChatAtivo(t.chatId)
    } else if (t.link) {
      router.push(t.link)
    }
    setToasts(prev => prev.filter(x => x.id !== t.id))
  }

  const dismissToast = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Total de notificações do sino (sistema + chat não lidas)
  const totalBell = notifData.naoLidas + chatData.totalNaoLidas

  const filteredNavItems = navItems.filter(item => {
    if (item.id === 'dashboard') return true
    return temAcesso(item.id)
  })

  // Items mesclados para o dropdown do sino
  const bellItems = [
    // Chats não lidos
    ...chatData.chats.filter(c => c.nao_lidas > 0).map(c => {
      const outro = c.membros.find(m => m.user_id !== userProfile?.id)
      return {
        id: 'chat-' + c.id,
        chatId: c.id,
        icone: '💬',
        titulo: c.tipo === 'grupo' ? (c.nome || 'Grupo') : (outro?.nome || 'Chat'),
        descricao: c.nao_lidas + (c.nao_lidas === 1 ? ' mensagem nova' : ' mensagens novas'),
        tempo: c.ultima_mensagem?.created_at || c.updated_at,
        lida: false,
        link: null as string | null,
        tipo: 'chat'
      }
    }),
    // Notificações do sistema
    ...notifData.notificacoes.slice(0, 20).map(n => ({
      id: n.id,
      chatId: null as string | null,
      icone: NOTIF_ICONS[n.tipo] || '🔔',
      titulo: n.titulo,
      descricao: n.descricao || '',
      tempo: n.created_at,
      lida: n.lida,
      link: n.link,
      tipo: n.tipo
    }))
  ].sort((a, b) => new Date(b.tempo).getTime() - new Date(a.tempo).getTime())

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            animation: 'pulse-glow 2s infinite'
          }} />
          <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '3px', fontWeight: '500' }}>
            CARREGANDO...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', position: 'relative' }}>
      {/* ===== TOP BAR (maior) ===== */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        padding: '0 32px', height: '72px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {/* Left: menu + logo maior */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none', border: 'none', color: '#737373',
              cursor: 'pointer', display: 'flex', padding: '8px',
              borderRadius: '8px', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <img
              src="/Logo_Nova.png"
              alt="Nova Tratores"
              style={{ height: '44px' }}
            />
          </Link>
        </div>

        {/* Right: chat + sino + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

          {/* Chat button */}
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: 'relative',
              background: chatData.totalNaoLidas > 0 ? '#fef2f2' : 'none',
              border: 'none',
              color: chatData.totalNaoLidas > 0 ? '#dc2626' : '#a3a3a3',
              cursor: 'pointer', padding: '10px',
              borderRadius: '10px', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = chatData.totalNaoLidas > 0 ? '#fee2e2' : '#f5f5f5' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = chatData.totalNaoLidas > 0 ? '#fef2f2' : 'none' }}
            title="Mensagens"
          >
            <MessageCircle size={20} />
            {chatData.totalNaoLidas > 0 && (
              <div className="notif-badge-pulse" style={{
                position: 'absolute', top: '2px', right: '0px',
                minWidth: '18px', height: '18px', borderRadius: '9px',
                background: '#dc2626', color: '#fff', fontSize: '10px',
                fontWeight: '700', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '0 5px',
                border: '2px solid #fff', boxShadow: '0 2px 6px rgba(220,38,38,0.4)'
              }}>
                {chatData.totalNaoLidas > 99 ? '99+' : chatData.totalNaoLidas}
              </div>
            )}
          </button>

          {/* ===== SINO / CENTRAL DE NOTIFICAÇÕES ===== */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setBellOpen(!bellOpen)}
              style={{
                position: 'relative',
                background: bellOpen ? '#fef2f2' : (totalBell > 0 ? '#fef2f2' : 'none'),
                border: 'none',
                color: totalBell > 0 ? '#dc2626' : '#a3a3a3',
                cursor: 'pointer', padding: '10px',
                borderRadius: '10px', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { if (!bellOpen) e.currentTarget.style.background = totalBell > 0 ? '#fee2e2' : '#f5f5f5' }}
              onMouseLeave={(e) => { if (!bellOpen) e.currentTarget.style.background = totalBell > 0 ? '#fef2f2' : 'none' }}
            >
              <Bell size={20} className={totalBell > 0 ? 'bell-ring' : ''} />
              {totalBell > 0 && (
                <div className="notif-badge-pulse" style={{
                  position: 'absolute', top: '2px', right: '0px',
                  minWidth: '18px', height: '18px', borderRadius: '9px',
                  background: '#dc2626', color: '#fff', fontSize: '10px',
                  fontWeight: '700', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 5px',
                  border: '2px solid #fff', boxShadow: '0 2px 6px rgba(220,38,38,0.4)'
                }}>
                  {totalBell > 99 ? '99+' : totalBell}
                </div>
              )}
            </button>

            {/* Dropdown do sino */}
            {bellOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: '400px', maxWidth: 'calc(100vw - 32px)',
                maxHeight: '480px',
                background: '#ffffff', borderRadius: '16px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'bellDropIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                {/* Header */}
                <div style={{
                  padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bell size={18} color="#dc2626" />
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>
                      Notificações
                    </span>
                    {totalBell > 0 && (
                      <span style={{
                        fontSize: '11px', fontWeight: '700', color: '#fff',
                        background: '#dc2626', padding: '2px 8px', borderRadius: '10px'
                      }}>
                        {totalBell}
                      </span>
                    )}
                  </div>
                  {totalBell > 0 && (
                    <button
                      onClick={() => { notifData.marcarTodasComoLidas() }}
                      style={{
                        background: 'none', border: 'none', color: '#dc2626',
                        fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '4px 8px', borderRadius: '6px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    >
                      <CheckCheck size={13} /> Marcar lidas
                    </button>
                  )}
                </div>

                {/* Lista */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {bellItems.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <Bell size={36} color="#e5e5e5" style={{ margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Nenhuma notificação</p>
                    </div>
                  ) : (
                    bellItems.map(item => (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (item.tipo === 'chat' && item.chatId) {
                            setChatOpen(true)
                            chatData.setChatAtivo(item.chatId)
                          } else if (item.link) {
                            router.push(item.link)
                            if (!item.lida && item.tipo !== 'chat') notifData.marcarComoLida(item.id)
                          }
                          setBellOpen(false)
                        }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '12px',
                          padding: '14px 20px', cursor: 'pointer',
                          background: item.lida ? 'transparent' : '#fffbfb',
                          borderBottom: '1px solid #f5f5f5',
                          borderLeft: item.lida ? '3px solid transparent' : '3px solid #dc2626',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = item.lida ? 'transparent' : '#fffbfb' }}
                      >
                        {/* Ícone */}
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '12px',
                          background: item.lida ? '#f5f5f5' : '#fef2f2',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', flexShrink: 0
                        }}>
                          {item.icone}
                        </div>

                        {/* Conteúdo */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: '13px', fontWeight: item.lida ? '500' : '700',
                            color: '#1a1a1a', margin: 0, marginBottom: '2px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {item.titulo}
                          </p>
                          <p style={{
                            fontSize: '12px', color: '#737373', margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {item.descricao}
                          </p>
                        </div>

                        {/* Tempo */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span style={{
                            fontSize: '10px', color: item.lida ? '#d4d4d4' : '#dc2626',
                            fontWeight: item.lida ? '400' : '600'
                          }}>
                            {timeAgo(item.tempo)}
                          </span>
                          {!item.lida && (
                            <div style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              background: '#dc2626', margin: '4px 0 0 auto'
                            }} />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Separador */}
          <div style={{ width: '1px', height: '32px', background: '#f0f0f0', margin: '0 4px' }} />

          {/* ===== USER (maior, com nome completo e setor) ===== */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '6px 16px 6px 6px', borderRadius: '14px',
            background: '#f5f5f5', cursor: 'pointer'
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px', overflow: 'hidden',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <UserIcon size={20} color="#fff" />
              )}
            </div>
            <div>
              <p style={{ fontSize: '13.5px', fontWeight: '700', color: '#1a1a1a', lineHeight: '1.2', margin: 0 }}>
                {userProfile?.nome || 'Usuário'}
              </p>
              <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '500', margin: 0, marginTop: '1px' }}>
                {userProfile?.funcao || 'Colaborador'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ===== SIDEBAR ===== */}
      <div style={{
        position: 'fixed', top: '72px', left: 0, bottom: 0,
        width: sidebarOpen ? '260px' : '0px', overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 40, background: '#ffffff',
        borderRight: sidebarOpen ? '1px solid #f0f0f0' : 'none',
        boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.04)' : 'none'
      }}>
        <div style={{ padding: '20px 16px', width: '260px' }}>
          {/* User card */}
          <div style={{
            padding: '16px', borderRadius: '14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            marginBottom: '20px'
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '10px'
            }}>
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <UserIcon size={20} color="#fff" />
                </div>
              )}
            </div>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a', marginBottom: '2px' }}>
              {userProfile?.nome || 'Usuário'}
            </p>
            <p style={{ fontSize: '11px', color: '#dc2626', fontWeight: '600', letterSpacing: '1px' }}>
              {userProfile?.funcao || 'Colaborador'}
            </p>
          </div>

          {/* Navigation */}
          <p style={{
            fontSize: '10px', fontWeight: '700', color: '#a3a3a3',
            letterSpacing: '2px', marginBottom: '10px', paddingLeft: '4px'
          }}>
            SISTEMAS
          </p>
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px', border: 'none',
                  background: isActive ? '#fef2f2' : 'transparent',
                  color: isActive ? '#dc2626' : '#737373',
                  cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? '600' : '500',
                  fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                  marginBottom: '2px', textDecoration: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#737373' }
                }}
              >
                <div style={{
                  width: '30px', height: '30px', borderRadius: '8px',
                  background: isActive ? item.gradient : '#f5f5f5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.2s'
                }}>
                  <span style={{ color: isActive ? '#fff' : '#a3a3a3', display: 'flex' }}>{item.icon}</span>
                </div>
                <span style={{ flex: 1 }}>{item.name}</span>
                {isActive && <ChevronRight size={14} style={{ color: '#dc2626' }} />}
              </Link>
            )
          })}

          {/* Admin */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: pathname === '/admin' ? '#fef2f2' : 'transparent',
                color: pathname === '/admin' ? '#dc2626' : '#737373',
                cursor: 'pointer', fontSize: '13px', fontWeight: pathname === '/admin' ? '600' : '500',
                fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                marginBottom: '2px', textDecoration: 'none', marginTop: '8px'
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/admin') { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/admin') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#737373' }
              }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: pathname === '/admin' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : '#f5f5f5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s'
              }}>
                <Lock size={14} style={{ color: pathname === '/admin' ? '#fff' : '#a3a3a3' }} />
              </div>
              <span style={{ flex: 1 }}>Administração</span>
              {pathname === '/admin' && <ChevronRight size={14} style={{ color: '#dc2626' }} />}
            </Link>
          )}

          {/* Logout */}
          <div style={{
            borderTop: '1px solid #f0f0f0',
            marginTop: '16px', paddingTop: '16px'
          }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: '#fef2f2', color: '#dc2626',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                fontFamily: 'Inter', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2' }}
            >
              <LogOut size={16} />
              Sair do Portal
            </button>
          </div>
        </div>
      </div>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, top: '72px',
            background: 'rgba(0,0,0,0.2)', zIndex: 35,
            transition: 'opacity 0.3s'
          }}
        />
      )}

      {/* ===== MAIN CONTENT ===== */}
      <main style={{
        marginLeft: sidebarOpen ? '260px' : '0px',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: 'calc(100vh - 72px)'
      }}>
        {children}
      </main>

      {/* ===== CHAT PANEL ===== */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chat={chatData}
        userId={userProfile?.id}
        userProfile={userProfile}
        isAdmin={isAdmin}
      />

      {/* ===== TOASTS ===== */}
      <div style={{
        position: 'fixed', top: '88px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        zIndex: 200, pointerEvents: 'none'
      }}>
        {toasts.map((t, i) => (
          <div
            key={t.id}
            onClick={() => handleToastClick(t)}
            className="notif-toast"
            style={{
              width: '380px', maxWidth: 'calc(100vw - 48px)',
              background: '#ffffff', borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #fecaca', cursor: 'pointer',
              overflow: 'hidden', pointerEvents: 'auto',
              animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: i > 1 ? 0.8 : 1
            }}
          >
            <div style={{ height: '3px', background: 'linear-gradient(90deg, #dc2626, #ef4444, #dc2626)', backgroundSize: '200% 100%', animation: 'toastBarShimmer 2s linear infinite' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: t.tipo === 'chat' ? '#fef2f2' : '#f5f5f5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', flexShrink: 0, overflow: 'hidden'
              }}>
                {t.avatar ? (
                  <img src={t.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  NOTIF_ICONS[t.tipo] || '🔔'
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a' }}>{t.titulo}</span>
                  <span style={{ fontSize: '9px', fontWeight: '800', color: '#fff', background: '#dc2626', padding: '2px 7px', borderRadius: '4px' }}>NOVA</span>
                </div>
                <p style={{ fontSize: '13px', color: '#525252', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.preview}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                <div style={{ padding: '7px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontSize: '11px', fontWeight: '700', textAlign: 'center' }}>
                  {t.chatId ? 'Abrir' : 'Ver'}
                </div>
                <button onClick={(e) => dismissToast(e, t.id)} style={{ background: 'none', border: 'none', color: '#a3a3a3', fontSize: '10px', cursor: 'pointer', padding: '2px' }}>Fechar</button>
              </div>
            </div>
            <div style={{ height: '3px', background: '#f5f5f5' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #dc2626, #ef4444)', animation: 'toastProgress 6s linear forwards' }} />
            </div>
          </div>
        ))}
      </div>

      {/* ===== CSS ===== */}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(120%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes toastBarShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes notifPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes bellDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bellRing {
          0% { transform: rotate(0); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-14deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-6deg); }
          50% { transform: rotate(0); }
          100% { transform: rotate(0); }
        }
        .notif-badge-pulse {
          animation: notifPulse 2s ease-in-out infinite;
        }
        .bell-ring {
          animation: bellRing 1s ease-in-out infinite;
          transform-origin: top center;
        }
        .notif-toast {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .notif-toast:hover {
          box-shadow: 0 12px 44px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12) !important;
          transform: translateY(-2px) scale(1.01) !important;
          border-color: #dc2626 !important;
        }
      `}</style>
    </div>
  )
}
