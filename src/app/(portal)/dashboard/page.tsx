'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import {
  Settings, ClipboardList, Wrench, FileText,
  DollarSign, Activity, Clock, ChevronRight, Search,
  BarChart3, Users, Package, ClipboardCheck, AlertTriangle,
  CheckCircle2, Map, RefreshCw, Database, X, Check, Calculator, Eye, Camera, Wheat, Megaphone, TrendingUp, Server,
  FolderPlus, Pencil, Trash2, FolderOpen, MapPin, ShieldCheck, Building,
  Star, LayoutGrid, List, CircleDot
} from 'lucide-react'

interface SystemCard {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  href: string
  tag: string
  external?: boolean
}

const systems: SystemCard[] = [
  { id: 'avisos', name: 'Avisos', description: 'Comunicados e avisos para toda a equipe, com anexos e notificacoes', icon: <Megaphone size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)', href: '/avisos', tag: 'COMUNICADOS' },
  { id: 'back-nova', name: 'Back Nova', description: 'Sistema backend Nova Tratores', icon: <Server size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', href: 'https://back.novatratores.com', tag: 'BACKEND', external: true },
  { id: 'configuracoes', name: 'Configurações', description: 'Gestão de usuários, permissões, módulos e configurações gerais do portal', icon: <Settings size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #525252, #1a1a1a)', href: '/admin', tag: 'ADMIN' },
  { id: 'visual-estoque', name: 'Consulta Omie', description: 'Estoque Omie, CMC, curva ABC, dashboard de vendas e comissões', icon: <Eye size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #b91c1c, #7f1d1d)', href: '/consulta-omie', tag: 'SHOWROOM' },
  { id: 'controle-revisao', name: 'Controle de Revisões', description: 'Acompanhamento de revisões periódicas de tratores com integração Gmail', icon: <Wrench size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)', href: '/revisoes', tag: 'MANUTENÇÃO' },
  { id: 'dashboard-agro', name: 'Dashboard Agro', description: 'Dashboard de acompanhamento do segmento agrícola', icon: <Wheat size={28} />, color: '#16a34a', gradient: 'linear-gradient(135deg, #22c55e, #15803d)', href: '/dashboard-agro', tag: 'AGRO' },
  { id: 'dre', name: 'DRE Financeiro', description: 'Demonstração do Resultado do Exercício com dados integrados do Omie', icon: <TrendingUp size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)', href: 'https://financeiro-omie-production-ce7e.up.railway.app/dre', tag: 'FINANÇAS', external: true },
  { id: 'feedbacks', name: 'Feedbacks & CRM', description: 'CRM/RFM, oportunidades automáticas de revisão, peças, up-sell e follow-up', icon: <Megaphone size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', href: '/feedbacks', tag: 'CRM' },
  { id: 'sistema-financeiro', name: 'Financeiro', description: 'Gestão de NF, boletos, contas a pagar e receber, chamados RH', icon: <DollarSign size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', href: '/financeiro', tag: 'FINANÇAS' },
  { id: 'fotos-tecnicos', name: 'Fotos Técnicos', description: 'Visualize as fotos anexadas pelos técnicos em cada ordem de serviço', icon: <Camera size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', href: '/fotos-tecnicos', tag: 'FOTOS' },
  { id: 'garantias', name: 'Garantias', description: 'Solicitações de garantia, envio à fábrica, cobrança ao cliente e relatórios por montadora', icon: <ShieldCheck size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)', href: '/garantias', tag: 'GARANTIAS' },
  { id: 'mecanicos', name: 'Janela Mecânicos', description: 'Jornada, agenda e acompanhamento dos mecânicos de campo', icon: <Users size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #ef4444)', href: '/mecanicos', tag: 'TÉCNICOS' },
  { id: 'mapa-geral', name: 'Mapeamento Técnico', description: 'Visualização geográfica de clientes, técnicos e operações', icon: <Map size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)', href: '/mapa-geral', tag: 'MAPA' },
  { id: 'orcamentos', name: 'Orçamentos', description: 'Orçamentos personalizados com peças, mão de obra e deslocamento', icon: <Calculator size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #ef4444)', href: '/orcamentos', tag: 'ORÇAMENTOS' },
  { id: 'clientes', name: 'Pastas Clientes', description: 'Ranking de clientes por volume de serviços, OS, PV e NF integrados ao Omie', icon: <Building size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)', href: '/clientes', tag: 'CLIENTES' },
  { id: 'ppv', name: 'Peças (Pedido de Venda)', description: 'Pedidos de venda de peças, rastreamento e gestão', icon: <Package size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)', href: '/ppv', tag: 'PEÇAS' },
  { id: 'pos', name: 'Pós-Vendas (OS)', description: 'Ordens de serviço, integração Omie ERP, geração de PDF', icon: <Settings size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)', href: '/pos', tag: 'SERVIÇOS' },
  { id: 'proposta-comercial', name: 'Proposta Comercial', description: 'Geração de propostas com PDF e QR Code para clientes', icon: <FileText size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #991b1b, #7f1d1d)', href: '/propostas', tag: 'VENDAS' },
  { id: 'app-requisicoes', name: 'Requisições', description: 'Kanban de requisições de materiais e serviços das unidades', icon: <ClipboardList size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)', href: '/requisicoes', tag: 'COMPRAS' },
  { id: 'tarefas', name: 'Tarefas', description: 'Gestão de tarefas entre usuários', icon: <ClipboardCheck size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', href: '/tarefas', tag: 'TAREFAS' },
  { id: 'consulta-estoque', name: 'Visual Estoque', description: 'Showroom virtual de estoque com visualização de peças e produtos', icon: <BarChart3 size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #991b1b)', href: '/visual-estoque', tag: 'ESTOQUE' },
]

interface LogEntry {
  id: string
  sistema: string
  acao: string
  created_at: string
}

// Mapeia system.id para o módulo de permissão
const systemToModulo: Record<string, string> = {
  'sistema-financeiro': 'financeiro',
  'app-requisicoes': 'requisicoes',
  'controle-revisao': 'revisoes',
  'pos': 'pos',
  'garantias': 'garantias',
  'ppv': 'ppv',
  'proposta-comercial': 'propostas',
  'orcamentos': 'orcamentos',
  'tarefas': 'tarefas',
  'mecanicos': 'mecanicos',
  'clientes': 'clientes',
  'mapa-geral': 'mapa',
  'fotos-tecnicos': 'fotos-tecnicos',
  'consulta-estoque': 'estoque',
  'visual-estoque': 'visual-estoque',
  'avisos': 'avisos',
  'dashboard-agro': 'dashboard-agro',
  'dre': 'dre',
  'back-nova': 'back-nova',
  'configuracoes': 'admin',
}

interface CardFolder {
  id: string
  name: string
  cardIds: string[]
}

type ViewMode = 'grade' | 'lista' | 'circular'

const defaultFolders: CardFolder[] = []

export default function DashboardPage() {
  const { userProfile, router } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { log: auditLog } = useAuditLog()
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [minhasTarefas, setMinhasTarefas] = useState<any[]>([])
  const [tarefasLoading, setTarefasLoading] = useState(true)
  const [showSync, setShowSync] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncStep, setSyncStep] = useState('')
  const [syncResults, setSyncResults] = useState<any>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSelection, setSyncSelection] = useState<{ clientes: boolean; projetos: boolean; produtos: boolean }>({
    clientes: true, projetos: true, produtos: true,
  })
  const [folders, setFolders] = useState<CardFolder[]>([])
  const [activeFolder, setActiveFolder] = useState<string>('todos')
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [foldersLoaded, setFoldersLoaded] = useState(false)
  const [favoritos, setFavoritos] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('grade')
  const [showFavoritosOnly, setShowFavoritosOnly] = useState(false)

  // Refresh ao voltar para a aba
  const refreshDashboard = useCallback(() => {
    if (!userProfile) return
    supabase.from('portal_logs').select('*').eq('user_id', userProfile.id)
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setRecentLogs(data) })
  }, [userProfile])
  useRefreshOnFocus(refreshDashboard)

  // Relógio a cada 30s em vez de 1s — reduz 30x re-renders
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!userProfile) return
    const loadLogs = async () => {
      const { data } = await supabase
        .from('portal_logs')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (data) setRecentLogs(data)
    }
    loadLogs()
  }, [userProfile])

  // Carregar pastas, favoritos, viewMode do localStorage
  useEffect(() => {
    if (!userProfile?.id) return
    const key = `portal-folders-${userProfile.id}`
    const versionKey = `portal-folders-version-${userProfile.id}`
    const CURRENT_VERSION = '6'
    const savedVersion = localStorage.getItem(versionKey)
    if (savedVersion === CURRENT_VERSION) {
      const saved = localStorage.getItem(key)
      if (saved) {
        try { setFolders(JSON.parse(saved)) } catch { setFolders(defaultFolders) }
      } else {
        setFolders(defaultFolders)
      }
    } else {
      setFolders(defaultFolders)
      localStorage.setItem(versionKey, CURRENT_VERSION)
    }
    // Favoritos
    const favKey = `portal-favoritos-${userProfile.id}`
    const savedFav = localStorage.getItem(favKey)
    if (savedFav) { try { setFavoritos(JSON.parse(savedFav)) } catch { /* */ } }
    // View mode
    const vmKey = `portal-viewmode-${userProfile.id}`
    const savedVm = localStorage.getItem(vmKey) as ViewMode | null
    if (savedVm) setViewMode(savedVm)
    setFoldersLoaded(true)
  }, [userProfile?.id])

  // Salvar pastas no localStorage
  useEffect(() => {
    if (!userProfile?.id || !foldersLoaded) return
    localStorage.setItem(`portal-folders-${userProfile.id}`, JSON.stringify(folders))
  }, [folders, userProfile?.id, foldersLoaded])

  // Salvar favoritos
  useEffect(() => {
    if (!userProfile?.id || !foldersLoaded) return
    localStorage.setItem(`portal-favoritos-${userProfile.id}`, JSON.stringify(favoritos))
  }, [favoritos, userProfile?.id, foldersLoaded])

  // Salvar view mode
  useEffect(() => {
    if (!userProfile?.id || !foldersLoaded) return
    localStorage.setItem(`portal-viewmode-${userProfile.id}`, viewMode)
  }, [viewMode, userProfile?.id, foldersLoaded])

  // Carregar tarefas
  useEffect(() => {
    if (!userProfile) return
    const loadTarefas = async () => {
      try {
        const res = await fetch(`/api/tarefas?filter=minhas&userId=${userProfile.id}`)
        const data = await res.json()
        const pendentes = (Array.isArray(data) ? data : [])
          .filter((t: any) => t.computed_status !== 'concluida')
          .slice(0, 5)
        setMinhasTarefas(pendentes)
      } catch (err) {
        console.error('Erro ao carregar tarefas:', err)
      } finally {
        setTarefasLoading(false)
      }
    }
    loadTarefas()
  }, [userProfile])

  const logAccess = async (system: SystemCard) => {
    if (!userProfile) return
    await supabase.from('portal_logs').insert([{
      user_id: userProfile.id,
      user_nome: userProfile.nome,
      sistema: system.name,
      acao: 'acesso'
    }])
  }

  const openSystem = async (system: SystemCard) => {
    logAccess(system)
    auditLog({ sistema: system.id.replace('sistema-', ''), acao: 'acesso', entidade_label: system.name })
    if (system.external) {
      const appsComAuth = ['visual-estoque']
      if (appsComAuth.includes(system.id)) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const ts = Date.now().toString()
          const res = await fetch('/api/portal-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ts })
          })
          const { hash } = await res.json()
          const sep = system.href.includes('?') ? '&' : '?'
          window.open(`${system.href}${sep}portal_token=${hash}&portal_ts=${ts}&portal_user=${encodeURIComponent(session.user.email || '')}`, '_blank')
          return
        }
      }
      window.open(system.href, '_blank')
    } else {
      router.push(system.href)
    }
  }

  const allowedSystems = useMemo(() => systems.filter(s => {
    const modulo = systemToModulo[s.id]
    return modulo ? temAcesso(modulo) : true
  }), [temAcesso])

  const searchLower = searchTerm.toLowerCase()
  const filteredSystems = useMemo(() => allowedSystems.filter(s =>
    s.name.toLowerCase().includes(searchLower) ||
    s.description.toLowerCase().includes(searchLower) ||
    s.tag.toLowerCase().includes(searchLower)
  ), [allowedSystems, searchLower])

  const toggleFavorito = (id: string) => {
    setFavoritos(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  // Sistemas filtrados por pasta/favoritos
  const displayedSystems = useMemo(() => {
    let result = filteredSystems
    if (showFavoritosOnly) {
      result = result.filter(s => favoritos.includes(s.id))
    } else if (activeFolder !== 'todos' && !editingFolder) {
      const folder = folders.find(f => f.id === activeFolder)
      if (folder) result = result.filter(s => folder.cardIds.includes(s.id))
    }
    // Favoritos primeiro
    return [...result].sort((a, b) => {
      const aFav = favoritos.includes(a.id) ? 0 : 1
      const bFav = favoritos.includes(b.id) ? 0 : 1
      return aFav - bFav
    })
  }, [filteredSystems, activeFolder, folders, editingFolder, showFavoritosOnly, favoritos])

  const createFolder = () => {
    const name = prompt('Nome da pasta:')
    if (!name?.trim()) return
    const id = name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    setFolders(prev => [...prev, { id, name: name.trim(), cardIds: [] }])
    setActiveFolder(id)
  }

  const deleteFolder = (folderId: string) => {
    if (!confirm('Excluir esta pasta?')) return
    setFolders(prev => prev.filter(f => f.id !== folderId))
    if (activeFolder === folderId) setActiveFolder('todos')
    if (editingFolder === folderId) setEditingFolder(null)
  }

  const renameFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId)
    if (!folder) return
    const name = prompt('Novo nome:', folder.name)
    if (!name?.trim()) return
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: name.trim() } : f))
  }

  const toggleCardInFolder = (folderId: string, cardId: string) => {
    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f
      const has = f.cardIds.includes(cardId)
      return { ...f, cardIds: has ? f.cardIds.filter(id => id !== cardId) : [...f.cardIds, cardId] }
    }))
  }

  const greeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const executarSync = async () => {
    // Monta apenas os steps selecionados, distribuindo o progresso igualmente
    const tiposEscolhidos = (['clientes', 'projetos', 'produtos'] as const).filter(t => syncSelection[t])
    if (tiposEscolhidos.length === 0) {
      setSyncError('Selecione pelo menos um item para sincronizar')
      return
    }

    setSyncRunning(true)
    setSyncProgress(0)
    setSyncResults(null)
    setSyncError('')
    const results: any = {}

    const fatia = 100 / tiposEscolhidos.length
    const steps = tiposEscolhidos.map((tipo, i) => ({
      tipo,
      label: `Sincronizando ${tipo}...`,
      peso: Math.round(fatia * (i + 1)),
      prev: Math.round(fatia * i),
    }))

    try {
      for (const step of steps) {
        setSyncStep(step.label)
        let current = step.prev
        const interval = setInterval(() => {
          current = Math.min(current + 1, step.peso - 2)
          setSyncProgress(current)
        }, 300)

        const res = await fetch(`/api/pos/sync?tipo=${step.tipo}`, {
          method: 'POST',
          headers: { 'x-sync-manual': 'true' },
        })
        clearInterval(interval)
        const data = await res.json()

        if (!data.sucesso) {
          setSyncError(data.erro || `Erro em ${step.tipo}`)
          setSyncProgress(step.peso)
          setSyncRunning(false)
          return
        }

        results[step.tipo] = data.resultado
        setSyncProgress(step.peso)
      }

      setSyncProgress(100)
      setSyncStep('Concluído!')
      setSyncResults(results)
    } catch (err: any) {
      setSyncError(err.message || 'Erro desconhecido')
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <div style={{ padding: '32px 40px', background: 'var(--portal-bg)', minHeight: '100%' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '40px' }} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--portal-text)', marginBottom: '8px' }}>
              {greeting()}, <span className="gradient-text">{userProfile?.nome?.split(' ')[0] || 'Usuário'}</span>
            </h2>
            <p style={{ color: '#a3a3a3', fontSize: '15px', fontWeight: '400' }}>
              Acesse seus sistemas e acompanhe as atividades
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowSync(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', borderRadius: '12px',
                background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer', color: '#a3a3a3', fontSize: '13px', fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.color = '#a3a3a3' }}
            >
              <RefreshCw size={15} />
              Sync
            </button>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px',
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <Clock size={16} color="#a3a3a3" />
              <span style={{ fontSize: '14px', color: '#737373', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>
                {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
        marginBottom: '40px'
      }}>
        {[
          { icon: <BarChart3 size={20} />, label: 'Sistemas', value: String(allowedSystems.length) },
          { icon: <Users size={20} />, label: 'Função', value: userProfile?.funcao || '-' },
          { icon: <Activity size={20} />, label: 'Acessos Hoje', value: recentLogs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length.toString() },
          { icon: <Clock size={20} />, label: 'Último Acesso', value: recentLogs[0] ? new Date(recentLogs[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-' }
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px', borderRadius: '16px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px var(--portal-shadow)',
            animation: `fadeIn 0.6s ease-out ${i * 0.1}s both`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: '#fef2f2', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#dc2626'
              }}>
                {stat.icon}
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', marginBottom: '2px' }}>
                  {stat.label.toUpperCase()}
                </p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)' }}>
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Breadcrumb quando dentro de uma pasta */}
      {activeFolder !== 'todos' && !editingFolder && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px',
          padding: '20px 28px', borderRadius: '16px',
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <button
            onClick={() => setActiveFolder('todos')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 22px', borderRadius: '14px',
              background: '#dc2626', border: 'none',
              cursor: 'pointer', color: '#fff', fontSize: '15px', fontWeight: '700',
              transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#b91c1c' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#dc2626' }}
          >
            <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
            Voltar
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FolderOpen size={24} color="#f59e0b" />
            <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--portal-text)' }}>
              {folders.find(f => f.id === activeFolder)?.name}
            </span>
            <span style={{
              fontSize: '13px', fontWeight: '600', color: '#a3a3a3',
              background: '#f5f5f5', padding: '5px 14px', borderRadius: '10px'
            }}>
              {displayedSystems.length} sistemas
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setEditingFolder(activeFolder); setActiveFolder('todos') }}
            title="Organizar cards desta pasta"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px', border: 'none',
              background: '#f5f5f5', color: '#737373', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#737373' }}
          >
            <Pencil size={15} /> Editar
          </button>
          <button
            onClick={() => renameFolder(activeFolder)}
            title="Renomear pasta"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px', border: 'none',
              background: '#f5f5f5', color: '#737373', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#737373' }}
          >
            Renomear
          </button>
          <button
            onClick={() => deleteFolder(activeFolder)}
            title="Excluir pasta"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px', border: 'none',
              background: '#f5f5f5', color: '#737373', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#737373' }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {/* Edit mode banner */}
      {editingFolder && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderRadius: '12px', marginBottom: '16px',
          background: '#fef2f2', border: '1px solid #fecaca'
        }}>
          <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
            Clique nos cards para adicionar/remover da pasta &quot;{folders.find(f => f.id === editingFolder)?.name}&quot;
          </span>
          <button
            onClick={() => { setEditingFolder(null); setActiveFolder('todos') }}
            style={{
              padding: '6px 16px', borderRadius: '8px', border: 'none',
              background: '#dc2626', color: '#fff', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer'
            }}
          >
            Concluído
          </button>
        </div>
      )}

      {/* Search + Filtros + View modes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{
          width: '4px', height: '24px', borderRadius: '2px',
          background: 'linear-gradient(180deg, #dc2626, #b91c1c)'
        }} />
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)' }}>
          {showFavoritosOnly ? 'Favoritos' : 'Sistemas'}
        </h3>
        <span style={{
          fontSize: '12px', fontWeight: '600', color: '#a3a3a3',
          background: 'var(--portal-bg-secondary)', padding: '4px 12px',
          borderRadius: '20px'
        }}>
          {displayedSystems.length}
        </span>

        {/* Botão favoritos */}
        <button
          onClick={() => setShowFavoritosOnly(!showFavoritosOnly)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '10px', border: 'none',
            background: showFavoritosOnly ? '#FEF3C7' : 'var(--portal-bg-secondary)',
            color: showFavoritosOnly ? '#B45309' : '#a3a3a3',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s'
          }}
        >
          <Star size={14} fill={showFavoritosOnly ? '#F59E0B' : 'none'} />
          Favoritos{favoritos.length > 0 ? ` (${favoritos.length})` : ''}
        </button>

        <div style={{ flex: 1 }} />

        {/* View mode buttons */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--portal-bg-secondary)', borderRadius: '10px', padding: '3px' }}>
          {([
            { mode: 'grade' as ViewMode, icon: <LayoutGrid size={15} />, title: 'Grade' },
            { mode: 'lista' as ViewMode, icon: <List size={15} />, title: 'Lista' },
            { mode: 'circular' as ViewMode, icon: <CircleDot size={15} />, title: 'Circular' },
          ]).map(v => (
            <button
              key={v.mode}
              onClick={() => setViewMode(v.mode)}
              title={v.title}
              style={{
                width: 32, height: 32, borderRadius: 8, border: 'none',
                background: viewMode === v.mode ? '#dc2626' : 'transparent',
                color: viewMode === v.mode ? '#fff' : '#a3a3a3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s'
              }}
            >
              {v.icon}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '240px' }}>
          <Search size={14} style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3'
          }} />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px 8px 36px', borderRadius: '10px',
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
              color: 'var(--portal-text)', fontSize: '13px', outline: 'none', fontFamily: 'Inter'
            }}
          />
        </div>
      </div>

      {/* System Cards */}
      {allowedSystems.length === 0 && !loadingPerm && (
        <div style={{
          padding: '60px 40px', textAlign: 'center', borderRadius: '20px',
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '20px'
        }}>
          <Package size={28} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--portal-text)', marginBottom: '8px' }}>Aguardando liberação</h3>
          <p style={{ fontSize: '14px', color: '#a3a3a3' }}>Entre em contato com o administrador para liberar os módulos.</p>
        </div>
      )}

      {/* ══ MODO GRADE ══ */}
      {viewMode === 'grade' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Pastas do usuario */}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && folders.map((folder) => {
            const count = folder.cardIds.filter(id => allowedSystems.some(s => s.id === id)).length
            return (
              <div key={`f-${folder.id}`} onClick={() => setActiveFolder(folder.id)} style={{
                borderRadius: '16px', padding: '20px', cursor: 'pointer',
                background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '14px'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#fde68a' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <FolderOpen size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{folder.name}</div>
                  <div style={{ fontSize: 12, color: '#a3a3a3' }}>{count} sistemas</div>
                </div>
                <ChevronRight size={16} color="#d4d4d4" />
              </div>
            )
          })}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && (
            <div onClick={createFolder} style={{
              borderRadius: '16px', padding: '20px', cursor: 'pointer',
              border: '1px dashed #e5e5e5', transition: 'all .2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              color: '#a3a3a3', fontSize: 13, fontWeight: 600
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.color = '#a3a3a3' }}
            >
              <FolderPlus size={18} /> Nova Pasta
            </div>
          )}

          {displayedSystems.map((system, i) => {
            const isFav = favoritos.includes(system.id)
            return (
              <div key={system.id} style={{
                borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', position: 'relative',
                background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all .2s',
                animation: `fadeIn 0.4s ease-out ${i * 0.05}s both`
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                {/* Favorito */}
                <button onClick={(e) => { e.stopPropagation(); toggleFavorito(system.id) }} style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 2,
                  width: 30, height: 30, borderRadius: 8, border: 'none',
                  background: isFav ? '#FEF3C7' : 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: isFav ? 1 : 0, transition: 'opacity .2s'
                }}
                  className="fav-btn"
                >
                  <Star size={16} fill={isFav ? '#F59E0B' : 'none'} color={isFav ? '#F59E0B' : '#d4d4d4'} />
                </button>

                <div onClick={() => editingFolder ? toggleCardInFolder(editingFolder, system.id) : openSystem(system)} style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 12,
                      background: system.gradient, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
                    }}>
                      {system.icon}
                    </div>
                    <div>
                      <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)', margin: 0 }}>{system.name}</h4>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#dc2626' }}>{system.tag}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.6, margin: 0 }}>{system.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ MODO LISTA ══ */}
      {viewMode === 'lista' && (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
          {/* Pastas na lista */}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && folders.map((folder) => {
            const count = folder.cardIds.filter(id => allowedSystems.some(s => s.id === id)).length
            return (
              <div key={`f-${folder.id}`} onClick={() => setActiveFolder(folder.id)} style={{
                display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px',
                borderBottom: '1px solid #f5f5f5', cursor: 'pointer', transition: 'background .15s'
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FFFBEB' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <FolderOpen size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{folder.name}</div>
                  <div style={{ fontSize: 12, color: '#a3a3a3' }}>{count} sistemas</div>
                </div>
                <ChevronRight size={16} color="#d97706" />
              </div>
            )
          })}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && (
            <div onClick={createFolder} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px',
              borderBottom: '1px solid #f5f5f5', cursor: 'pointer', color: '#a3a3a3', transition: 'all .15s'
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#a3a3a3' }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, border: '1px dashed currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderPlus size={18} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Nova Pasta</span>
            </div>
          )}
          {displayedSystems.map((system, i) => {
            const isFav = favoritos.includes(system.id)
            return (
              <div key={system.id} onClick={() => openSystem(system)} style={{
                display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px',
                borderBottom: i < displayedSystems.length - 1 ? '1px solid #f5f5f5' : 'none',
                cursor: 'pointer', transition: 'background .15s'
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-hover, #fafafa)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: system.gradient, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
                }}>
                  {system.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{system.name}</div>
                  <div style={{ fontSize: 12, color: '#a3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{system.description}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 6, flexShrink: 0 }}>{system.tag}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorito(system.id) }} style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none',
                  background: isFav ? '#FEF3C7' : 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Star size={14} fill={isFav ? '#F59E0B' : 'none'} color={isFav ? '#F59E0B' : '#e5e5e5'} />
                </button>
                <ChevronRight size={16} color="#d4d4d4" style={{ flexShrink: 0 }} />
              </div>
            )
          })}
        </div>
      )}

      {/* ══ MODO CIRCULAR ══ */}
      {viewMode === 'circular' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '28px', justifyContent: 'center', padding: '20px 0' }}>
          {/* Pastas circular */}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && folders.map((folder) => (
            <div key={`f-${folder.id}`} onClick={() => setActiveFolder(folder.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              cursor: 'pointer', width: 100, textAlign: 'center'
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#fff',
                boxShadow: '0 4px 16px rgba(245,158,11,0.25)',
                transition: 'all .2s', border: '3px solid #fff'
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = '' }}
              >
                <FolderOpen size={26} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', lineHeight: 1.2 }}>{folder.name}</span>
            </div>
          ))}
          {activeFolder === 'todos' && !editingFolder && !showFavoritosOnly && (
            <div onClick={createFolder} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              cursor: 'pointer', width: 100, textAlign: 'center'
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: '2px dashed #d4d4d4', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#d4d4d4',
                transition: 'all .2s'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.color = '#dc2626' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d4d4d4'; e.currentTarget.style.color = '#d4d4d4' }}
              >
                <FolderPlus size={24} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#a3a3a3', lineHeight: 1.2 }}>Nova Pasta</span>
            </div>
          )}
          {displayedSystems.map((system) => {
            const isFav = favoritos.includes(system.id)
            return (
              <div key={system.id} onClick={() => openSystem(system)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: 'pointer', width: 100, textAlign: 'center', position: 'relative'
              }}>
                {isFav && <Star size={12} fill="#F59E0B" color="#F59E0B" style={{ position: 'absolute', top: -4, right: 8, zIndex: 2 }} />}
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: system.gradient, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: '#fff',
                  boxShadow: '0 4px 16px rgba(220,38,38,0.2)',
                  transition: 'all .2s', border: '3px solid #fff'
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(220,38,38,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(220,38,38,0.2)' }}
                  onContextMenu={(e) => { e.preventDefault(); toggleFavorito(system.id) }}
                >
                  {system.icon}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', lineHeight: 1.2 }}>{system.name}</span>
              </div>
            )
          })}
        </div>
      )}

      <style>{`.fav-btn { opacity: 0 !important; } div:hover > .fav-btn { opacity: 1 !important; }`}</style>

      {/* Minhas Tarefas */}
      <div style={{ marginTop: '48px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '4px', height: '24px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #dc2626, #b91c1c)'
            }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)' }}>
              Minhas Tarefas
            </h3>
            {minhasTarefas.length > 0 && (
              <span style={{
                fontSize: '11px', fontWeight: '700', color: '#fff',
                background: '#dc2626', padding: '2px 10px', borderRadius: '10px'
              }}>
                {minhasTarefas.length}
              </span>
            )}
          </div>
          <button
            onClick={() => router.push('/tarefas')}
            style={{
              background: 'none', border: 'none', color: '#dc2626',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            Ver todas <ChevronRight size={16} />
          </button>
        </div>

        {tarefasLoading ? (
          <div style={{
            padding: '40px', textAlign: 'center', borderRadius: '16px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)'
          }}>
            <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando tarefas...</p>
          </div>
        ) : minhasTarefas.length === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center', borderRadius: '16px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <ClipboardCheck size={36} color="#e5e5e5" style={{ margin: '0 auto 12px', display: 'block' }} />
            <p style={{ color: '#a3a3a3', fontSize: '14px', margin: 0 }}>Nenhuma tarefa pendente</p>
          </div>
        ) : (
          <div style={{
            borderRadius: '16px', overflow: 'hidden',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {minhasTarefas.map((t: any, i: number) => {
              const isAtrasada = t.computed_status === 'atrasada'
              const hasDue = !!t.prazo
              const priorityColors: Record<number, string> = { 0: '#a3a3a3', 1: '#3b82f6', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444', 5: '#dc2626' }
              const priorityLabels: Record<number, string> = { 0: '', 1: 'Baixa', 2: 'Normal', 3: 'Alta', 4: 'Urgente', 5: 'Crítica' }
              const dueDate = hasDue ? new Date(t.prazo) : null
              const now = new Date()
              const diffDays = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

              return (
                <div
                  key={t.id}
                  onClick={() => router.push('/tarefas')}
                  style={{
                    padding: '16px 24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    borderBottom: i < minhasTarefas.length - 1 ? '1px solid #f5f5f5' : 'none',
                    borderLeft: `3px solid ${isAtrasada ? '#ef4444' : '#f59e0b'}`,
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: isAtrasada ? '#fffbfb' : 'transparent'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isAtrasada ? '#fffbfb' : 'transparent' }}
                >
                  {/* Ícone status */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: isAtrasada ? '#fef2f2' : '#fffbeb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isAtrasada
                      ? <AlertTriangle size={18} color="#ef4444" />
                      : <Clock size={18} color="#f59e0b" />
                    }
                  </div>

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '14px', fontWeight: '500', color: 'var(--portal-text)',
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {t.titulo}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                      {t.criador && (
                        <span style={{ fontSize: '12px', color: '#a3a3a3' }}>
                          de {t.criador.nome}
                        </span>
                      )}
                      {t.prioridade > 0 && (
                        <span style={{
                          fontSize: '10px', fontWeight: '600',
                          color: priorityColors[t.prioridade] || '#a3a3a3',
                          textTransform: 'uppercase'
                        }}>
                          {priorityLabels[t.prioridade]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Data */}
                  {hasDue && (
                    <div style={{
                      textAlign: 'right', flexShrink: 0
                    }}>
                      <p style={{
                        fontSize: '12px', fontWeight: '600', margin: 0,
                        color: isAtrasada ? '#ef4444' : diffDays !== null && diffDays <= 1 ? '#f59e0b' : '#737373'
                      }}>
                        {dueDate!.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                      <p style={{
                        fontSize: '10px', color: isAtrasada ? '#ef4444' : '#a3a3a3',
                        margin: '2px 0 0 0', fontWeight: isAtrasada ? '600' : '400'
                      }}>
                        {isAtrasada ? `${Math.abs(diffDays!)} dia(s) atrás` : diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' : `${diffDays} dias`}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {recentLogs.length > 0 && (
        <div style={{ marginTop: '48px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{
              width: '4px', height: '24px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #ef4444, #dc2626)'
            }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)' }}>
              Atividade Recente
            </h3>
          </div>

          <div style={{
            borderRadius: '16px', overflow: 'hidden',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px var(--portal-shadow)'
          }}>
            {recentLogs.map((log, i) => (
              <div key={log.id || i} style={{
                padding: '16px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: i < recentLogs.length - 1 ? '1px solid #f5f5f5' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Activity size={16} color="#a3a3a3" />
                  <span style={{ fontSize: '13px', color: '#525252', fontWeight: '500' }}>
                    Acessou <span style={{ color: '#dc2626', fontWeight: '600' }}>{log.sistema}</span>
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#d4d4d4' }}>
                  {new Date(log.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Sync Omie */}
      {showSync && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !syncRunning) setShowSync(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '24px', width: '480px',
            padding: '40px', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Database size={22} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>Sync Omie</h3>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Clientes, projetos e produtos</p>
                </div>
              </div>
              {!syncRunning && (
                <button onClick={() => setShowSync(false)} style={{
                  background: '#f5f5f5', border: 'none', borderRadius: '10px',
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#737373'
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Barra de progresso */}
            <div style={{
              background: '#f5f5f5', borderRadius: '12px', height: '12px',
              overflow: 'hidden', marginBottom: '16px'
            }}>
              <div style={{
                height: '100%', borderRadius: '12px',
                background: syncError ? '#ef4444' : syncProgress === 100 ? '#22c55e' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                width: `${syncProgress}%`,
                transition: 'width 0.4s ease-out'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '13px', color: syncError ? '#ef4444' : '#737373', fontWeight: '500' }}>
                {syncError || syncStep || 'Pronto para sincronizar'}
              </span>
              <span style={{ fontSize: '20px', fontWeight: '700', color: syncProgress === 100 ? '#22c55e' : '#1a1a1a' }}>
                {syncProgress}%
              </span>
            </div>

            {/* Etapas + seleção (checkboxes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {([
                { label: 'Clientes', key: 'clientes' as const },
                { label: 'Projetos', key: 'projetos' as const },
                { label: 'Produtos', key: 'produtos' as const },
              ]).map(s => {
                const selected = syncSelection[s.key]
                const hasResult = !!syncResults?.[s.key]
                const done = hasResult
                const active = syncRunning && selected && !done && syncStep.toLowerCase().includes(s.key)
                const disabledVisual = !selected && !syncRunning
                return (
                  <label key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: '12px',
                    background: done ? '#f0fdf4' : active ? '#fef2f2' : disabledVisual ? '#fafafa' : '#fff7ed',
                    border: `1px solid ${done ? '#bbf7d0' : active ? '#fecaca' : disabledVisual ? '#f0f0f0' : '#fed7aa'}`,
                    transition: 'all 0.3s',
                    cursor: syncRunning ? 'not-allowed' : 'pointer',
                    opacity: disabledVisual ? 0.6 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={syncRunning}
                      onChange={e => setSyncSelection(prev => ({ ...prev, [s.key]: e.target.checked }))}
                      style={{
                        width: 18, height: 18, accentColor: '#dc2626',
                        cursor: syncRunning ? 'not-allowed' : 'pointer', flexShrink: 0,
                      }}
                    />
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? '#22c55e' : active ? '#dc2626' : '#e5e5e5',
                      color: '#fff', flexShrink: 0
                    }}>
                      {done ? <Check size={14} /> : active ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                    </div>
                    <span style={{
                      fontSize: '14px', fontWeight: done ? '600' : '500',
                      color: done ? '#16a34a' : active ? '#dc2626' : '#525252'
                    }}>
                      {s.label}
                    </span>
                    {done && syncResults?.[s.key] && (
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                        {syncResults[s.key].total} registros
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {/* Botão */}
            {!syncRunning && syncProgress < 100 && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={18} /> Iniciar Sincronizacao
              </button>
            )}

            {syncProgress === 100 && !syncError && (
              <button
                onClick={() => { setShowSync(false); setSyncProgress(0); setSyncStep(''); setSyncResults(null) }}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#22c55e', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <Check size={18} /> Concluido — Fechar
              </button>
            )}

            {syncError && !syncRunning && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#ef4444', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <RefreshCw size={18} /> Tentar Novamente
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '60px', paddingTop: '24px',
        borderTop: '1px solid #f0f0f0',
        textAlign: 'center'
      }}>
        <p
          style={{ fontSize: '12px', color: '#d4d4d4', fontWeight: '500', cursor: 'default' }}
          onDoubleClick={() => setShowSync(true)}
          title=""
        >
          Nova Tratores &copy; {new Date().getFullYear()} &mdash; Portal Corporativo v1.0
        </p>
      </div>
    </div>
  )
}
