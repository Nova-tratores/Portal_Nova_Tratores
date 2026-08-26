'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, Check, X, Search, ChevronDown, ChevronUp, ChevronRight, ArrowLeft,
  User as UserIcon, Lock, Unlock, Wrench, UserPlus, Eye, EyeOff,
  Activity, Clock, Settings, ClipboardList, DollarSign, FileText, Mail, Ban, RotateCcw
} from 'lucide-react'
import PermissoesModulos from '@/components/admin/PermissoesModulos'

const MODULOS = [
  // Ajustes: módulo único que expande nas páginas (ações vêm de
  // ACOES_POR_MODULO['ajustes'], derivado de PAGINAS_AJUSTES).
  { id: 'ajustes', label: 'Ajustes', color: '#991b1b' },
  { id: 'avisos', label: 'Avisos', color: '#dc2626' },
  { id: 'clientes', label: 'Clientes', color: '#dc2626' },
  { id: 'consulta-estoque', label: 'Consulta Omie', color: '#7f1d1d' },
  { id: 'revisoes', label: 'Controle de Revisões', color: '#b91c1c' },
  { id: 'dashboard-agro', label: 'Dashboard Agro', color: '#16a34a' },
  { id: 'dre', label: 'DRE Financeiro', color: '#dc2626' },
  { id: 'estoque', label: 'Visual Estoque', color: '#991b1b' },
  { id: 'feedbacks', label: 'Feedbacks & CRM', color: '#dc2626' },
  { id: 'financeiro', label: 'Financeiro', color: '#dc2626' },
  { id: 'fotos-tecnicos', label: 'Fotos Técnicos', color: '#dc2626' },
  { id: 'garantias', label: 'Garantias', color: '#0ea5e9' },
  { id: 'gestao-vendas', label: 'Gestão de Vendas', color: '#dc2626' },
  { id: 'mecanicos', label: 'Janela Mecânicos', color: '#1d4ed8' },
  { id: 'mapa', label: 'Mapeamento Técnico', color: '#b91c1c' },
  { id: 'omie-massa', label: 'Omie em Massa', color: '#7c3aed' },
  { id: 'opa', label: 'Opa (Ocorrências)', color: '#dc2626' },
  { id: 'orcamentos', label: 'Orçamentos', color: '#ef4444' },
  { id: 'painel-mecanicos', label: 'Painel Mecânicos', color: '#3b82f6' },
  { id: 'ppv', label: 'Peças (PPV)', color: '#ef4444' },
  { id: 'pos', label: 'Pós-Vendas (OS)', color: '#dc2626' },
  { id: 'propostas', label: 'Proposta Comercial', color: '#991b1b' },
  { id: 'requisicoes', label: 'Requisições', color: '#ef4444' },
  { id: 'sat', label: 'SAT Digital', color: '#0ea5e9' },
  { id: 'supervisor-vendas', label: 'Supervisor Vendas', color: '#dc2626' },
  { id: 'tarefas', label: 'Tarefas', color: '#dc2626' },
  { id: 'tickets', label: 'Tickets', color: '#0891b2' },
  { id: 'tratorilson', label: 'Tratorilson (Chat IA)', color: '#ef4444' },
  { id: 'war-room', label: 'War Room', color: '#b91c1c' },
]

const CATEGORIAS = ['Pós Vendas', 'Peças', 'Comercial', 'Financeiro']

const SISTEMAS_MAP: Record<string, { label: string; icon: string }> = {
  revisoes: { label: 'Controle de Revisões', icon: 'wrench' },
  requisicoes: { label: 'Requisições', icon: 'clipboard' },
  pos: { label: 'Pós-Vendas (OS)', icon: 'settings' },
  ppv: { label: 'Peças (PPV)', icon: 'shield' },
  financeiro: { label: 'Financeiro', icon: 'dollar' },
  propostas: { label: 'Proposta Comercial', icon: 'file' },
  garantias: { label: 'Garantias', icon: 'shield' },
  mecanicos: { label: 'Janela Mecânicos', icon: 'wrench' },
  orcamentos: { label: 'Orçamentos', icon: 'file' },
  tarefas: { label: 'Tarefas', icon: 'clipboard' },
  admin: { label: 'Administração', icon: 'shield' },
}

const SISTEMA_ICON_MAP: Record<string, React.ReactNode> = {
  wrench: <Wrench size={16} />,
  clipboard: <ClipboardList size={16} />,
  settings: <Settings size={16} />,
  shield: <Shield size={16} />,
  dollar: <DollarSign size={16} />,
  file: <FileText size={16} />,
}

const ACAO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  criar: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  editar: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  deletar: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  visualizar: { bg: '#f5f5f5', text: '#737373', border: '#e5e5e5' },
  enviar_email: { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
  mover_status: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  upload: { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
  acesso: { bg: '#f5f5f5', text: '#a3a3a3', border: '#e5e5e5' },
  enviar_omie: { bg: '#eef2ff', text: '#4f46e5', border: '#c7d2fe' },
  adicionar_item: { bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' },
  devolver: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
}

const ACAO_LABELS: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', deletar: 'Deletou', visualizar: 'Visualizou',
  enviar_email: 'Enviou email', mover_status: 'Moveu status', upload: 'Fez upload',
  acesso: 'Acessou', enviar_omie: 'Enviou p/ Omie', adicionar_item: 'Adicionou item',
  devolver: 'Devolveu',
}

interface AuditEntry {
  id: number
  user_id: string
  user_nome: string
  sistema: string
  acao: string
  entidade: string | null
  entidade_id: string | null
  entidade_label: string | null
  detalhes: Record<string, unknown>
  created_at: string
}

interface Usuario {
  id: string
  nome: string
  funcao: string
  avatar_url: string
  email: string
  ativo?: boolean
}

interface Permissao {
  id?: string
  user_id: string
  is_admin: boolean
  is_dev?: boolean
  categoria: string
  modulos_permitidos: string[]
  mecanico_role: 'tecnico' | 'observador' | null
  mecanico_tecnico_nome: string | null
}

export default function AdminPage() {
  const { userProfile } = useAuth()
  const { isAdmin, isDev, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, Permissao>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // Quais usuários estão com o painel de permissões expandido
  const [expandidoUsuario, setExpandidoUsuario] = useState<Set<string>>(new Set())
  const toggleExpandirUsuario = (id: string) => setExpandidoUsuario(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const [search, setSearch] = useState('')
  const [showNovoUsuario, setShowNovoUsuario] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoSenha, setNovoSenha] = useState('nova123')
  const [novoFuncao, setNovoFuncao] = useState('')
  const [novoModulos, setNovoModulos] = useState<string[]>([])
  const [showSenha, setShowSenha] = useState(false)
  const [criando, setCriando] = useState(false)
  const [criarErro, setCriarErro] = useState('')

  // Estado do painel de atividades do usuário
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null)
  const [userLogs, setUserLogs] = useState<AuditEntry[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [expandedSistema, setExpandedSistema] = useState<string | null>(null)
  const [resetandoSenha, setResetandoSenha] = useState(false)
  const [resetSenhaMsg, setResetSenhaMsg] = useState('')

  const fetchUserLogs = useCallback(async (userId: string) => {
    setLoadingLogs(true)
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500)
    setUserLogs(data || [])
    setLoadingLogs(false)
  }, [])

  const openUserDetail = (user: Usuario) => {
    setSelectedUser(user)
    setExpandedSistema(null)
    setResetSenhaMsg('')
    fetchUserLogs(user.id)
  }

  const resetarSenha = async (email: string) => {
    if (!email) { setResetSenhaMsg('Usuário sem email cadastrado'); return }
    setResetandoSenha(true)
    setResetSenhaMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/resetar-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ email }),
      })
      const result = await res.json()
      if (!res.ok) {
        setResetSenhaMsg('Erro: ' + (result.error || 'Falha ao enviar'))
      } else {
        setResetSenhaMsg('Email de redefinição enviado para ' + email)
      }
    } catch {
      setResetSenhaMsg('Erro ao conectar com servidor')
    } finally {
      setResetandoSenha(false)
    }
  }

  const formatDateFull = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const formatDateRelative = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMs / 3600000)
    const diffD = Math.floor(diffMs / 86400000)
    if (diffMin < 1) return 'Agora'
    if (diffMin < 60) return `${diffMin}min atrás`
    if (diffH < 24) return `${diffH}h atrás`
    if (diffD < 7) return `${diffD}d atrás`
    return formatDateFull(iso)
  }

  useEffect(() => {
    if (!loadingPerm && !isAdmin && userProfile) {
      router.push('/dashboard')
    }
  }, [loadingPerm, isAdmin, userProfile, router])

  const carregar = async () => {
    const { data: users } = await supabase.from('financeiro_usu').select('id, nome, funcao, avatar_url, email, ativo').order('nome')
    setUsuarios(users || [])

    const { data: perms } = await supabase.from('portal_permissoes').select('*')
    const map: Record<string, Permissao> = {}
    ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
    setPermissoes(map)

    setLoading(false)
  }

  useEffect(() => {
    if (!isAdmin) return
    carregar()
  }, [isAdmin])

  const salvar = async (userId: string, updates: Partial<Permissao>) => {
    setSaving(userId)
    const existing = permissoes[userId]

    // Update otimista — atualiza UI imediatamente
    setPermissoes(prev => {
      const base: Permissao = prev[userId] ?? { user_id: userId, is_admin: false, categoria: '', modulos_permitidos: [], mecanico_role: null, mecanico_tecnico_nome: null }
      return { ...prev, [userId]: { ...base, ...updates } }
    })

    try {
      // Escrita passa pelo servidor (com checagem de admin). O cliente não pode
      // mais gravar portal_permissoes direto — RLS bloqueia (fim da auto-promoção).
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/permissoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ user_id: userId, updates }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r.error || 'Falha ao salvar permissão')
      }
    } catch {
      // Reverte em caso de erro
      const { data: perms } = await supabase.from('portal_permissoes').select('*')
      const map: Record<string, Permissao> = {}
      ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
      setPermissoes(map)
    }
    setSaving(null)
  }

  const toggleAdmin = (userId: string) => {
    const perm = permissoes[userId]
    salvar(userId, { is_admin: !(perm?.is_admin) })
  }

  // Define o nível de acesso: usuario | admin | dev (dev = admin + extras)
  const setNivel = (userId: string, nivel: string) => {
    if (nivel === 'dev') salvar(userId, { is_admin: true, is_dev: true })
    else if (nivel === 'admin') salvar(userId, { is_admin: true, is_dev: false })
    else salvar(userId, { is_admin: false, is_dev: false })
  }

  const setCategoria = (userId: string, cat: string) => {
    salvar(userId, { categoria: cat })
  }

  const setMecanicoRole = (userId: string, role: string) => {
    const newRole = role === '' ? null : role as 'tecnico' | 'observador'
    const updates: Partial<Permissao> = { mecanico_role: newRole }

    // Preencher automaticamente com o nome do usuário do portal
    const user = usuarios.find(u => u.id === userId)
    if (newRole && user) {
      updates.mecanico_tecnico_nome = user.nome
    }

    // Limpar técnico vinculado se removeu o papel
    if (!newRole) {
      updates.mecanico_tecnico_nome = null
    }

    // Auto-adicionar módulo painel-mecanicos quando atribui papel
    if (newRole) {
      const perm = permissoes[userId]
      const modulos = perm?.modulos_permitidos || []
      if (!modulos.includes('painel-mecanicos')) {
        updates.modulos_permitidos = [...modulos, 'painel-mecanicos']
      }
    }

    salvar(userId, updates)
  }

  const toggleTodos = (userId: string) => {
    const perm = permissoes[userId]
    const current = perm?.modulos_permitidos || []
    const allModulos = MODULOS.map(m => m.id)
    const hasAll = allModulos.every(m => current.includes(m))
    salvar(userId, { modulos_permitidos: hasAll ? [] : allModulos })
  }

  // Inativar / reativar usuário (soft-delete em financeiro_usu)
  const toggleAtivo = async (userId: string, novo: boolean) => {
    if (userId === userProfile?.id) return // não pode inativar a própria conta
    setSaving(userId)
    setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ativo: novo } : u))
    // Passa pelo servidor: com RLS, o navegador só edita a própria linha de
    // financeiro_usu; mexer no "ativo" de outro usuário é ação de admin no servidor.
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/usuario-ativo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ user_id: userId, ativo: novo }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r.error || 'Falha ao alterar status')
      }
    } catch (e: any) {
      // reverte
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ativo: !novo } : u))
      alert('Erro ao alterar status: ' + (e?.message || 'erro'))
    }
    setSaving(null)
  }

  const criarUsuario = async () => {
    if (!novoNome.trim() || !novoEmail.trim()) { setCriarErro('Nome e email são obrigatórios'); return }
    if (novoSenha.length < 6) { setCriarErro('Senha deve ter no mínimo 6 caracteres'); return }
    setCriando(true)
    setCriarErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/pos/requisicoes/criar-usuario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim().toLowerCase(),
          funcao: novoFuncao.trim(),
          senha: novoSenha,
          modulos_permitidos: novoModulos,
        }),
      })
      const result = await res.json()
      if (!res.ok) { setCriarErro(result.error || 'Erro ao criar usuário'); setCriando(false); return }
      setShowNovoUsuario(false)
      setNovoNome(''); setNovoEmail(''); setNovoSenha('nova123'); setNovoFuncao(''); setNovoModulos([])
      await carregar()
    } catch (err: any) {
      setCriarErro(err.message || 'Erro desconhecido')
    } finally {
      setCriando(false)
    }
  }

  const matchBusca = (u: Usuario) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.funcao?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  // ativo === false é inativo; true/undefined = ativo (antes de rodar o SQL todos são ativos)
  const filteredUsuarios = usuarios.filter(u => u.ativo !== false && matchBusca(u))
  const inativosFiltrados = usuarios.filter(u => u.ativo === false && matchBusca(u))

  if (loadingPerm || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '3px' }}>CARREGANDO...</p>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, sans-serif', background: 'var(--portal-bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield size={24} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--portal-text)', margin: 0 }}>
              Administração
            </h2>
            <p style={{ fontSize: '14px', color: '#a3a3a3', margin: 0 }}>
              Gerencie os acessos e permissões dos usuários do portal
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {[
          { label: 'TOTAL USUÁRIOS', value: usuarios.length, icon: <Users size={20} /> },
          { label: 'ADMINISTRADORES', value: Object.values(permissoes).filter(p => p.is_admin).length, icon: <Shield size={20} /> },
          { label: 'MECÂNICOS APP', value: Object.values(permissoes).filter(p => p.mecanico_role).length, icon: <Wrench size={20} /> },
          { label: 'SEM ACESSO', value: usuarios.filter(u => !permissoes[u.id] || (permissoes[u.id].modulos_permitidos || []).length === 0).length, icon: <Lock size={20} /> },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px', borderRadius: '16px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626'
              }}>
                {stat.icon}
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', marginBottom: '2px' }}>{stat.label}</p>
                <p style={{ fontSize: '22px', fontWeight: '800', color: 'var(--portal-text)' }}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Novo Usuário */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', width: '360px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
          <input
            type="text"
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 40px', borderRadius: '12px',
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)',
              fontSize: '14px', outline: 'none', fontFamily: 'Inter'
            }}
          />
        </div>
        <button
          onClick={() => { setShowNovoUsuario(true); setCriarErro('') }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
            fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <UserPlus size={18} /> Novo Usuário
        </button>
      </div>

      {/* Modal Criar Usuário */}
      {showNovoUsuario && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !criando) setShowNovoUsuario(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: 'var(--portal-bg-card)', borderRadius: '24px', width: '560px',
            padding: '40px', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <UserPlus size={22} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>Novo Usuário</h3>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Criar conta de acesso ao portal</p>
                </div>
              </div>
              {!criando && (
                <button onClick={() => setShowNovoUsuario(false)} style={{
                  background: '#f5f5f5', border: 'none', borderRadius: '10px',
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#737373'
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Campos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>NOME COMPLETO *</label>
                <input
                  value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: '12px',
                    border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                    outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>EMAIL *</label>
                  <input
                    value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
                    type="email" placeholder="email@empresa.com"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>FUNÇÃO</label>
                  <input
                    value={novoFuncao} onChange={e => setNovoFuncao(e.target.value)}
                    placeholder="Ex: Vendedor"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>SENHA</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={novoSenha} onChange={e => setNovoSenha(e.target.value)}
                    type={showSenha ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    style={{
                      width: '100%', padding: '12px 48px 12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button" onClick={() => setShowSenha(!showSenha)}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#a3a3a3',
                      display: 'flex', padding: '4px'
                    }}
                  >
                    {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', margin: '4px 0 0 0' }}>Padrão: nova123</p>
              </div>
            </div>

            {/* Módulos de acesso */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px' }}>MÓDULOS DE ACESSO</label>
                <button
                  onClick={() => setNovoModulos(prev => MODULOS.every(m => prev.includes(m.id)) ? [] : MODULOS.map(m => m.id))}
                  style={{
                    fontSize: '11px', fontWeight: '600', color: '#dc2626', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '2px 6px'
                  }}
                >
                  {MODULOS.every(m => novoModulos.includes(m.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <PermissoesModulos
                modulos={novoModulos}
                catalogo={MODULOS}
                onChange={setNovoModulos}
              />
            </div>

            {/* Erro */}
            {criarErro && (
              <div style={{
                padding: '10px 16px', borderRadius: '10px', marginBottom: '16px',
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: '13px', color: '#dc2626', fontWeight: '500'
              }}>
                {criarErro}
              </div>
            )}

            {/* Botão */}
            <button
              onClick={criarUsuario}
              disabled={criando}
              style={{
                width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                background: criando ? '#a3a3a3' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#fff', fontSize: '15px', fontWeight: '700',
                cursor: criando ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: criando ? 'none' : '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.2s'
              }}
            >
              <UserPlus size={18} />
              {criando ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div style={{
        borderRadius: '20px', overflow: 'hidden',
        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) 120px 150px 200px 80px 130px',
          padding: '16px 24px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)',
          fontSize: '11px', fontWeight: '700', color: '#a3a3a3', letterSpacing: '1px'
        }}>
          <span>USUÁRIO</span>
          <span>ADMIN</span>
          <span>CATEGORIA</span>
          <span>APP MECÂNICOS</span>
          <span style={{ textAlign: 'center' }}>TODOS</span>
          <span style={{ textAlign: 'center' }}>AÇÕES</span>
        </div>

        {/* Table Rows */}
        {filteredUsuarios.map((user) => {
          const perm = permissoes[user.id]
          const isSaving = saving === user.id
          const isMe = user.id === userProfile?.id
          const modulos = perm?.modulos_permitidos || []

          const expandido = expandidoUsuario.has(user.id)
          const qtdAcessos = new Set(modulos.map(m => m.split(':')[0])).size

          return (
            <div
              key={user.id}
              style={{
                borderBottom: '1px solid #f5f5f5', transition: '0.15s',
                opacity: isSaving ? 0.6 : 1,
                background: perm?.is_admin ? '#fffbeb' : (expandido ? 'var(--portal-bg-secondary)' : 'var(--portal-bg-card)')
              }}
            >
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) 120px 150px 200px 80px 130px',
              padding: '16px 24px', alignItems: 'center'
            }}>
              {/* User Info + expandir permissões */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <button
                  onClick={() => toggleExpandirUsuario(user.id)}
                  title={expandido ? 'Recolher permissões' : 'Expandir permissões'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
                >
                  {expandido ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                  onClick={() => openUserDetail(user)}
                  title="Ver atividades deste usuário"
                >
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px', overflow: 'hidden',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <UserIcon size={18} color="#fff" />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--portal-text)', marginBottom: '1px' }}>
                      {user.nome} {isMe && <span style={{ fontSize: '10px', color: '#a3a3a3' }}>(você)</span>}
                    </p>
                    <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '500' }}>
                      {user.funcao}
                      {!perm?.is_admin && qtdAcessos > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}> · {qtdAcessos} módulo{qtdAcessos > 1 ? 's' : ''}</span>}
                    </p>
                    {user.email && <p style={{ fontSize: '10px', color: '#b0b0b0', fontWeight: '400' }}>{user.email}</p>}
                  </div>
                </div>
              </div>

              {/* Nível de acesso: Usuário / Admin / Dev (dropdown) */}
              {(() => {
                const nivelAtual = perm?.is_dev ? 'dev' : perm?.is_admin ? 'admin' : 'usuario'
                const devLock = !isDev && nivelAtual === 'dev'
                const bloqueado = isMe || devLock
                const cor = nivelAtual === 'dev'
                  ? { bg: '#1e293b', fg: '#fff', bd: '#1e293b' }
                  : nivelAtual === 'admin'
                    ? { bg: '#fef3c7', fg: '#d97706', bd: '#fde68a' }
                    : { bg: '#fff', fg: '#737373', bd: '#e5e5e5' }
                return (
                  <select
                    value={nivelAtual}
                    onChange={(e) => { if (!bloqueado) setNivel(user.id, e.target.value) }}
                    disabled={bloqueado}
                    title={isMe ? 'Não pode alterar o seu próprio nível' : (devLock ? 'Só um Dev pode alterar um Dev' : '')}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', border: `1px solid ${cor.bd}`,
                      background: cor.bg, color: cor.fg, fontSize: '12px', fontWeight: '700',
                      cursor: bloqueado ? 'not-allowed' : 'pointer', outline: 'none',
                      opacity: bloqueado ? 0.8 : 1
                    }}
                  >
                    <option value="usuario" style={{ background: '#fff', color: '#111' }}>Usuário</option>
                    <option value="admin" style={{ background: '#fff', color: '#111' }}>Admin</option>
                    {(isDev || perm?.is_dev) && <option value="dev" style={{ background: '#fff', color: '#111' }}>Dev</option>}
                  </select>
                )
              })()}

              {/* Categoria */}
              <div>
                <select
                  value={perm?.categoria || ''}
                  onChange={(e) => setCategoria(user.id, e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px',
                    border: '1px solid #e5e5e5', background: '#fff',
                    fontSize: '12px', fontWeight: '600', color: '#525252',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIAS.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* App Mecânicos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <select
                  value={perm?.mecanico_role || ''}
                  onChange={(e) => setMecanicoRole(user.id, e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px',
                    border: '1px solid #e5e5e5',
                    background: perm?.mecanico_role === 'tecnico' ? '#dcfce7' : perm?.mecanico_role === 'observador' ? '#dbeafe' : '#fff',
                    fontSize: '11px', fontWeight: '700',
                    color: perm?.mecanico_role === 'tecnico' ? '#16a34a' : perm?.mecanico_role === 'observador' ? '#2563eb' : '#a3a3a3',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="">Sem acesso</option>
                  <option value="tecnico">Técnico</option>
                  <option value="observador">Observador</option>
                </select>

                {perm?.mecanico_role && perm?.mecanico_tecnico_nome && (
                  <span style={{
                    fontSize: '10px', fontWeight: '600', color: '#525252',
                    padding: '4px 8px', background: '#f5f5f5', borderRadius: '6px',
                  }}>
                    {perm.mecanico_tecnico_nome}
                  </span>
                )}
              </div>

              {/* Toggle All */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => toggleTodos(user.id)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    border: 'none', cursor: 'pointer', transition: '0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                    background: MODULOS.every(m => modulos.includes(m.id)) ? '#dcfce7' : '#f5f5f5',
                    color: MODULOS.every(m => modulos.includes(m.id)) ? '#16a34a' : '#a3a3a3'
                  }}
                >
                  {MODULOS.every(m => modulos.includes(m.id)) ? <Check size={18} /> : <X size={18} />}
                </button>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (!user.email) { alert('Usuário sem email cadastrado'); return }
                    if (confirm(`Enviar email de redefinição de senha para ${user.email}?`)) {
                      resetarSenha(user.email)
                    }
                  }}
                  title={user.email ? `Resetar senha de ${user.email}` : 'Sem email'}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', width: '100%', justifyContent: 'center',
                    border: '1px solid #e5e5e5', background: 'var(--portal-bg-secondary)',
                    color: '#525252', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', transition: '0.15s',
                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <Mail size={13} /> Resetar
                </button>
                <button
                  onClick={() => { if (!isMe && confirm(`Inativar ${user.nome}? Ele não conseguirá entrar e some das listas, mas os dados ficam.`)) toggleAtivo(user.id, false) }}
                  disabled={isMe}
                  title={isMe ? 'Você não pode inativar a própria conta' : `Inativar ${user.nome}`}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', width: '100%', justifyContent: 'center',
                    border: '1px solid #fecaca', background: '#fef2f2',
                    color: '#dc2626', fontSize: '11px', fontWeight: '600',
                    cursor: isMe ? 'not-allowed' : 'pointer', transition: '0.15s', opacity: isMe ? 0.5 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <Ban size={13} /> Inativar
                </button>
              </div>
            </div>

            {expandido && (
              <div style={{ padding: '2px 24px 18px 56px' }}>
                {perm?.is_admin && (
                  <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={13} /> {perm?.is_dev ? 'Dev' : 'Admin'} já tem acesso a tudo — as marcações abaixo só valem se virar Usuário.
                  </div>
                )}
                <PermissoesModulos
                  modulos={modulos}
                  catalogo={MODULOS}
                  disabled={saving === user.id}
                  onChange={(novo) => salvar(user.id, { modulos_permitidos: novo })}
                />
              </div>
            )}
            </div>
          )
        })}

        {filteredUsuarios.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a3a3a3', fontSize: '14px' }}>
            Nenhum usuário encontrado
          </div>
        )}
      </div>

      {/* ===== Seção: Usuários Inativos ===== */}
      {inativosFiltrados.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ban size={16} color="#a3a3a3" />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text-secondary)', margin: 0 }}>
              Inativos
            </h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a3a3a3', background: 'var(--portal-bg-secondary)', padding: '2px 10px', borderRadius: 10 }}>
              {inativosFiltrados.length}
            </span>
          </div>
          <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
            {inativosFiltrados.map(user => {
              const isSaving = saving === user.id
              return (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #f5f5f5', opacity: isSaving ? 0.6 : 0.85 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden', background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, filter: 'grayscale(1)' }}>
                    {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={16} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-secondary)', margin: 0 }}>
                      {user.nome} <span style={{ fontSize: 10, fontWeight: 700, color: '#a3a3a3', background: 'var(--portal-bg-secondary)', padding: '1px 7px', borderRadius: 5, marginLeft: 6 }}>INATIVO</span>
                    </p>
                    <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>{user.funcao}{user.email ? ` · ${user.email}` : ''}</p>
                  </div>
                  <button
                    onClick={() => toggleAtivo(user.id, true)}
                    title={`Reativar ${user.nome}`}
                    style={{
                      padding: '7px 14px', borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4',
                      color: '#16a34a', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <RotateCcw size={14} /> Reativar
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal de Atividades do Usuário */}
      {selectedUser && (() => {
        const perm = permissoes[selectedUser.id]
        // Agrupar logs por sistema
        const logsBySistema: Record<string, AuditEntry[]> = {}
        for (const log of userLogs) {
          const key = log.sistema || 'outros'
          if (!logsBySistema[key]) logsBySistema[key] = []
          logsBySistema[key].push(log)
        }
        // Ordenar sistemas por quantidade de atividades (desc)
        const sistemas = Object.entries(logsBySistema).sort((a, b) => b[1].length - a[1].length)

        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedUser(null) }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)', zIndex: 50000,
              display: 'flex', justifyContent: 'flex-end'
            }}
          >
            <div style={{
              width: '680px', height: '100vh', background: 'var(--portal-bg-card)',
              boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.25s ease-out'
            }}>
              {/* Header */}
              <div style={{
                padding: '24px 28px', borderBottom: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-secondary)', flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button
                    onClick={() => setSelectedUser(null)}
                    style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#737373'
                    }}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px', overflow: 'hidden',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {selectedUser.avatar_url ? (
                      <img src={selectedUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <UserIcon size={22} color="#fff" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>
                      {selectedUser.nome}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>
                      {selectedUser.funcao || 'Sem função'} {selectedUser.email ? `· ${selectedUser.email}` : ''}
                    </p>
                  </div>
                  {perm?.is_admin && (
                    <span style={{
                      padding: '4px 12px', borderRadius: '8px',
                      background: '#fef3c7', color: '#d97706',
                      fontSize: '11px', fontWeight: '700'
                    }}>ADMIN</span>
                  )}
                </div>

                {/* Resumo rápido */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <div style={{
                    padding: '10px 16px', borderRadius: '10px',
                    background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', flex: 1
                  }}>
                    <p style={{ fontSize: '10px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '0.5px' }}>TOTAL AÇÕES</p>
                    <p style={{ fontSize: '20px', fontWeight: '800', color: 'var(--portal-text)' }}>{userLogs.length}</p>
                  </div>
                  <div style={{
                    padding: '10px 16px', borderRadius: '10px',
                    background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', flex: 1
                  }}>
                    <p style={{ fontSize: '10px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '0.5px' }}>MÓDULOS ATIVOS</p>
                    <p style={{ fontSize: '20px', fontWeight: '800', color: 'var(--portal-text)' }}>{(perm?.modulos_permitidos || []).length}</p>
                  </div>
                  <div style={{
                    padding: '10px 16px', borderRadius: '10px',
                    background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', flex: 1
                  }}>
                    <p style={{ fontSize: '10px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '0.5px' }}>ÚLTIMA AÇÃO</p>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--portal-text)', marginTop: '2px' }}>
                      {userLogs.length > 0 ? formatDateRelative(userLogs[0].created_at) : '—'}
                    </p>
                  </div>
                </div>

                {/* Resetar Senha */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                  <button
                    onClick={() => resetarSenha(selectedUser.email)}
                    disabled={resetandoSenha}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 20px', borderRadius: '10px', border: '1px solid #e5e5e5',
                      background: 'var(--portal-bg-card)', color: '#525252',
                      fontSize: '13px', fontWeight: '600', cursor: resetandoSenha ? 'not-allowed' : 'pointer',
                      opacity: resetandoSenha ? 0.6 : 1, transition: '0.2s'
                    }}
                  >
                    <Mail size={16} />
                    {resetandoSenha ? 'Enviando...' : 'Resetar Senha'}
                  </button>
                  {resetSenhaMsg && (
                    <span style={{
                      fontSize: '12px', fontWeight: '500',
                      color: resetSenhaMsg.startsWith('Erro') ? '#dc2626' : '#16a34a'
                    }}>
                      {resetSenhaMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Conteúdo scrollável */}
              <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
                {loadingLogs ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '2px' }}>CARREGANDO...</p>
                  </div>
                ) : userLogs.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <Activity size={36} color="#e5e5e5" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: '#a3a3a3', fontSize: '14px', fontWeight: '500' }}>Nenhuma atividade registrada</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sistemas.map(([sistemaKey, logs]) => {
                      const info = SISTEMAS_MAP[sistemaKey] || { label: sistemaKey, icon: 'settings' }
                      const icon = SISTEMA_ICON_MAP[info.icon] || <Activity size={16} />
                      const isExpanded = expandedSistema === sistemaKey

                      return (
                        <div key={sistemaKey} style={{
                          borderRadius: '14px', overflow: 'hidden',
                          border: '1px solid var(--portal-border)',
                          background: 'var(--portal-bg-card)'
                        }}>
                          {/* Cabeçalho do sistema */}
                          <button
                            onClick={() => setExpandedSistema(isExpanded ? null : sistemaKey)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '14px 18px', border: 'none', cursor: 'pointer',
                              background: isExpanded ? 'var(--portal-bg-secondary)' : 'transparent',
                              transition: 'background 0.15s'
                            }}
                          >
                            <span style={{ color: '#dc2626', display: 'flex' }}>{icon}</span>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--portal-text)', flex: 1, textAlign: 'left' }}>
                              {info.label}
                            </span>
                            <span style={{
                              padding: '3px 10px', borderRadius: '8px',
                              background: '#fef2f2', color: '#dc2626',
                              fontSize: '12px', fontWeight: '700'
                            }}>
                              {logs.length}
                            </span>
                            {isExpanded ? <ChevronUp size={16} color="#a3a3a3" /> : <ChevronDown size={16} color="#a3a3a3" />}
                          </button>

                          {/* Lista de atividades */}
                          {isExpanded && (
                            <div style={{ borderTop: '1px solid var(--portal-border)' }}>
                              {logs.slice(0, 50).map((entry, i) => {
                                const acaoStyle = ACAO_COLORS[entry.acao] || ACAO_COLORS.acesso
                                const detalhes = entry.detalhes && Object.keys(entry.detalhes).length > 0
                                  ? Object.entries(entry.detalhes)
                                      .map(([k, v]) => {
                                        if (k === 'campo') return `Campo: ${v}`
                                        if (k === 'de') return `De: ${v}`
                                        if (k === 'para') return `Para: ${v}`
                                        if (k === 'status') return `Status: ${v}`
                                        return `${k}: ${v}`
                                      })
                                      .join(' · ')
                                  : null

                                return (
                                  <div
                                    key={entry.id}
                                    style={{
                                      padding: '12px 18px',
                                      borderBottom: i < Math.min(logs.length, 50) - 1 ? '1px solid #f5f5f5' : 'none',
                                      display: 'flex', gap: '12px', alignItems: 'flex-start'
                                    }}
                                  >
                                    {/* Horário */}
                                    <div style={{ width: '80px', flexShrink: 0, paddingTop: '2px' }}>
                                      <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600' }}>
                                        {formatDateFull(entry.created_at)}
                                      </p>
                                    </div>

                                    {/* Ação badge */}
                                    <span style={{
                                      fontSize: '11px', fontWeight: '700',
                                      padding: '3px 10px', borderRadius: '6px',
                                      background: acaoStyle.bg, color: acaoStyle.text,
                                      border: `1px solid ${acaoStyle.border}`,
                                      flexShrink: 0, whiteSpace: 'nowrap'
                                    }}>
                                      {ACAO_LABELS[entry.acao] || entry.acao}
                                    </span>

                                    {/* Entidade + detalhes */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {entry.entidade_label ? (
                                        <p style={{ fontSize: '13px', color: 'var(--portal-text)', fontWeight: '500' }}>
                                          {entry.entidade_label}
                                          {entry.entidade_id && (
                                            <span style={{ color: '#a3a3a3', fontWeight: '400' }}> #{entry.entidade_id}</span>
                                          )}
                                        </p>
                                      ) : entry.entidade_id ? (
                                        <p style={{ fontSize: '13px', color: '#a3a3a3' }}>ID: {entry.entidade_id}</p>
                                      ) : null}
                                      {detalhes && (
                                        <p style={{
                                          fontSize: '11px', color: '#a3a3a3', marginTop: '2px',
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                          {detalhes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              {logs.length > 50 && (
                                <div style={{
                                  padding: '10px 18px', textAlign: 'center',
                                  fontSize: '12px', color: '#a3a3a3', fontWeight: '500',
                                  background: '#fafafa'
                                }}>
                                  Mostrando 50 de {logs.length} atividades
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* CSS Animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
