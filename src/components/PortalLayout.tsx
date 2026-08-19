'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth, revalidarSessao } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useChat } from '@/hooks/useChat'
import { useNotificacoes } from '@/hooks/useNotificacoes'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import AcessoBloqueado from '@/components/AcessoBloqueado'
import { usePathname, useRouter } from 'next/navigation'
import TratorinoChat from '@/components/TratorinoChat'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  LogOut, Settings, ClipboardList, Wrench, FileText,
  DollarSign, Package, Menu, X, User as UserIcon,
  LayoutDashboard, Bell, ChevronRight, ChevronDown, Activity, Lock, MessageCircle, Columns,
  CheckCheck, Trash2, ExternalLink, Calendar, Users, Calculator, BarChart3, Eye, Camera, Wheat, Megaphone,
  Sun, Moon, Volume2, Check, MapPin, ShieldCheck, Building, SlidersHorizontal, AlertCircle, Headset,
  LayoutGrid, List, CircleDot, GanttChartSquare, Clock, Truck, Bot, Ticket
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ChatPanel from './chat/ChatPanel'
import LembretesPanel from './lembretes/LembretesPanel'
import LembreteAlerta from './lembretes/LembreteAlerta'
import OrcamentoVencidoAlerta from './orcamentos/OrcamentoVencidoAlerta'
import NotifPrefsModal from './notif/NotifPrefsModal'
import OpaLembrete from './opa/OpaLembrete'
import SatLembrete from './sat/SatLembrete'

interface NavItem {
  id: string
  name: string
  href: string
  icon: React.ReactNode
  tag: string
  gradient: string
  group: string
  external?: boolean
}

const GROUP_CONFIG: Record<string, { label: string; color: string; gradient: string }> = {
  geral:      { label: '',            color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
  servicos:   { label: 'SERVIÇOS',    color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)' },
  pecas:      { label: 'PEÇAS',       color: '#F97316', gradient: 'linear-gradient(135deg, #F97316, #EA580C)' },
  financeiro: { label: 'FINANCEIRO',  color: '#10B981', gradient: 'linear-gradient(135deg, #10B981, #059669)' },
  comercial:  { label: 'COMERCIAL',   color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626, #991B1B)' },
  estoque:    { label: 'ESTOQUE',     color: '#94A3B8', gradient: 'linear-gradient(135deg, #CBD5E1, #94A3B8)' },
  frota:      { label: 'FROTA',       color: '#1E40AF', gradient: 'linear-gradient(135deg, #1D4ED8, #1E3A8A)' },
  outros:     { label: 'OUTROS',      color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #4B5563)' },
}

// ⚠️ Um grupo que não esteja AQUI não renderiza (o groupedNav itera esta lista).
const GROUP_ORDER = ['geral', 'servicos', 'pecas', 'financeiro', 'comercial', 'estoque', 'frota', 'outros']

const navItems: NavItem[] = [
  // Geral
  { id: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} />, tag: 'INÍCIO', gradient: '', group: 'geral' },
  { id: 'tickets', name: 'Tickets', href: '/tickets', icon: <Ticket size={18} />, tag: 'DEMANDAS', gradient: '', group: 'geral' },

  // Serviços (azul claro)
  { id: 'pos', name: 'Pós-Vendas (OS)', href: '/pos', icon: <Settings size={18} />, tag: 'OS', gradient: '', group: 'servicos' },
  { id: 'garantias', name: 'Garantias', href: '/garantias', icon: <ShieldCheck size={18} />, tag: 'GARANTIAS', gradient: '', group: 'servicos' },
  { id: 'revisoes', name: 'Controle de Revisões', href: '/revisoes', icon: <Wrench size={18} />, tag: 'MANUTENÇÃO', gradient: '', group: 'servicos' },
  { id: 'mecanicos', name: 'Janela Mecânico', href: '/mecanicos', icon: <Users size={18} />, tag: 'TÉCNICOS', gradient: '', group: 'servicos' },
  { id: 'sat', name: 'SAT Digital', href: '/sat', icon: <Headset size={18} />, tag: 'ATENDIMENTO', gradient: '', group: 'servicos' },
  { id: 'mapa-geral', name: 'Mapeamento Técnico', href: '/mapa-geral', icon: <MapPin size={18} />, tag: 'MAPA', gradient: '', group: 'servicos' },
  { id: 'fotos-tecnicos', name: 'Fotos Técnicos', href: '/fotos-tecnicos', icon: <Camera size={18} />, tag: 'FOTOS', gradient: '', group: 'servicos' },
  { id: 'lousa', name: 'Lousa Virtual', href: '/lousa', icon: <Calendar size={18} />, tag: 'AGENDA', gradient: '', group: 'servicos' },
  { id: 'cronograma', name: 'Cronograma', href: '/cronograma', icon: <GanttChartSquare size={18} />, tag: 'GANTT', gradient: '', group: 'servicos' },

  // Peças (laranja)
  { id: 'ppv', name: 'Peças (Pedido de Venda)', href: '/ppv', icon: <Package size={18} />, tag: 'PEÇAS', gradient: '', group: 'pecas' },
  { id: 'orcamentos', name: 'Orçamentos', href: '/orcamentos', icon: <Calculator size={18} />, tag: 'ORÇAMENTOS', gradient: '', group: 'pecas' },
  { id: 'requisicoes', name: 'Requisições', href: '/requisicoes', icon: <ClipboardList size={18} />, tag: 'COMPRAS', gradient: '', group: 'pecas' },

  // Financeiro (verde)
  { id: 'financeiro', name: 'Financeiro', href: '/financeiro', icon: <DollarSign size={18} />, tag: 'FINANÇAS', gradient: '', group: 'financeiro' },
  { id: 'dre', name: 'DRE Financeiro', href: '/dre-financeiro', icon: <DollarSign size={18} />, tag: 'DRE', gradient: '', group: 'financeiro' },

  // Comercial (roxo)
  { id: 'propostas', name: 'Proposta Comercial', href: '/propostas', icon: <FileText size={18} />, tag: 'VENDAS', gradient: '', group: 'comercial' },
  { id: 'feedbacks', name: 'Feedbacks & CRM', href: '/feedbacks', icon: <Megaphone size={18} />, tag: 'CRM', gradient: '', group: 'comercial' },
  { id: 'clientes', name: 'Clientes', href: '/clientes', icon: <Building size={18} />, tag: 'CLIENTES', gradient: '', group: 'comercial' },
  { id: 'supervisor-vendas', name: 'Supervisor Vendas', href: '/supervisor-vendas', icon: <SlidersHorizontal size={18} />, tag: 'VENDAS', gradient: '', group: 'comercial' },

  // Estoque (vermelho)
  { id: 'consulta-estoque', name: 'Visual Estoque', href: '/visual-estoque', icon: <BarChart3 size={18} />, tag: 'VISUAL', gradient: '', group: 'estoque' },
  { id: 'estoque', name: 'Consulta Estoque', href: '/estoque', icon: <Eye size={18} />, tag: 'CONSULTA', gradient: '', group: 'estoque' },
  { id: 'ajustes', name: 'Ajustes Estoque', href: '/ajustes', icon: <SlidersHorizontal size={18} />, tag: 'AJUSTES', gradient: '', group: 'estoque' },
  // Frota: o Abastecimento virou submódulo (/frota/abastecimento), então o item
  // solto dele saiu daqui — quem tem a permissão antiga entra pelo Frota
  // (compat de chaves legadas removida em 16/07).
  { id: 'frota', name: 'Frota', href: '/frota', icon: <Truck size={18} />, tag: 'VEÍCULOS', gradient: '', group: 'frota' },
  { id: 'pendencias', name: 'Pendências Frota', href: '/pendencias', icon: <Wrench size={18} />, tag: 'PENDÊNCIAS', gradient: '', group: 'frota' },

  // Outros (cinza)
  { id: 'opa', name: 'Opa', href: '/opa', icon: <AlertCircle size={18} />, tag: 'OCORRÊNCIAS', gradient: '', group: 'outros' },
  { id: 'atividades', name: 'Atividades', href: '/atividades', icon: <Activity size={18} />, tag: 'LOGS', gradient: '', group: 'outros' },
  { id: 'dashboard-agro', name: 'Dashboard Agro', href: 'https://dashboard-agro-sp-production.up.railway.app/', icon: <Wheat size={18} />, tag: 'AGRO', gradient: '', group: 'outros', external: true },
]

// Ícone por tipo de notificação (lucide — sem emojis)
const NOTIF_ICONS: Record<string, import('react').ReactNode> = {
  chat: <MessageCircle size={18} />,
  financeiro: <DollarSign size={18} />,
  requisicao: <ClipboardList size={18} />,
  revisao: <Wrench size={18} />,
  pos: <Settings size={18} />,
  ppv: <Package size={18} />,
  garantia: <ShieldCheck size={18} />,
  proposta: <FileText size={18} />,
  admin: <Lock size={18} />,
  sistema: <Bell size={18} />,
  tickets: <Ticket size={18} />,
  frota: <Truck size={18} />,
}

// Cor de acento por tipo de notificação
const NOTIF_COLORS: Record<string, string> = {
  chat: '#3b82f6', financeiro: '#10b981', requisicao: '#f97316', revisao: '#0ea5e9',
  pos: '#0ea5e9', ppv: '#f97316', garantia: '#0ea5e9', proposta: '#8b5cf6',
  admin: '#dc2626', sistema: '#6b7280', tickets: '#0891b2', frota: '#0d9488',
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

// Sons de notificação gerados via AudioContext
const SONS_NOTIFICACAO = [
  { id: 'classico', label: 'Clássico', play: (ctx: AudioContext) => {
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain()
    o1.connect(g1); g1.connect(ctx.destination)
    o1.frequency.value = 880; g1.gain.value = 0.15
    o1.start(ctx.currentTime); g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); o1.stop(ctx.currentTime + 0.15)
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain()
    o2.connect(g2); g2.connect(ctx.destination)
    o2.frequency.value = 1200; g2.gain.value = 0.12
    o2.start(ctx.currentTime + 0.18); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35); o2.stop(ctx.currentTime + 0.35)
  }},
  { id: 'suave', label: 'Suave', play: (ctx: AudioContext) => {
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'sine'; o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 523; g.gain.value = 0.12
    o.start(ctx.currentTime); o.frequency.linearRampToValueAtTime(659, ctx.currentTime + 0.3)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.stop(ctx.currentTime + 0.5)
  }},
  { id: 'alerta', label: 'Alerta', play: (ctx: AudioContext) => {
    [0, 0.15, 0.30].forEach(delay => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'square'; o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 1000; g.gain.value = 0.08
      o.start(ctx.currentTime + delay); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1); o.stop(ctx.currentTime + delay + 0.1)
    })
  }},
  { id: 'melodia', label: 'Melodia', play: (ctx: AudioContext) => {
    const notas = [659, 784, 880]
    notas.forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.connect(g); g.connect(ctx.destination)
      o.frequency.value = freq; g.gain.value = 0.1
      const t = ctx.currentTime + i * 0.15
      o.start(t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.stop(t + 0.2)
    })
  }},
  { id: 'ping', label: 'Ping', play: (ctx: AudioContext) => {
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'sine'; o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 1400; g.gain.value = 0.15
    o.start(ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); o.stop(ctx.currentTime + 0.25)
  }},
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userProfile, setUserProfile, loading, handleLogout, bloqueio } = useAuth()
  const { permissoes, isAdmin, temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const chatData = useChat(userProfile?.id)
  const notifData = useNotificacoes(userProfile?.id)

  // Aba parada horas (ou máquina que dormiu): ao voltar o foco, confirmar no servidor
  // que a sessão continua de pé em vez de seguir a mostrar o portal como se estivesse.
  useRefreshOnFocus(revalidarSessao, 60_000)

  // Onde o Tratorilson aparece: 'flutuante' (ícone móvel) ou 'chat' (conversa fixa no painel de Mensagens)
  const [tratorilsonLocal, setTratorilsonLocal] = useState<'flutuante' | 'chat'>('flutuante')
  useEffect(() => {
    try { const v = localStorage.getItem('tratorilson_local'); if (v === 'chat' || v === 'flutuante') setTratorilsonLocal(v) } catch {}
  }, [])
  const mudarTratorilsonLocal = useCallback((v: 'flutuante' | 'chat') => {
    setTratorilsonLocal(v)
    try { localStorage.setItem('tratorilson_local', v) } catch {}
  }, [])
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [lembretesOpen, setLembretesOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  // Rodando dentro de um painel da tela dividida (/split)? Esconde o botão de dividir.
  const [emIframe, setEmIframe] = useState(false)
  useEffect(() => { try { setEmIframe(window.self !== window.top) } catch { setEmIframe(true) } }, [])
  // Tooltip da notificação (mostra o conteúdo completo ao passar o mouse)
  const [notifHover, setNotifHover] = useState<{ titulo: string; descricao: string; tempo: any; tipo: string; top: number; left: number } | null>(null)
  const [topMenuOpen, setTopMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)  // menuzinho da foto (celular)
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; chatId?: string; titulo: string; avatar: string | null; preview: string; tipo: string; link?: string; timestamp: number }[]>([])
  const lastChatNotifIdRef = useRef<string | null>(null)
  const lastSysNotifIdRef = useRef<string | null>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const [avisosPendentes, setAvisosPendentes] = useState<{ id: string; titulo: string; conteudo: string; prioridade: string; criado_por_nome: string }[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [tema, setTema] = useState<'light' | 'dark'>('light')
  const [somId, setSomId] = useState('classico')

  // Aplicar tema ao carregar
  useEffect(() => {
    const saved = localStorage.getItem('portal-tema')
    if (saved === 'dark' || saved === 'light') {
      setTema(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  // Sincronizar tema do banco quando userProfile carrega
  useEffect(() => {
    if (!userProfile) return
    if (userProfile.tema === 'dark' || userProfile.tema === 'light') {
      setTema(userProfile.tema as 'light' | 'dark')
      document.documentElement.setAttribute('data-theme', userProfile.tema)
      localStorage.setItem('portal-tema', userProfile.tema)
    }
    if (userProfile.som_notificacao) {
      setSomId(userProfile.som_notificacao)
    }
  }, [userProfile])

  const alterarTema = async (novoTema: 'light' | 'dark') => {
    setTema(novoTema)
    document.documentElement.setAttribute('data-theme', novoTema)
    localStorage.setItem('portal-tema', novoTema)
    if (userProfile?.id) {
      await supabase.from('financeiro_usu').update({ tema: novoTema }).eq('id', userProfile.id)
    }
  }

  const alterarSom = async (novoSom: string) => {
    setSomId(novoSom)
    localStorage.setItem('portal-som', novoSom)
    // Tocar preview
    try {
      const ctx = new AudioContext()
      SONS_NOTIFICACAO.find(s => s.id === novoSom)?.play(ctx)
      setTimeout(() => ctx.close(), 1000)
    } catch { /* */ }
    if (userProfile?.id) {
      await supabase.from('financeiro_usu').update({ som_notificacao: novoSom }).eq('id', userProfile.id)
    }
  }

  // ===== Perfil (dentro das Configurações) =====
  const [configTab, setConfigTab] = useState<'perfil' | 'aparencia' | 'som'>('perfil')
  const [perfilNome, setPerfilNome] = useState('')
  // Modelo de exibição do dashboard (sincroniza com a chave que o Dashboard lê)
  const [dashView, setDashView] = useState<string>('grade')
  useEffect(() => {
    if (!userProfile?.id) return
    const v = localStorage.getItem(`portal-viewmode-${userProfile.id}`)
    if (v) setDashView(v)
  }, [userProfile?.id])
  const alterarDashView = (modo: string) => {
    setDashView(modo)
    if (userProfile?.id) localStorage.setItem(`portal-viewmode-${userProfile.id}`, modo)
  }
  const [novaSenha, setNovaSenha] = useState('')
  const [novaSenha2, setNovaSenha2] = useState('')
  const [perfilBusy, setPerfilBusy] = useState(false)
  const [perfilMsg, setPerfilMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (userProfile?.nome) setPerfilNome(userProfile.nome) }, [userProfile?.nome])

  const salvarNome = async () => {
    if (!userProfile?.id || !perfilNome.trim()) return
    setPerfilBusy(true); setPerfilMsg(null)
    const { error } = await supabase.from('financeiro_usu').update({ nome: perfilNome.trim() }).eq('id', userProfile.id)
    if (error) setPerfilMsg({ tipo: 'err', texto: 'Erro ao salvar o nome.' })
    else { setUserProfile(p => p ? { ...p, nome: perfilNome.trim() } : p); setPerfilMsg({ tipo: 'ok', texto: 'Nome atualizado!' }) }
    setPerfilBusy(false)
  }

  const uploadAvatar = async (file: File) => {
    if (!userProfile?.id) return
    setPerfilBusy(true); setPerfilMsg(null)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `avatares/${userProfile.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const url = supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl
      await supabase.from('financeiro_usu').update({ avatar_url: url }).eq('id', userProfile.id)
      setUserProfile(p => p ? { ...p, avatar_url: url } : p)
      setPerfilMsg({ tipo: 'ok', texto: 'Foto atualizada!' })
    } catch { setPerfilMsg({ tipo: 'err', texto: 'Erro ao enviar a foto.' }) }
    setPerfilBusy(false)
  }

  const trocarSenha = async () => {
    if (novaSenha.length < 6) { setPerfilMsg({ tipo: 'err', texto: 'A senha precisa de ao menos 6 caracteres.' }); return }
    if (novaSenha !== novaSenha2) { setPerfilMsg({ tipo: 'err', texto: 'As senhas não coincidem.' }); return }
    setPerfilBusy(true); setPerfilMsg(null)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) setPerfilMsg({ tipo: 'err', texto: 'Erro ao alterar senha: ' + error.message })
    else { setNovaSenha(''); setNovaSenha2(''); setPerfilMsg({ tipo: 'ok', texto: 'Senha alterada com sucesso!' }) }
    setPerfilBusy(false)
  }

  // Carregar avisos não confirmados + realtime
  useEffect(() => {
    if (!userProfile?.id) return
    const carregarPendentes = async () => {
      const { data: avisos } = await supabase
        .from('portal_avisos')
        .select('id, titulo, conteudo, prioridade, criado_por_nome')
        .eq('ativo', true)
        .order('created_at', { ascending: true })
      if (!avisos || avisos.length === 0) { setAvisosPendentes([]); return }
      const { data: lidos } = await supabase
        .from('portal_avisos_lidos')
        .select('aviso_id')
        .eq('user_id', userProfile.id)
      const lidosSet = new Set((lidos || []).map((l: any) => l.aviso_id))
      setAvisosPendentes(avisos.filter(a => !lidosSet.has(a.id)))
    }
    carregarPendentes()
    const ch = supabase.channel('portal_aviso_popup')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_avisos' }, () => carregarPendentes())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userProfile?.id])

  const confirmarAviso = async () => {
    if (!userProfile?.id || avisosPendentes.length === 0) return
    setConfirmando(true)
    const aviso = avisosPendentes[0]
    const { error } = await supabase.from('portal_avisos_lidos').upsert({
      aviso_id: aviso.id,
      user_id: userProfile.id,
      lido_at: new Date().toISOString(),
    }, { onConflict: 'aviso_id,user_id' })
    if (!error) {
      setAvisosPendentes(prev => prev.filter(a => a.id !== aviso.id))
    }
    setConfirmando(false)
  }

  // Refs estáveis
  const setChatAtivoRef = useRef(chatData.setChatAtivo)
  setChatAtivoRef.current = chatData.setChatAtivo
  const limparNotifRef = useRef(chatData.limparNotificacao)
  limparNotifRef.current = chatData.limparNotificacao

  // Fechar dropdown do sino + menu cascata ao clicar fora
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node
      const inMenu = bellRef.current && bellRef.current.contains(t)
      const inNotifBtn = notifBtnRef.current && notifBtnRef.current.contains(t)
      if (!inMenu && !inNotifBtn) { setBellOpen(false); setTopMenuOpen(false) }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // === SOM ===
  const playSound = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const som = SONS_NOTIFICACAO.find(s => s.id === somId) || SONS_NOTIFICACAO[0]
      som.play(ctx)
      setTimeout(() => ctx.close(), 1000)
    } catch { /* */ }
  }, [somId])

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

  const filteredNavItems = useMemo(() => navItems.filter(item => {
    if (item.id === 'dashboard' || item.id === 'opa' || item.id === 'sat') return true
    if (temAcesso(item.id)) return true
    // Visibilidade quando o usuário tem permissão por sub-página (ex.: 'ajustes:inventario')
    return (permissoes?.modulos_permitidos || []).some(m => m.startsWith(item.id + ':'))
  }), [temAcesso, permissoes])

  // ══ Atalhos dos apps mais usados (ao lado da logo) ══
  // Contamos a VISITA da rota, não o clique no card do dashboard: assim entra na
  // conta quem chegou pelo menu lateral, por notificação ou por link direto.
  const usoKey = userProfile?.id ? `portal-uso-${userProfile.id}` : ''
  const [uso, setUso] = useState<Record<string, number>>({})

  // Só depende da ROTA — nada de identidade de função aqui. `filteredNavItems`
  // muda de identidade a cada render (o temAcesso do usePermissoes não é
  // memoizado); usá-lo como dependência de um efeito que faz setState vira
  // laço infinito. Por isso a lista sai de um useMemo, e não de um estado.
  useEffect(() => {
    if (!usoKey || !pathname) { setUso({}); return }
    let atual: Record<string, number> = {}
    try { atual = JSON.parse(localStorage.getItem(usoKey) || '{}') } catch { }
    const item = navItems
      .filter(i => !i.external && i.href !== '/dashboard' && (pathname === i.href || pathname.startsWith(i.href + '/')))
      .sort((a, b) => b.href.length - a.href.length)[0]   // rota mais específica vence
    if (item) {
      atual = { ...atual, [item.id]: (atual[item.id] || 0) + 1 }
      localStorage.setItem(usoKey, JSON.stringify(atual))
    }
    setUso(atual)
  }, [pathname, usoKey])

  const maisUsados = useMemo(() => filteredNavItems
    .filter(i => i.id !== 'dashboard' && (uso[i.id] || 0) > 0)
    .sort((a, b) => (uso[b.id] || 0) - (uso[a.id] || 0))
    .slice(0, 7), [filteredNavItems, uso])

  const groupedNav = useMemo(() => {
    const groups: { key: string; config: typeof GROUP_CONFIG[string]; items: NavItem[] }[] = []
    for (const gk of GROUP_ORDER) {
      const items = filteredNavItems.filter(i => i.group === gk)
      if (items.length > 0) groups.push({ key: gk, config: GROUP_CONFIG[gk], items })
    }
    return groups
  }, [filteredNavItems])

  // Items mesclados para o dropdown do sino
  const bellItems = useMemo(() => [
    // Chats não lidos
    ...chatData.chats.filter(c => c.nao_lidas > 0).map(c => {
      const outro = c.membros.find(m => m.user_id !== userProfile?.id)
      return {
        id: 'chat-' + c.id,
        chatId: c.id,
        icone: 'chat',
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
      icone: NOTIF_ICONS[n.tipo] || <Bell size={18} />,
      titulo: n.titulo,
      descricao: n.descricao || '',
      tempo: n.created_at,
      lida: n.lida,
      link: n.link,
      tipo: n.tipo
    }))
  ].sort((a, b) => new Date(b.tempo).getTime() - new Date(a.tempo).getTime()), [chatData.chats, notifData.notificacoes, userProfile?.id])

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--portal-bg)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            animation: 'pulse-glow 2s infinite'
          }} />
          <p style={{ color: 'var(--portal-text-muted)', fontSize: '13px', letterSpacing: '3px', fontWeight: '500' }}>
            CARREGANDO...
          </p>
        </div>
      </div>
    )
  }

  // Sem perfil não se renderiza portal nenhum: era daqui que saía o utilizador
  // genérico "Usuário / Colaborador", com o menu encolhido, a fingir um login.
  if (bloqueio || !userProfile) {
    return <AcessoBloqueado motivo={bloqueio ?? 'erro'} />
  }

  return (
    <div className={tema === 'dark' ? 'portal-dark' : ''} style={{ minHeight: '100vh', background: 'var(--portal-bg)', position: 'relative' }}>
      {/* ===== TOP BAR (maior) ===== */}
      <header className="portal-header" style={{
        position: 'sticky', top: 0, zIndex: 50,
        padding: '0 32px', height: '84px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--portal-header-bg)',
        borderBottom: '1px solid var(--portal-border)',
        boxShadow: `0 1px 3px var(--portal-shadow)`
      }}>
        {/* Left: menu + logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none', border: 'none', color: 'var(--portal-text-secondary)',
              cursor: 'pointer', display: 'flex', padding: '8px',
              borderRadius: '8px', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <img
              src="/Logo_Nova.png"
              alt="Nova Tratores"
              className="portal-logo"
              style={{ height: '50px' }}
            />
          </Link>

          {/* Apps mais usados — atalho direto, sem passar pelo dashboard.
              Escondidos em tela estreita (a top bar não comporta). */}
          {maisUsados.length > 0 && (
            <div className="topbar-atalhos" style={{
              display: 'flex', alignItems: 'center', gap: 3,
              paddingLeft: 14, borderLeft: '1px solid var(--portal-border)',
            }}>
              {maisUsados.map(item => {
                const ativo = pathname === item.href || pathname.startsWith(item.href + '/')
                const cor = GROUP_CONFIG[item.group]?.color || '#dc2626'
                const curto = item.name.replace(/\s*\(.*?\)\s*/g, '').trim()
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={`${item.name} — atalho (um dos seus mais usados)`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 13px', borderRadius: 10, textDecoration: 'none',
                      background: ativo ? `${cor}18` : 'transparent',
                      color: ativo ? cor : 'var(--portal-text-secondary)',
                      fontSize: 13.5, fontWeight: 400, whiteSpace: 'nowrap',
                      transition: 'background .18s, color .18s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${cor}18`; e.currentTarget.style.color = cor }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = ativo ? `${cor}18` : 'transparent'
                      e.currentTarget.style.color = ativo ? cor : 'var(--portal-text-secondary)'
                    }}
                  >
                    <span style={{ display: 'flex', color: cor }}>{item.icon}</span>
                    {curto}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: chat + sino + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

          {/* Tela dividida: dois sistemas lado a lado (some quando o portal
              está DENTRO de um painel da /split, pra não aninhar) */}
          {!emIframe && (
            <button
              onClick={() => { window.location.href = '/split' }}
              title="Tela dividida — dois sistemas lado a lado"
              style={{
                position: 'relative', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
                color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: '11px', borderRadius: '12px',
                display: 'flex', alignItems: 'center', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
            >
              <Columns size={20} />
            </button>
          )}

          {/* Ícone Chat */}
          <button
            className="portal-chat-btn"
            onClick={() => setChatOpen(true)}
            title="Chat"
            style={{
              position: 'relative', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
              color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: '11px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
          >
            <MessageCircle size={20} />
            {chatData.totalNaoLidas > 0 && (
              <span style={{
                position: 'absolute', top: '-5px', right: '-5px', minWidth: 18, height: 18, borderRadius: 9,
                background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid var(--portal-header-bg)'
              }}>{chatData.totalNaoLidas > 99 ? '99+' : chatData.totalNaoLidas}</span>
            )}
          </button>

          {/* Ícone Notificações */}
          <button
            ref={notifBtnRef}
            onClick={() => { setBellOpen((o) => !o); setTopMenuOpen(false) }}
            title="Notificações"
            style={{
              position: 'relative', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
              color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: '11px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
          >
            <Bell size={20} className={notifData.naoLidas > 0 ? 'bell-ring' : ''} />
            {notifData.naoLidas > 0 && (
              <span className="notif-badge-pulse" style={{
                position: 'absolute', top: '-5px', right: '-5px', minWidth: 18, height: 18, borderRadius: 9,
                background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid var(--portal-header-bg)'
              }}>{notifData.naoLidas > 99 ? '99+' : notifData.naoLidas}</span>
            )}
          </button>

          {/* ===== MENU CASCATA (Lembretes, Configurações) + dropdown do sino ===== */}
          <div ref={bellRef} style={{ position: 'relative' }}
            onMouseEnter={() => { if (!bellOpen) setTopMenuOpen(true) }}
            onMouseLeave={() => setTopMenuOpen(false)}
          >
            <button
              className="portal-menu-btn"
              onClick={() => { if (!bellOpen) setTopMenuOpen(true) }}
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff',
                cursor: 'pointer', padding: '12px 18px', borderRadius: '12px', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '9px', fontSize: '14px', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 18px rgba(220,38,38,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.25)' }}
            >
              <Menu size={20} />
              <span className="portal-menu-label">Menu</span>
              <ChevronDown size={14} className="portal-menu-chevron" style={{ transform: topMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {/* Dropdown do menu cascata */}
            {topMenuOpen && (() => {
              const item = (icone: React.ReactNode, label: string, onClick: () => void, badge?: number) => (
                <button
                  onClick={() => { onClick(); setTopMenuOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', width: '100%',
                    border: 'none', borderRadius: '10px', cursor: 'pointer', background: 'transparent',
                    color: 'var(--portal-text)', fontSize: '14px', fontWeight: 600, textAlign: 'left', transition: 'background 0.12s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--portal-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ width: 20, display: 'flex', justifyContent: 'center', color: '#dc2626' }}>{icone}</span>
                  <span style={{ flex: 1 }}>{label}</span>
                  {!!badge && badge > 0 && (
                    <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{badge > 99 ? '99+' : badge}</span>
                  )}
                </button>
              )
              return (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', paddingTop: 8, zIndex: 10001,
                  minWidth: 260,
                }}>
                 <div style={{
                  background: 'var(--portal-bg-card)', borderRadius: 14,
                  border: '1px solid var(--portal-border)', boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
                  padding: 6, display: 'flex', flexDirection: 'column', gap: 2
                 }}>
                  {item(<Calendar size={18} />, 'Lembretes', () => setLembretesOpen(true))}
                  {item(<Settings size={18} />, 'Configurações', () => { setConfigTab('perfil'); setConfigOpen(true) })}
                 </div>
                </div>
              )
            })()}

            {/* Dropdown do sino — no celular fica colado às margens (quase tela cheia);
                antes o right:120px + largura fixa jogava a borda esquerda pra fora da tela. */}
            {bellOpen && (
              <div style={isMobile ? {
                position: 'fixed', top: '72px', left: 8, right: 8,
                maxHeight: 'calc(100vh - 90px)', zIndex: 10000,
                background: 'var(--portal-bg-card)', borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                border: `1px solid var(--portal-border)`,
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'bellDropIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
              } : {
                position: 'fixed', top: '92px', right: '120px',
                width: '420px', maxWidth: 'calc(100vw - 32px)',
                maxHeight: '520px', zIndex: 10000,
                background: 'var(--portal-bg-card)', borderRadius: '20px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.06)',
                border: `1px solid var(--portal-border)`,
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'bellDropIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                {/* Header */}
                <div style={{
                  padding: isMobile ? '14px 14px' : '20px 24px', borderBottom: `1px solid var(--portal-border)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                  background: 'var(--portal-bg-hover)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
                    }}>
                      <Bell size={16} color="#fff" />
                    </div>
                    <div>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--portal-text)', display: 'block' }}>
                        Notificações
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--portal-text-muted)' }}>
                        {totalBell > 0 ? `${totalBell} não ${totalBell === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      onClick={() => { setBellOpen(false); setNotifPrefsOpen(true) }}
                      title="Preferências de notificação — escolha o que receber"
                      style={{
                        background: 'var(--portal-bg-hover)', border: `1px solid var(--portal-border-hover)`,
                        color: 'var(--portal-text-secondary)',
                        fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '6px 10px', borderRadius: '8px', transition: 'all 0.2s'
                      }}
                    >
                      <SlidersHorizontal size={13} /> Preferências
                    </button>
                    {totalBell > 0 && (
                      <button
                        onClick={() => { notifData.marcarTodasComoLidas() }}
                        style={{
                          background: 'var(--portal-bg-hover)', border: `1px solid var(--portal-border-hover)`, color: '#dc2626',
                          fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '6px 12px', borderRadius: '8px', transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = tema === 'dark' ? '#3a1518' : '#fee2e2' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)' }}
                      >
                        <CheckCheck size={13} /> Marcar lidas
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {bellItems.length === 0 ? (
                    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{
                        width: '56px', height: '56px', borderRadius: '16px',
                        background: 'var(--portal-bg-secondary)', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Bell size={24} color="var(--portal-text-faint)" />
                      </div>
                      <p style={{ color: 'var(--portal-text-muted)', fontSize: '14px', fontWeight: '500' }}>Nenhuma notificação</p>
                      <p style={{ color: 'var(--portal-text-faint)', fontSize: '12px', marginTop: '4px' }}>Você está em dia!</p>
                    </div>
                  ) : (
                    bellItems.map(item => {
                      const cor = NOTIF_COLORS[item.tipo] || '#dc2626'
                      return (
                      <div
                        key={item.id}
                        className="notif-item"
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
                          display: 'flex', alignItems: 'center', gap: '14px',
                          padding: '14px 22px 14px 24px', cursor: 'pointer',
                          background: 'transparent', position: 'relative',
                          borderBottom: `1px solid var(--portal-border)`,
                          transition: 'background 0.18s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--portal-bg-secondary)'
                          const r = e.currentTarget.getBoundingClientRect()
                          const TW = 360
                          const left = r.left - TW - 12 >= 12 ? r.left - TW - 12 : Math.min(r.right + 12, window.innerWidth - TW - 12)
                          setNotifHover({ titulo: item.titulo, descricao: item.descricao, tempo: item.tempo, tipo: item.tipo, top: r.top, left: Math.max(12, left) })
                        }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; setNotifHover(null) }}
                      >
                        {/* Acento lateral (não lida) */}
                        {!item.lida && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: cor, borderRadius: '0 3px 3px 0' }} />}
                        {/* Ícone */}
                        <div className="notif-ava" style={{
                          width: '42px', height: '42px', borderRadius: '12px',
                          background: item.tipo === 'chat' && !item.lida ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : `${cor}1a`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: !item.lida && item.tipo === 'chat' ? '0 4px 12px rgba(59,130,246,0.25)' : 'none'
                        }}>
                          {item.tipo === 'chat' ? (
                            <MessageCircle size={18} color={!item.lida ? '#fff' : cor} />
                          ) : (
                            <span style={{ display: 'flex', color: cor }}>{item.icone}</span>
                          )}
                        </div>

                        {/* Conteúdo */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <p style={{
                              fontSize: '13px', fontWeight: item.lida ? '500' : '600',
                              color: 'var(--portal-text)', margin: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                              {item.titulo}
                            </p>
                            {!item.lida && (
                              <div style={{
                                width: '7px', height: '7px', borderRadius: '50%',
                                background: item.tipo === 'chat' ? '#3b82f6' : '#dc2626', flexShrink: 0
                              }} />
                            )}
                          </div>
                          <p style={{
                            fontSize: '12px', color: 'var(--portal-text-secondary)', margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {item.descricao}
                          </p>
                        </div>

                        {/* Tempo */}
                        <span style={{
                          fontSize: '11px', color: item.lida ? 'var(--portal-text-faint)' : 'var(--portal-text-muted)',
                          fontWeight: '500', flexShrink: 0
                        }}>
                          {timeAgo(item.tempo)}
                        </span>
                      </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User — no PC abre o Perfil; no celular abre o menuzinho (chat/menu/config) */}
          <div
            className="portal-user-chip"
            onClick={() => { if (isMobile) { setMobileMenuOpen(o => !o); setBellOpen(false) } else { setConfigTab('perfil'); setConfigOpen(true) } }}
            title={isMobile ? 'Menu' : 'Meu perfil'}
            style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '8px 18px 8px 8px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #b91c1c, #991b1b)',
            boxShadow: '0 4px 12px rgba(153,27,27,0.2)', cursor: 'pointer'
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px', overflow: 'hidden',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              {userProfile.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <UserIcon size={20} color="#fff" />
              )}
            </div>
            <div className="portal-user-name">
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', lineHeight: '1.2', margin: 0 }}>
                {userProfile.nome}
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: '400', margin: 0, marginTop: '2px' }}>
                {userProfile.funcao}
              </p>
            </div>

            {/* Menuzinho do celular (abre ao tocar na foto): chat, menu e config */}
            {isMobile && mobileMenuOpen && (
              <>
                <div onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 10000 }} />
                <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 10001, minWidth: 220, background: 'var(--portal-bg-card)', borderRadius: 14, border: '1px solid var(--portal-border)', boxShadow: '0 16px 40px rgba(0,0,0,0.22)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {([
                    [<MessageCircle size={18} key="c" />, 'Chat', () => setChatOpen(true), chatData.totalNaoLidas],
                    [<Calendar size={18} key="l" />, 'Lembretes', () => setLembretesOpen(true), 0],
                    [<UserIcon size={18} key="p" />, 'Meu perfil', () => { setConfigTab('perfil'); setConfigOpen(true) }, 0],
                    [<Settings size={18} key="s" />, 'Configurações', () => { setConfigTab('perfil'); setConfigOpen(true) }, 0],
                    [<LogOut size={18} key="x" />, 'Sair', () => handleLogout(), 0],
                  ] as [React.ReactNode, string, () => void, number][]).map(([ic, lab, fn, badge]) => (
                    <button key={lab} onClick={() => { fn(); setMobileMenuOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', width: '100%', border: 'none', borderRadius: 10, cursor: 'pointer', background: 'transparent', color: 'var(--portal-text)', fontSize: 15, fontWeight: 600, textAlign: 'left' }}>
                      <span style={{ width: 20, display: 'flex', justifyContent: 'center', color: '#dc2626' }}>{ic}</span>
                      <span style={{ flex: 1 }}>{lab}</span>
                      {badge > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{badge > 99 ? '99+' : badge}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== SIDEBAR ===== */}
      <div style={{
        position: 'fixed', top: '84px', left: 0, bottom: 0,
        width: sidebarOpen ? '260px' : '0px', overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 40, background: 'var(--portal-sidebar-bg)',
        borderRight: sidebarOpen ? '1px solid var(--portal-border)' : 'none',
        boxShadow: sidebarOpen ? `4px 0 20px var(--portal-shadow)` : 'none'
      }}>
        <div style={{ width: '260px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* User card */}
          <div style={{ padding: '20px 16px 0 16px', flexShrink: 0 }}>
          <div style={{
            padding: '16px', borderRadius: '14px',
            background: 'var(--portal-bg-hover)',
            border: '1px solid var(--portal-border-hover)',
            marginBottom: '20px'
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '10px'
            }}>
              {userProfile.avatar_url ? (
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
            <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--portal-text)', marginBottom: '2px' }}>
              {userProfile.nome}
            </p>
            <p style={{ fontSize: '11px', color: '#dc2626', fontWeight: '600', letterSpacing: '1px' }}>
              {userProfile.funcao}
            </p>
          </div>
          </div>

          {/* Navigation - scrollável */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', minHeight: 0 }}>
          {groupedNav.map((group) => (
            <div key={group.key} style={{ marginBottom: group.key === 'geral' ? 4 : 8 }}>
              {group.config.label && (
                <p style={{
                  fontSize: '9px', fontWeight: '800', color: group.config.color,
                  letterSpacing: '2px', margin: '14px 0 6px', paddingLeft: '4px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 12, height: 2, borderRadius: 1, background: group.config.color, opacity: 0.4 }} />
                  {group.config.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const gc = group.config
                return (
                  <Link
                    key={item.id}
                    href={item.external ? '#' : item.href}
                    onClick={(e) => {
                      setSidebarOpen(false)
                      if (item.external) {
                        e.preventDefault()
                        window.open(item.href, '_blank')
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '10px', border: 'none',
                      background: isActive ? `${gc.color}12` : 'transparent',
                      color: isActive ? gc.color : 'var(--portal-text-secondary)',
                      cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? '600' : '500',
                      fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                      marginBottom: '2px', textDecoration: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) { e.currentTarget.style.background = `${gc.color}0A`; e.currentTarget.style.color = gc.color }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }
                    }}
                  >
                    <div style={{
                      width: '30px', height: '30px', borderRadius: '8px',
                      background: isActive ? gc.gradient : 'var(--portal-bg-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s'
                    }}>
                      <span style={{ color: isActive ? '#fff' : 'var(--portal-text-muted)', display: 'flex' }}>{item.icon}</span>
                    </div>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {item.external && <ExternalLink size={11} style={{ color: 'var(--portal-text-muted)', opacity: 0.5 }} />}
                    {isActive && !item.external && <ChevronRight size={14} style={{ color: gc.color }} />}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* Sincronizações (catálogo de crons) */}
          {isAdmin && (
            <Link
              href="/agendamentos"
              onClick={() => setSidebarOpen(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: pathname === '/agendamentos' ? 'var(--portal-bg-hover)' : 'transparent',
                color: pathname === '/agendamentos' ? '#dc2626' : 'var(--portal-text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: pathname === '/agendamentos' ? '600' : '500',
                fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                marginBottom: '2px', textDecoration: 'none', marginTop: '8px'
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/agendamentos') { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/agendamentos') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }
              }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: pathname === '/agendamentos' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'var(--portal-bg-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s'
              }}>
                <Clock size={14} style={{ color: pathname === '/agendamentos' ? '#fff' : 'var(--portal-text-muted)' }} />
              </div>
              <span style={{ flex: 1 }}>Sincronizações</span>
              {pathname === '/agendamentos' && <ChevronRight size={14} style={{ color: '#dc2626' }} />}
            </Link>
          )}

          {/* Admin */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: pathname === '/admin' ? 'var(--portal-bg-hover)' : 'transparent',
                color: pathname === '/admin' ? '#dc2626' : 'var(--portal-text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: pathname === '/admin' ? '600' : '500',
                fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                marginBottom: '2px', textDecoration: 'none', marginTop: '8px'
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/admin') { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/admin') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }
              }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: pathname === '/admin' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'var(--portal-bg-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s'
              }}>
                <Lock size={14} style={{ color: pathname === '/admin' ? '#fff' : 'var(--portal-text-muted)' }} />
              </div>
              <span style={{ flex: 1 }}>Administração</span>
              {pathname === '/admin' && <ChevronRight size={14} style={{ color: '#dc2626' }} />}
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/tratorilson"
              onClick={() => setSidebarOpen(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: pathname === '/tratorilson' ? 'var(--portal-bg-hover)' : 'transparent',
                color: pathname === '/tratorilson' ? '#dc2626' : 'var(--portal-text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: pathname === '/tratorilson' ? '600' : '500',
                fontFamily: 'Inter', transition: 'all 0.2s', textAlign: 'left' as const,
                marginBottom: '2px', textDecoration: 'none'
              }}
              onMouseEnter={(e) => {
                if (pathname !== '/tratorilson') { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/tratorilson') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }
              }}
            >
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: pathname === '/tratorilson' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'var(--portal-bg-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s'
              }}>
                <Bot size={14} style={{ color: pathname === '/tratorilson' ? '#fff' : 'var(--portal-text-muted)' }} />
              </div>
              <span style={{ flex: 1 }}>Tratorilson</span>
              {pathname === '/tratorilson' && <ChevronRight size={14} style={{ color: '#dc2626' }} />}
            </Link>
          )}

          </div>

          {/* Logout - fixo no fundo */}
          <div style={{
            flexShrink: 0, padding: '0 16px 20px 16px',
            borderTop: '1px solid var(--portal-border)',
            paddingTop: '16px'
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
            position: 'fixed', inset: 0, top: '84px',
            background: 'rgba(0,0,0,0.2)', zIndex: 35,
            transition: 'opacity 0.3s'
          }}
        />
      )}

      {/* ===== MAIN CONTENT ===== */}
      <main style={{
        marginLeft: sidebarOpen ? '260px' : '0px',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: 'calc(100vh - 84px)',
        background: 'var(--portal-bg)'
      }}>
        {children}
      </main>

      {/* Assistente Tratorilson (flutuante, global) — só no modo flutuante e pra quem tem acesso */}
      {/* No celular o Tratorilson NÃO flutua na lateral — fica só dentro do painel
          de Mensagens (Chat). O ícone flutuante é exclusivo do desktop. */}
      {temAcesso('tratorilson') && !isMobile && tratorilsonLocal === 'flutuante' && (
        <TratorinoChat
          userName={userProfile?.nome || ''}
          userId={userProfile?.id || ''}
          isAdmin={isAdmin}
          modulos={permissoes?.modulos_permitidos || []}
        />
      )}

      {/* Tooltip da notificação — conteúdo completo ao passar o mouse (fora do dropdown por causa do transform) */}
      {bellOpen && notifHover && (
        <div style={{
          position: 'fixed', top: Math.max(12, Math.min(notifHover.top, window.innerHeight - 240)), left: notifHover.left,
          width: 360, maxHeight: '60vh', overflowY: 'auto', zIndex: 100000, pointerEvents: 'none',
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)', padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ color: NOTIF_COLORS[notifHover.tipo] || '#dc2626', display: 'flex' }}>{NOTIF_ICONS[notifHover.tipo] || <Bell size={16} />}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--portal-text-muted)' }}>{timeAgo(notifHover.tempo)}</span>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 8, lineHeight: 1.35, wordBreak: 'break-word' }}>{notifHover.titulo}</div>
          {notifHover.descricao && (
            <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notifHover.descricao}</div>
          )}
        </div>
      )}

      {/* ===== CHAT PANEL ===== */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chat={chatData}
        userId={userProfile?.id}
        userProfile={userProfile}
        isAdmin={isAdmin}
        modulos={permissoes?.modulos_permitidos || []}
        tratorilsonHabilitado={temAcesso('tratorilson')}
        tratorilsonLocal={isMobile ? 'chat' : tratorilsonLocal}
        onChangeTratorilsonLocal={mudarTratorilsonLocal}
      />

      {userProfile?.id && (
        <LembretesPanel
          open={lembretesOpen}
          onClose={() => setLembretesOpen(false)}
          userId={userProfile.id}
          userName={userProfile.nome || ''}
        />
      )}

      {/* ===== PAINEL LATERAL CONFIGURAÇÕES ===== */}
      {configOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setConfigOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)', zIndex: 55000,
            display: 'flex', justifyContent: 'flex-end'
          }}
        >
          <style>{`@keyframes cfgSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
          <div style={{
            background: 'var(--portal-bg-card)', width: '440px', maxWidth: '96vw', height: '100%',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
            animation: 'cfgSlideIn 0.25s ease-out'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px', borderBottom: '1px solid var(--portal-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #525252, #1a1a1a)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Settings size={22} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>Configurações</h3>
                  <p style={{ fontSize: '12px', color: 'var(--portal-text-muted)', margin: 0 }}>Personalize sua experiência</p>
                </div>
              </div>
              <button onClick={() => setConfigOpen(false)} style={{
                background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: '10px',
                width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)'
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', gap: '6px', padding: '14px 20px', borderBottom: '1px solid var(--portal-border)' }}>
              {([
                { id: 'perfil', label: 'Perfil', icon: <UserIcon size={15} /> },
                { id: 'aparencia', label: 'Aparência', icon: <Sun size={15} /> },
                { id: 'som', label: 'Som', icon: <Volume2 size={15} /> },
              ] as const).map(t => {
                const active = configTab === t.id
                return (
                  <button key={t.id} onClick={() => { setConfigTab(t.id); setPerfilMsg(null) }} style={{
                    display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '10px',
                    border: active ? '1.5px solid #dc2626' : '1.5px solid var(--portal-border)',
                    background: active ? 'var(--portal-bg-hover)' : 'transparent',
                    color: active ? '#dc2626' : 'var(--portal-text-secondary)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                  }}>
                    {t.icon} {t.label}
                  </button>
                )
              })}
            </div>

            {/* Conteúdo */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 26px' }}>

            {perfilMsg && (
              <div style={{
                marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                background: perfilMsg.tipo === 'ok' ? '#ECFDF5' : '#FEF2F2',
                color: perfilMsg.tipo === 'ok' ? '#059669' : '#DC2626',
                border: `1px solid ${perfilMsg.tipo === 'ok' ? '#A7F3D0' : '#FECACA'}`
              }}>{perfilMsg.texto}</div>
            )}

            {/* ===== ABA PERFIL ===== */}
            {configTab === 'perfil' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Foto */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, #b91c1c, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {userProfile?.avatar_url
                      ? <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <UserIcon size={32} color="#fff" />}
                  </div>
                  <div>
                    <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }} />
                    <button onClick={() => avatarInputRef.current?.click()} disabled={perfilBusy} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '10px',
                      border: '1.5px solid var(--portal-border)', background: 'var(--portal-bg-secondary)',
                      color: 'var(--portal-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                    }}>
                      <Camera size={15} /> Trocar foto
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--portal-text-muted)', marginTop: '6px' }}>{userProfile?.funcao || ''}</div>
                  </div>
                </div>

                {/* Nome */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>NOME</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={perfilNome} onChange={(e) => setPerfilNome(e.target.value)} style={{
                      flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--portal-border)',
                      background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: '14px', outline: 'none'
                    }} />
                    <button onClick={salvarNome} disabled={perfilBusy || !perfilNome.trim()} style={{
                      padding: '0 18px', borderRadius: '10px', border: 'none', background: '#dc2626', color: '#fff',
                      fontSize: '13px', fontWeight: 700, cursor: (perfilBusy || !perfilNome.trim()) ? 'not-allowed' : 'pointer', opacity: (perfilBusy || !perfilNome.trim()) ? 0.6 : 1
                    }}>Salvar</button>
                  </div>
                </div>

                {/* Trocar senha */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Lock size={13} /> ALTERAR SENHA</label>
                  <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Nova senha (mín. 6)" style={{
                    width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--portal-border)',
                    background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: '14px', outline: 'none', marginBottom: '8px'
                  }} />
                  <input type="password" value={novaSenha2} onChange={(e) => setNovaSenha2(e.target.value)} placeholder="Confirmar nova senha" style={{
                    width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--portal-border)',
                    background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: '14px', outline: 'none', marginBottom: '10px'
                  }} />
                  <button onClick={trocarSenha} disabled={perfilBusy || !novaSenha || !novaSenha2} style={{
                    width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: '#1a1a1a', color: '#fff',
                    fontSize: '13px', fontWeight: 700, cursor: (perfilBusy || !novaSenha || !novaSenha2) ? 'not-allowed' : 'pointer', opacity: (perfilBusy || !novaSenha || !novaSenha2) ? 0.6 : 1
                  }}>Alterar senha</button>
                </div>
              </div>
            )}

            {/* ===== ABA APARÊNCIA (TEMA) ===== */}
            {configTab === 'aparencia' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--portal-text-secondary)', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>
                TEMA DO PORTAL
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  onClick={() => alterarTema('light')}
                  style={{
                    padding: '16px', borderRadius: '14px', border: tema === 'light' ? '2px solid #dc2626' : '2px solid var(--portal-border)',
                    background: '#ffffff', cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    position: 'relative'
                  }}
                >
                  {tema === 'light' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '10px', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </div>
                  )}
                  <Sun size={28} color="#f59e0b" />
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a' }}>Claro</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#fafafa', border: '1px solid #e5e5e5' }} />
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#ffffff', border: '1px solid #e5e5e5' }} />
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#f5f5f5', border: '1px solid #e5e5e5' }} />
                  </div>
                </button>
                <button
                  onClick={() => alterarTema('dark')}
                  style={{
                    padding: '16px', borderRadius: '14px', border: tema === 'dark' ? '2px solid #dc2626' : '2px solid var(--portal-border)',
                    background: '#1a1a1a', cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    position: 'relative'
                  }}
                >
                  {tema === 'dark' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '10px', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </div>
                  )}
                  <Moon size={28} color="#818cf8" />
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#f5f5f5' }}>Escuro</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#0f0f0f', border: '1px solid #333' }} />
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#1a1a1a', border: '1px solid #333' }} />
                    <div style={{ width: '20px', height: '14px', borderRadius: '3px', background: '#262626', border: '1px solid #333' }} />
                  </div>
                </button>
              </div>

              {/* MODELO DE EXIBIÇÃO DO DASHBOARD */}
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--portal-text-secondary)', letterSpacing: '1px', display: 'block', margin: '26px 0 12px' }}>
                MODELO DO DASHBOARD
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { id: 'omie', label: 'Estilo Omie', icon: <LayoutDashboard size={18} />, desc: 'Tiles coloridos por categoria' },
                  { id: 'grade', label: 'Grade', icon: <LayoutGrid size={18} />, desc: 'Grupos com cards' },
                  { id: 'lista', label: 'Lista', icon: <List size={18} />, desc: 'Lista compacta' },
                ].map(m => {
                  const ativo = dashView === m.id
                  return (
                    <button key={m.id} onClick={() => alterarDashView(m.id)} style={{
                      padding: '14px', borderRadius: '12px', border: ativo ? '2px solid #dc2626' : '2px solid var(--portal-border)',
                      background: 'var(--portal-bg-card)', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .2s',
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: ativo ? '#fef2f2' : 'var(--portal-bg-secondary)', color: ativo ? '#dc2626' : 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--portal-text)' }}>{m.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--portal-text-secondary)' }}>{m.desc}</div>
                      </div>
                      {ativo && <Check size={16} color="#dc2626" strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--portal-text-faint)', marginTop: '10px' }}>Aplica ao abrir o Dashboard.</p>
            </div>
            )}

            {/* ===== ABA SOM ===== */}
            {configTab === 'som' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--portal-text-secondary)', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>
                SOM DE NOTIFICAÇÃO
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {SONS_NOTIFICACAO.map(som => {
                  const isActive = somId === som.id
                  return (
                    <button
                      key={som.id}
                      onClick={() => alterarSom(som.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 18px', borderRadius: '12px',
                        border: isActive ? '2px solid #dc2626' : '2px solid var(--portal-border)',
                        background: isActive ? 'var(--portal-bg-hover)' : 'var(--portal-bg-card)',
                        cursor: 'pointer', transition: 'all 0.2s', width: '100%'
                      }}
                    >
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: isActive ? '#dc2626' : 'var(--portal-bg-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', flexShrink: 0
                      }}>
                        <Volume2 size={18} color={isActive ? '#fff' : 'var(--portal-text-muted)'} />
                      </div>
                      <span style={{
                        fontSize: '14px', fontWeight: isActive ? '700' : '500',
                        color: isActive ? '#dc2626' : 'var(--portal-text)',
                        flex: 1, textAlign: 'left'
                      }}>
                        {som.label}
                      </span>
                      {isActive && (
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '11px',
                          background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Check size={13} color="#fff" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            </div>{/* fim conteúdo */}
          </div>
        </div>
      )}

      {userProfile?.id && <LembreteAlerta userId={userProfile.id} />}

      {userProfile?.nome && <OrcamentoVencidoAlerta userName={userProfile.nome} />}

      {/* ===== CARDS FLUTUANTES "OPA" ===== */}
      {userProfile?.id && (
        <OpaLembrete userId={userProfile.id} userName={userProfile.nome || ''} isAdmin={isAdmin} />
      )}

      {/* ===== CARDS FLUTUANTES "SAT" (só Pós-Vendas) ===== */}
      {userProfile?.id && (permissoes?.categoria === 'Pós Vendas' || isAdmin) && (
        <SatLembrete userId={userProfile.id} userName={userProfile.nome || ''} />
      )}

      {/* ===== POPUP AVISO BLOQUEANTE ===== */}
      {avisosPendentes.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60000,
          animation: 'avisoFadeIn 0.3s ease-out',
        }}>
          <div style={{
            background: 'var(--portal-bg-card)', borderRadius: 20, width: '100%', maxWidth: 500,
            overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
            animation: 'avisoScaleIn 0.3s ease-out',
          }}>
            {(() => {
              const aviso = avisosPendentes[0]
              const prioColor = aviso.prioridade === 'urgente' ? '#DC2626' : aviso.prioridade === 'alta' ? '#D97706' : '#3B82F6'
              return (
                <>
                  <div style={{ height: 5, background: prioColor }} />
                  <div style={{ padding: '28px 32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: aviso.prioridade === 'urgente' ? '#FEE2E2' : '#DBEAFE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Megaphone size={26} color={prioColor} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a3a3a3', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                          Aviso Importante {avisosPendentes.length > 1 ? `(1 de ${avisosPendentes.length})` : ''}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)' }}>{aviso.titulo}</div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 15, color: 'var(--portal-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                      maxHeight: 300, overflow: 'auto',
                      background: 'var(--portal-bg-secondary)', borderRadius: 12, padding: '16px 18px',
                      border: `1px solid var(--portal-border)`,
                    }}>
                      {aviso.conteudo}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 12 }}>
                      Publicado por {aviso.criado_por_nome}
                    </div>
                    <button onClick={confirmarAviso} disabled={confirmando} style={{
                      width: '100%', marginTop: 20, padding: 16, borderRadius: 14,
                      background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', border: 'none',
                      fontSize: 16, fontWeight: 800, cursor: confirmando ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: confirmando ? 0.7 : 1,
                      boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
                    }}>
                      {confirmando ? 'Confirmando...' : 'Confirmado'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ===== TOASTS ===== */}
      <div className="print-hidden notif-toast-wrap" style={{
        position: 'fixed', top: '92px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        zIndex: 9999, pointerEvents: 'none'
      }}>
        {toasts.map((t, i) => {
          const isChat = t.tipo === 'chat'
          return (
            <div
              key={t.id}
              onClick={() => handleToastClick(t)}
              className="notif-toast"
              style={{
                width: '380px', maxWidth: 'calc(100vw - 48px)',
                background: 'var(--portal-bg-card)',
                borderRadius: isChat ? '20px' : '16px',
                boxShadow: isChat
                  ? '0 8px 32px rgba(59,130,246,0.18), 0 2px 8px rgba(0,0,0,0.06)'
                  : `0 8px 32px var(--portal-shadow), 0 2px 8px rgba(0,0,0,0.06)`,
                border: isChat ? '2px solid #bfdbfe' : `1px solid var(--portal-border)`,
                cursor: 'pointer',
                overflow: 'hidden', pointerEvents: 'auto',
                animation: 'toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: i > 2 ? 0.7 : 1,
                position: 'relative'
              }}
            >
              {/* Barra de chat tipo balão */}
              {isChat && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: 'linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6)',
                  backgroundSize: '200% 100%',
                  animation: 'toastBarShimmer 2s linear infinite'
                }} />
              )}
              {!isChat && (
                <div style={{ height: '3px', background: 'linear-gradient(90deg, #dc2626, #ef4444)', animation: 'toastProgress 6s linear forwards' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px' }}>
                {/* Avatar / Ícone */}
                <div style={{
                  width: '46px', height: '46px',
                  borderRadius: isChat ? '50%' : '12px',
                  background: isChat
                    ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                    : 'var(--portal-bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', flexShrink: 0, overflow: 'hidden',
                  boxShadow: isChat ? '0 4px 14px rgba(59,130,246,0.3)' : 'none',
                  border: isChat ? '3px solid #dbeafe' : 'none'
                }}>
                  {t.avatar ? (
                    <img src={t.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : isChat ? (
                    <MessageCircle size={20} color="#fff" />
                  ) : (
                    <span style={{ display: 'flex', color: 'var(--portal-text-secondary)' }}>{NOTIF_ICONS[t.tipo] || <Bell size={18} />}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--portal-text)' }}>{t.titulo}</span>
                    <span style={{
                      fontSize: '9px', fontWeight: '800', color: '#fff',
                      background: isChat ? '#3b82f6' : '#dc2626',
                      padding: '2px 7px', borderRadius: '4px'
                    }}>
                      {isChat ? 'CHAT' : 'NOVA'}
                    </span>
                  </div>
                  <p style={{
                    fontSize: '13px', color: 'var(--portal-text-secondary)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    ...(isChat ? {
                      background: tema === 'dark' ? '#1a2332' : '#f0f7ff',
                      padding: '6px 10px',
                      borderRadius: '0 12px 12px 12px',
                      border: tema === 'dark' ? '1px solid #1e3a5f' : '1px solid #e0edff',
                      marginTop: '4px',
                      fontSize: '12px'
                    } : {})
                  }}>{t.preview}</p>
                </div>
                <button onClick={(e) => dismissToast(e, t.id)} style={{
                  background: 'var(--portal-bg-secondary)', border: 'none', color: 'var(--portal-text-muted)',
                  fontSize: '10px', cursor: 'pointer', padding: '6px',
                  borderRadius: '8px', flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px', transition: 'all 0.2s'
                }}>
                  <X size={12} />
                </button>
              </div>
              {!isChat && (
                <div style={{ height: '3px', background: 'var(--portal-bg-secondary)' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg, #dc2626, #ef4444)', animation: 'toastProgress 6s linear forwards' }} />
                </div>
              )}
              {isChat && (
                <div style={{ height: '3px', background: tema === 'dark' ? '#1a2332' : '#eff6ff' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', animation: 'toastProgress 6s linear forwards' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ===== CSS ===== */}
      <style>{`
        /* Atalhos da top bar: vão sumindo conforme a tela aperta, do último
           para o primeiro, para nunca empurrarem o sino e o avatar. */
        @media (max-width: 1500px) { .topbar-atalhos a:nth-child(4) { display: none; } }
        @media (max-width: 1320px) { .topbar-atalhos a:nth-child(3) { display: none; } }
        @media (max-width: 1150px) { .topbar-atalhos { display: none !important; } }
        /* Barra de cima no CELULAR: encolhe pra tudo caber (o avatar sumia cortado).
           Só afeta <= 640px; no PC nada muda. */
        @media (max-width: 640px) {
          .portal-header { padding: 0 12px !important; gap: 8px; }
          .portal-logo { height: 34px !important; }
          /* Só logo + sino + foto. Chat e Menu entram no menuzinho da foto. */
          .portal-chat-btn, .portal-menu-btn { display: none !important; }
          .portal-user-name { display: none !important; }
          .portal-user-chip { padding: 6px !important; }
          /* Notificações menores/discretas no celular: faixa fininha no topo */
          .notif-toast-wrap { top: 72px !important; right: 8px !important; left: 8px !important; gap: 8px !important; }
          .notif-toast { width: auto !important; max-width: 100% !important; font-size: 13px; }
          .notif-toast .notif-toast-title { font-size: 13px !important; }
          .notif-toast .notif-toast-body { font-size: 12px !important; }
        }
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
        }
        @keyframes avisoFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes avisoScaleIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @media print {
          .print-hidden { display: none !important; }
        }
      `}</style>
      {notifPrefsOpen && userProfile?.id && (
        <NotifPrefsModal userId={userProfile.id} onClose={() => setNotifPrefsOpen(false)} />
      )}
    </div>
  )
}
