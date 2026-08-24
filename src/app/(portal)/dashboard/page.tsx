'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import DashboardMobile from '@/components/dashboard/DashboardMobile'
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
  Star, LayoutGrid, List, CircleDot, AlertCircle, Headset, LayoutDashboard, Truck
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
  group: string
  external?: boolean
  permAcao?: string // ação granular dentro do módulo (pode(modulo, permAcao)); senão usa temAcesso(modulo)
}

const DASH_GROUPS: Record<string, { label: string; color: string; gradient: string; icon: React.ReactNode }> = {
  servicos:   { label: 'Serviços',    color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)', icon: <Settings size={22} /> },
  pecas:      { label: 'Peças',       color: '#F97316', gradient: 'linear-gradient(135deg, #F97316, #EA580C)', icon: <Package size={22} /> },
  financeiro: { label: 'Financeiro',  color: '#10B981', gradient: 'linear-gradient(135deg, #10B981, #059669)', icon: <DollarSign size={22} /> },
  comercial:  { label: 'Comercial',   color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626, #B91C1C)', icon: <Building size={22} /> },
  estoque:    { label: 'Estoque',     color: '#94A3B8', gradient: 'linear-gradient(135deg, #CBD5E1, #94A3B8)', icon: <BarChart3 size={22} /> },
  frota:      { label: 'Frota',       color: '#1E40AF', gradient: 'linear-gradient(135deg, #1D4ED8, #1E3A8A)', icon: <Truck size={22} /> },
  outros:     { label: 'Outros',      color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #4B5563)', icon: <Activity size={22} /> },
}

// ⚠️ Um grupo fora desta lista não renderiza em nenhum viewMode.
const DASH_GROUP_ORDER = ['servicos', 'pecas', 'financeiro', 'comercial', 'estoque', 'frota', 'outros']

const systems: SystemCard[] = [
  // Serviços (azul claro)
  { id: 'pos', name: 'Pós-Vendas (OS)', description: 'Ordens de serviço, integração Omie ERP, geração de PDF', icon: <Settings size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)', href: '/pos', tag: 'OS', group: 'servicos' },
  { id: 'garantias', name: 'Garantias', description: 'Solicitações de garantia, envio à fábrica, cobrança ao cliente e relatórios', icon: <ShieldCheck size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0284C7)', href: '/garantias', tag: 'GARANTIAS', group: 'servicos' },
  { id: 'controle-revisao', name: 'Controle de Revisões', description: 'Acompanhamento de revisões periódicas de tratores com integração Gmail', icon: <Wrench size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0284C7, #0369A1)', href: '/revisoes', tag: 'MANUTENÇÃO', group: 'servicos' },
  { id: 'mecanicos', name: 'Janela Mecânicos', description: 'Jornada, agenda e acompanhamento dos mecânicos de campo', icon: <Users size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #38BDF8, #0EA5E9)', href: '/mecanicos', tag: 'TÉCNICOS', group: 'servicos' },
  { id: 'sat', name: 'SAT Digital', description: 'Solicitações de atendimento técnico — Kanban e cards para o Pós-Vendas', icon: <Headset size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)', href: '/sat', tag: 'ATENDIMENTO', group: 'servicos' },
  { id: 'mapa-geral', name: 'Mapeamento Técnico', description: 'Visualização geográfica de clientes, técnicos e operações', icon: <Map size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)', href: '/mapa-geral', tag: 'MAPA', group: 'servicos' },
  { id: 'fotos-tecnicos', name: 'Fotos Técnicos', description: 'Fotos anexadas pelos técnicos em cada ordem de serviço', icon: <Camera size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0284C7, #0369A1)', href: '/fotos-tecnicos', tag: 'FOTOS', group: 'servicos' },
  { id: 'lousa', name: 'Lousa Virtual', description: 'Agenda semanal de serviços com verificação de OS e pedidos PPV', icon: <ClipboardCheck size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #38BDF8, #0284C7)', href: '/lousa', tag: 'AGENDA', group: 'servicos' },

  // Peças (laranja)
  { id: 'ppv', name: 'Peças (Pedido de Venda)', description: 'Pedidos de venda de peças, rastreamento e gestão', icon: <Package size={28} />, color: '#F97316', gradient: 'linear-gradient(135deg, #F97316, #EA580C)', href: '/ppv', tag: 'PEÇAS', group: 'pecas' },
  { id: 'orcamentos', name: 'Orçamentos', description: 'Orçamentos personalizados com peças, mão de obra e deslocamento', icon: <Calculator size={28} />, color: '#F97316', gradient: 'linear-gradient(135deg, #FB923C, #EA580C)', href: '/orcamentos', tag: 'ORÇAMENTOS', group: 'pecas' },
  { id: 'app-requisicoes', name: 'Requisições', description: 'Kanban de requisições de materiais e serviços das unidades', icon: <ClipboardList size={28} />, color: '#F97316', gradient: 'linear-gradient(135deg, #F97316, #C2410C)', href: '/requisicoes', tag: 'COMPRAS', group: 'pecas' },

  // Financeiro (verde)
  { id: 'sistema-financeiro', name: 'Financeiro', description: 'Gestão de NF, boletos, contas a pagar e receber, chamados RH', icon: <DollarSign size={28} />, color: '#10B981', gradient: 'linear-gradient(135deg, #10B981, #059669)', href: '/financeiro', tag: 'FINANÇAS', group: 'financeiro' },
  { id: 'dre', name: 'DRE Financeiro', description: 'Demonstração do Resultado do Exercício com dados integrados do Omie', icon: <TrendingUp size={28} />, color: '#10B981', gradient: 'linear-gradient(135deg, #059669, #047857)', href: '/dre-financeiro', tag: 'DRE', group: 'financeiro' },

  // Comercial (roxo)
  { id: 'proposta-comercial', name: 'Proposta Comercial', description: 'Geração de propostas com PDF e QR Code para clientes', icon: <FileText size={28} />, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626, #B91C1C)', href: '/propostas', tag: 'VENDAS', group: 'comercial' },
  { id: 'feedbacks', name: 'Feedbacks & CRM', description: 'CRM/RFM, oportunidades automáticas de revisão, peças, up-sell e follow-up', icon: <Megaphone size={28} />, color: '#DC2626', gradient: 'linear-gradient(135deg, #F87171, #B91C1C)', href: '/feedbacks', tag: 'CRM', group: 'comercial' },
  { id: 'clientes', name: 'Pastas Clientes', description: 'Ranking de clientes por volume de serviços, OS, PV e NF integrados ao Omie', icon: <Building size={28} />, color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)', href: '/clientes', tag: 'CLIENTES', group: 'servicos' },
  { id: 'supervisor-vendas', name: 'Supervisor Vendas', description: 'Painel do supervisor: vendedores, visitas, catálogo, mapa e alertas', icon: <TrendingUp size={28} />, color: '#DC2626', gradient: 'linear-gradient(135deg, #B91C1C, #991B1B)', href: '/supervisor-vendas', tag: 'VENDAS', group: 'comercial' },
  { id: 'gestao-vendas', name: 'Gestão de Vendas', description: 'Resultado mensal: margens, comissões e custos por vendedor', icon: <BarChart3 size={28} />, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626, #7F1D1D)', href: '/gestao-vendas', tag: 'RESULTADOS', group: 'comercial' },

  // Estoque (vermelho)
  { id: 'consulta-estoque', name: 'Visual Estoque', description: 'Showroom virtual de estoque com visualização de peças e produtos', icon: <BarChart3 size={28} />, color: '#94A3B8', gradient: 'linear-gradient(135deg, #CBD5E1, #94A3B8)', href: '/visual-estoque', tag: 'VISUAL', group: 'estoque' },
  { id: 'consulta-omie', name: 'Consulta Estoque', description: 'Estoque Omie, CMC, curva ABC, dashboard de vendas e comissões', icon: <Eye size={28} />, color: '#94A3B8', gradient: 'linear-gradient(135deg, #94A3B8, #64748B)', href: '/estoque', tag: 'CONSULTA', group: 'estoque' },
  { id: 'estoque-notas-entrada', name: 'Notas de Entrada', description: 'Notas fiscais de entrada, DANFE, descrições e custos de compra', icon: <FileText size={28} />, color: '#94A3B8', gradient: 'linear-gradient(135deg, #94A3B8, #64748B)', href: '/estoque/notas-entrada', tag: 'ENTRADAS', group: 'estoque', permAcao: 'notas-entrada' },
  { id: 'estoque-recebimentos', name: 'Recebimentos', description: 'Conferência de recebimentos de mercadoria e pendências', icon: <Package size={28} />, color: '#94A3B8', gradient: 'linear-gradient(135deg, #94A3B8, #64748B)', href: '/estoque/recebimentos', tag: 'RECEBIMENTO', group: 'estoque', permAcao: 'recebimentos' },
  { id: 'estoque-movimentacao', name: 'Movimentação de Produto', description: 'Entradas e saídas de estoque de um produto no período (kardex)', icon: <Activity size={28} />, color: '#94A3B8', gradient: 'linear-gradient(135deg, #94A3B8, #64748B)', href: '/estoque/movimentacao-produto', tag: 'MOVIMENTAÇÃO', group: 'estoque', permAcao: 'movimentacao-produto' },
  { id: 'frota', name: 'Frota', description: 'Veículos, abastecimento, multas, manutenções, documentos e rastreamento', icon: <Truck size={28} />, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1D4ED8, #1E3A8A)', href: '/frota', tag: 'VEÍCULOS', group: 'frota' },
  // Atalho pra abrir pendência de veículo (módulo próprio, mobile-first com foto)
  { id: 'pendencias', name: 'Pendências Frota', description: 'Abrir e acompanhar pendências dos veículos — com foto direto do celular', icon: <Wrench size={28} />, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1D4ED8, #1E3A8A)', href: '/pendencias', tag: 'PENDÊNCIAS', group: 'frota' },

  // Outros (cinza)
  { id: 'opa', name: 'Opa', description: 'Sinalize ocorrências e coisas fora do lugar — todos veem até alguém resolver', icon: <AlertCircle size={28} />, color: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)', href: '/opa', tag: 'OCORRÊNCIAS', group: 'outros' },
  { id: 'avisos', name: 'Avisos', description: 'Comunicados e avisos para toda a equipe, com anexos e notificações', icon: <Megaphone size={28} />, color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #4B5563)', href: '/avisos', tag: 'COMUNICADOS', group: 'outros' },
  { id: 'tarefas', name: 'Tarefas', description: 'Gestão de tarefas entre usuários', icon: <ClipboardCheck size={28} />, color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #374151)', href: '/tarefas', tag: 'TAREFAS', group: 'outros' },
  { id: 'dashboard-agro', name: 'Dashboard Agro', description: 'Dashboard de acompanhamento do segmento agrícola', icon: <Wheat size={28} />, color: '#6B7280', gradient: 'linear-gradient(135deg, #22c55e, #15803d)', href: '/dashboard-agro', tag: 'AGRO', group: 'outros' },
  { id: 'back-nova', name: 'Back Nova', description: 'Sistema backend Nova Tratores', icon: <Server size={28} />, color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280, #374151)', href: 'https://back.novatratores.com', tag: 'BACKEND', group: 'outros', external: true },
  { id: 'configuracoes', name: 'Configurações', description: 'Gestão de usuários, permissões e configurações gerais do portal', icon: <Settings size={28} />, color: '#6B7280', gradient: 'linear-gradient(135deg, #525252, #1a1a1a)', href: '/admin', tag: 'ADMIN', group: 'outros' },
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
  'lousa': 'lousa',
  'consulta-estoque': 'consulta-estoque', // card Visual Estoque (/visual-estoque)
  'consulta-omie': 'estoque',             // card Consulta Estoque (/estoque)
  'estoque-notas-entrada': 'estoque',     // sub-tela; gate por pode('estoque','notas-entrada')
  'estoque-recebimentos': 'estoque',      // sub-tela; gate por pode('estoque','recebimentos')
  'estoque-movimentacao': 'estoque',      // sub-tela; gate por pode('estoque','movimentacao-produto')
  'frota': 'frota',                       // ⚠️ card SEM entrada aqui = visível pra TODOS
  'pendencias': 'pendencias',
  'avisos': 'avisos',
  'dashboard-agro': 'dashboard-agro',
  'dre': 'dre',
  'back-nova': 'back-nova',
  'supervisor-vendas': 'supervisor-vendas',
  'gestao-vendas': 'gestao-vendas',
  'configuracoes': 'admin',
}

interface CardFolder {
  id: string
  name: string
  cardIds: string[]
}

type ViewMode = 'grade' | 'lista' | 'circular' | 'omie'
type FavFilter = 'so-favoritos' | 'todos' | 'ocultar'

const defaultFolders: CardFolder[] = []

export default function DashboardPage() {
  const { userProfile, router } = useAuth()
  const isMobile = useIsMobile()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
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
  const [omieGroup, setOmieGroup] = useState<string | null>(null)  // categoria aberta no modo Omie
  const [showcaseIdx, setShowcaseIdx] = useState(0)  // índice do showcase rotativo de sistemas
  const [favFilter, setFavFilter] = useState<FavFilter>('ocultar')
  const [openGroups, setOpenGroups] = useState<string[]>([])

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

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
    // Filtro de favoritos
    const ffKey = `portal-favfilter-${userProfile.id}`
    const savedFf = localStorage.getItem(ffKey) as FavFilter | null
    if (savedFf) setFavFilter(savedFf)
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

  // Salvar filtro de favoritos
  useEffect(() => {
    if (!userProfile?.id || !foldersLoaded) return
    localStorage.setItem(`portal-favfilter-${userProfile.id}`, favFilter)
  }, [favFilter, userProfile?.id, foldersLoaded])

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
      const appsComAuth = ['consulta-estoque', 'consulta-omie']
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
    if (!modulo) return true
    // Sub-telas de um módulo (permAcao) respeitam a permissão granular; o resto, o módulo inteiro.
    return s.permAcao ? pode(modulo, s.permAcao) : temAcesso(modulo)
  }), [temAcesso, pode])

  // Showcase rotativo: passa de sistema em sistema sozinho
  useEffect(() => {
    if (allowedSystems.length < 2) return
    const t = setInterval(() => setShowcaseIdx(i => (i + 1) % allowedSystems.length), 3800)
    return () => clearInterval(t)
  }, [allowedSystems.length])

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
    if (favFilter === 'so-favoritos') {
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
  }, [filteredSystems, activeFolder, folders, editingFolder, favFilter, favoritos])

  // Favoritos para a faixa de destaque (modo "Todos")
  // Ordem da faixa = ordem do array de favoritos (o usuário arrasta pra mudar),
  // e não a ordem fixa da lista de sistemas.
  const favoritosSystems = useMemo(
    () => favoritos
      .map(id => filteredSystems.find(s => s.id === id))
      .filter((s): s is SystemCard => Boolean(s)),
    [filteredSystems, favoritos]
  )

  // ── Arrastar favoritos para reordenar ──
  const [dragFav, setDragFav] = useState<string | null>(null)
  const reordenarFavorito = (origem: string, destino: string) => {
    if (origem === destino) return
    setFavoritos(prev => {
      const arr = prev.filter(id => id !== origem)
      const i = arr.indexOf(destino)
      if (i < 0) return prev
      arr.splice(i, 0, origem)
      return arr
    })
  }

  const groupedDisplayed = useMemo(() => {
    const groups: { key: string; config: typeof DASH_GROUPS[string]; items: typeof displayedSystems }[] = []
    for (const gk of DASH_GROUP_ORDER) {
      const items = displayedSystems.filter(s => s.group === gk)
      if (items.length > 0) groups.push({ key: gk, config: DASH_GROUPS[gk], items })
    }
    return groups
  }, [displayedSystems])

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

  if (isMobile) {
    // ===== CELULAR: lançador de apps próprio (o desktop abaixo não é usado) =====
    return (
      <DashboardMobile
        systems={allowedSystems}
        favoritos={favoritos}
        onToggleFav={toggleFavorito}
        onOpen={(s) => openSystem(s as unknown as typeof allowedSystems[number])}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        userNome={userProfile?.nome}
      />
    )
  }

  return (
    <div style={{ padding: '20px 28px', background: 'var(--portal-bg)', minHeight: '100%' }}>
      {/* Breadcrumb quando dentro de uma pasta */}
      {activeFolder !== 'todos' && !editingFolder && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px',
          padding: '14px 22px', borderRadius: '16px',
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

      {/* Filtros + View modes + Busca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {/* Filtro de favoritos (3 estados) */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--portal-bg-secondary)', borderRadius: '10px', padding: '3px' }}>
          {([
            { val: 'so-favoritos' as FavFilter, label: 'Favoritos', star: true, title: 'Mostrar só favoritos' },
            { val: 'todos' as FavFilter, label: 'Todos', star: false, title: 'Destacar favoritos no topo' },
            { val: 'ocultar' as FavFilter, label: 'Ocultar', star: false, title: 'Sem destaque de favoritos' },
          ]).map(f => {
            const ativo = favFilter === f.val
            return (
              <button
                key={f.val}
                onClick={() => setFavFilter(f.val)}
                title={f.title}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 8, border: 'none',
                  background: ativo ? '#dc2626' : 'transparent',
                  color: ativo ? '#fff' : '#a3a3a3',
                  display: 'flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer', transition: 'all .15s',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Inter',
                }}
              >
                {f.star && <Star size={13} fill={ativo ? '#fff' : 'none'} color={ativo ? '#fff' : '#a3a3a3'} />}
                {f.label}
              </button>
            )
          })}
        </div>

        {/* View mode buttons */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--portal-bg-secondary)', borderRadius: '10px', padding: '3px' }}>
          {([
            { mode: 'grade' as ViewMode, icon: <LayoutGrid size={15} />, title: 'Grade' },
            { mode: 'omie' as ViewMode, icon: <LayoutDashboard size={15} />, title: 'Estilo Omie' },
            { mode: 'lista' as ViewMode, icon: <List size={15} />, title: 'Lista' },
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

      {/* ══ Faixa de favoritos (modo "Todos") ══ */}
      {favFilter === 'todos' && favoritosSystems.length > 0 && !editingFolder && (
        <div style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 14,
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          boxShadow: '0 1px 3px rgba(16,24,40,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <Star size={13} fill="#F59E0B" color="#F59E0B" />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: 1, textTransform: 'uppercase' }}>Favoritos</span>
            <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', opacity: .75 }}>
              — segure e arraste para mudar a ordem
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {favoritosSystems.map(system => (
              <div key={system.id} onClick={() => openSystem(system)}
                draggable
                onDragStart={e => { setDragFav(system.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={e => { e.preventDefault(); if (dragFav) reordenarFavorito(dragFav, system.id) }}
                onDragEnd={() => setDragFav(null)}
                style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 8px',
                borderRadius: 10, cursor: dragFav ? 'grabbing' : 'grab', background: 'transparent',
                opacity: dragFav === system.id ? .45 : 1,
                border: 'none', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s, background .2s, opacity .15s',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)'
                  e.currentTarget.style.boxShadow = `0 10px 22px ${system.color}33`
                  e.currentTarget.style.background = `${system.color}12`
                  const ic = e.currentTarget.firstElementChild as HTMLElement | null
                  if (ic) ic.style.transform = 'rotate(-6deg) scale(1.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.background = 'transparent'
                  const ic = e.currentTarget.firstElementChild as HTMLElement | null
                  if (ic) ic.style.transform = ''
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: system.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}>
                  {system.icon}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{system.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vazio: nenhum favorito marcado */}
      {favFilter === 'so-favoritos' && favoritosSystems.length === 0 && !loadingPerm && (
        <div style={{
          padding: '40px', textAlign: 'center', borderRadius: 16,
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        }}>
          <Star size={28} color="#e5e5e5" style={{ margin: '0 auto 10px', display: 'block' }} />
          <p style={{ color: '#a3a3a3', fontSize: 14, margin: 0 }}>Nenhum favorito ainda. Passe o mouse num card e clique na estrela.</p>
        </div>
      )}

      {/* ══ GRADE ══ */}
      {/* ══ OMIE (tiles coloridos por categoria) ══ */}
      {viewMode === 'omie' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {groupedDisplayed.map((group) => {
              const gc = group.config
              const ativo = omieGroup === group.key
              return (
                <button key={group.key} className={`dash-group-card dash-group-${group.key}`} onClick={() => setOmieGroup(ativo ? null : group.key)} style={{
                  border: 'none', borderRadius: 18, padding: '20px', cursor: 'pointer', textAlign: 'left',
                  background: gc.gradient, color: '#fff', minHeight: 148,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16,
                  boxShadow: ativo ? `0 14px 32px ${gc.color}55` : `0 6px 18px ${gc.color}33`,
                  transform: ativo ? 'translateY(-3px)' : 'none', transition: 'all .2s',
                  outline: ativo ? '3px solid rgba(255,255,255,0.9)' : 'none', outlineOffset: '-3px',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }}
                  onMouseLeave={e => { if (!ativo) e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{gc.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>{gc.label}</div>
                    <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 4 }}>{group.items.length} sistema{group.items.length !== 1 ? 's' : ''}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {omieGroup && (() => {
            const group = groupedDisplayed.find(g => g.key === omieGroup)
            if (!group) return null
            const gc = group.config
            return (
              <div style={{ marginTop: 22, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 18, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', animation: 'fadeIn 0.25s ease-out both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: gc.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{gc.icon}</div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>{gc.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: gc.color, background: `${gc.color}12`, padding: '2px 8px', borderRadius: 6 }}>{group.items.length}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                  {group.items.map((system, i) => {
                    const isFav = favoritos.includes(system.id)
                    return (
                      <div key={system.id} style={{
                        borderRadius: 14, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                        background: 'var(--portal-bg)', border: '1px solid var(--portal-border)',
                        transition: 'all 0.2s', animation: `fadeIn 0.3s ease-out ${i * 0.04}s both`,
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${gc.color}50`; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 20px ${gc.color}12` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                      >
                        <div style={{ height: 3, background: gc.gradient }} />
                        <button onClick={(e) => { e.stopPropagation(); toggleFavorito(system.id) }} className="fav-btn" style={{
                          position: 'absolute', top: 12, right: 10, zIndex: 2, width: 26, height: 26, borderRadius: 6, border: 'none',
                          background: isFav ? '#FEF3C7' : 'transparent', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isFav ? 1 : 0, transition: 'opacity .2s',
                        }}>
                          <Star size={13} fill={isFav ? '#F59E0B' : 'none'} color={isFav ? '#F59E0B' : '#d4d4d4'} />
                        </button>
                        <div onClick={() => editingFolder ? toggleCardInFolder(editingFolder, system.id) : openSystem(system)} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: system.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                            {system.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 2 }}>{system.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{system.description}</div>
                          </div>
                          {system.external && <ChevronRight size={13} color="#d4d4d4" style={{ flexShrink: 0 }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {viewMode === 'grade' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {groupedDisplayed.map((group) => {
            const isOpen = openGroups.includes(group.key)
            const gc = group.config
            return (
              <div key={group.key} style={{
                borderRadius: 18, overflow: 'hidden',
                border: `1px solid ${isOpen ? gc.color + '40' : 'var(--portal-border)'}`,
                background: 'var(--portal-bg-card)',
                boxShadow: isOpen ? `0 6px 24px ${gc.color}14` : '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'all 0.25s ease',
                gridColumn: group.items.length >= 5 ? 'span 2' : 'span 1',
              }}>
                <div
                  onClick={() => toggleGroup(group.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: isOpen ? `${gc.color}08` : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = `${gc.color}06` }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: gc.gradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: '#fff', transition: 'transform 0.2s',
                    transform: isOpen ? 'scale(1.05)' : 'scale(1)',
                  }}>
                    {gc.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{gc.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: gc.color, background: `${gc.color}12`, padding: '2px 8px', borderRadius: 6 }}>{group.items.length}</span>
                    </div>
                    {!isOpen && (
                      <div style={{ fontSize: 11, color: '#a3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {group.items.map(s => s.name).join(' · ')}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} color={gc.color} style={{ transition: 'transform 0.25s ease', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', flexShrink: 0 }} />
                </div>
                <div style={{
                  maxHeight: isOpen ? 3000 : 0, opacity: isOpen ? 1 : 0,
                  overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                }}>
                  <div style={{ borderTop: `1px solid ${gc.color}15`, padding: '12px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: group.items.length >= 5 ? 'repeat(auto-fill, minmax(240px, 1fr))' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                      {group.items.map((system, i) => {
                        const isFav = favoritos.includes(system.id)
                        return (
                          <div key={system.id} style={{
                            borderRadius: 14, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                            background: 'var(--portal-bg)', border: '1px solid var(--portal-border)',
                            transition: 'all 0.2s', animation: `fadeIn 0.3s ease-out ${i * 0.04}s both`,
                          }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = `${gc.color}50`; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 20px ${gc.color}12` }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                          >
                            <div style={{ height: 3, background: gc.gradient }} />
                            <button onClick={(e) => { e.stopPropagation(); toggleFavorito(system.id) }} className="fav-btn" style={{
                              position: 'absolute', top: 12, right: 10, zIndex: 2, width: 26, height: 26, borderRadius: 6, border: 'none',
                              background: isFav ? '#FEF3C7' : 'transparent', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isFav ? 1 : 0, transition: 'opacity .2s',
                            }}>
                              <Star size={13} fill={isFav ? '#F59E0B' : 'none'} color={isFav ? '#F59E0B' : '#d4d4d4'} />
                            </button>
                            <div onClick={() => editingFolder ? toggleCardInFolder(editingFolder, system.id) : openSystem(system)} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: 10, background: system.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                {system.icon}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 2 }}>{system.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{system.description}</div>
                              </div>
                              {system.external && <ChevronRight size={13} color="#d4d4d4" style={{ flexShrink: 0 }} />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ LISTA (plana, sem agrupar) ══ */}
      {viewMode === 'lista' && (
        <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {displayedSystems.map((system, i) => {
            const isFav = favoritos.includes(system.id)
            const gc = DASH_GROUPS[system.group] || DASH_GROUPS.outros
            return (
              <div key={system.id} onClick={() => editingFolder ? toggleCardInFolder(editingFolder, system.id) : openSystem(system)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                borderBottom: i < displayedSystems.length - 1 ? '1px solid var(--portal-border)' : 'none',
                cursor: 'pointer', transition: 'background .15s', background: 'transparent',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: system.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  {system.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)' }}>{system.name}</div>
                  <div style={{ fontSize: 11.5, color: '#a3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{system.description}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: gc.color, background: `${gc.color}10`, padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>{system.tag}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorito(system.id) }} style={{
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: isFav ? '#FEF3C7' : 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Star size={12} fill={isFav ? '#F59E0B' : 'none'} color={isFav ? '#F59E0B' : '#e5e5e5'} />
                </button>
              </div>
            )
          })}
          {displayedSystems.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#a3a3a3', fontSize: 13 }}>Nenhum sistema.</div>}
        </div>
      )}


      <style>{`.fav-btn { opacity: 0 !important; } div:hover > .fav-btn { opacity: 1 !important; }`}</style>

      {/* ══ Showcase rotativo de sistemas ══ */}
      {allowedSystems.length > 0 && (() => {
        const sys = allowedSystems[showcaseIdx % allowedSystems.length]
        if (!sys) return null
        return (
          <div style={{ marginTop: '28px' }}>
            <div key={showcaseIdx} onClick={() => openSystem(sys)} style={{
              position: 'relative', overflow: 'hidden', cursor: 'pointer',
              borderRadius: 20, padding: '26px 30px', minHeight: 116,
              background: sys.gradient, color: '#fff',
              boxShadow: `0 14px 34px ${sys.color}40`,
              animation: 'showcaseIn .55s ease both',
              display: 'flex', alignItems: 'center', gap: 22,
            }}>
              <div style={{ width: 68, height: 68, borderRadius: 18, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sys.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, opacity: 0.85, textTransform: 'uppercase' }}>{sys.tag}</div>
                <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{sys.name}</div>
                <div style={{ fontSize: 13.5, opacity: 0.92, marginTop: 6, maxWidth: 640, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sys.description}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {(showcaseIdx % allowedSystems.length) + 1} / {allowedSystems.length}
              </div>
              <ChevronRight size={26} style={{ flexShrink: 0, opacity: 0.85 }} />
            </div>
          </div>
        )
      })()}

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
        marginTop: '36px', paddingTop: '20px',
        borderTop: '1px solid var(--portal-border)',
        textAlign: 'center'
      }}>
        <button
          onClick={() => setShowSync(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '12px', marginBottom: '14px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: '13px', fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--portal-border)'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
        >
          <RefreshCw size={15} /> Sincronizar com Omie
        </button>
        <p style={{ fontSize: '12px', color: '#d4d4d4', fontWeight: '500', cursor: 'default' }}>
          Nova Tratores &copy; {new Date().getFullYear()} &mdash; Portal Corporativo v1.0
        </p>
      </div>
    </div>
  )
}
